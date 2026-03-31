import type { SB3Project, ExtractedProject, AssetReference, LoadedAssets, ScratchProjectJSON, AssetManifest } from '../types';
import { unzip } from '../utils/zip';
import { AssetCache } from './AssetCache';

const DEMO_PROJECT_URL = 'https://raw.githubusercontent.com/LLK/scratch-vm/develop/test/fixtures/cat.sprite3';

const TRAMPOLINE_BASE = 'https://trampoline.turbowarp.org';
const SCRATCH_API_BASE = 'https://projects.scratch.mit.edu';
const SCRATCH_CDN_BASE = 'https://assets.scratch.mit.edu';

const DEFAULT_TIMEOUT = 30000;
const ASSET_TIMEOUT = 10000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ProjectLoadError(`Request timeout for ${url}`, 408);
    }
    throw err;
  }
}

export class ProjectLoader {
  private cache: AssetCache;

  constructor(cache?: AssetCache) {
    this.cache = cache || new AssetCache();
  }

  async fetch(projectId: string): Promise<SB3Project> {
    const cached = await this.cache.getCompiled(projectId);
    if (cached) {
      return cached;
    }

    const endpoints = [
      `${TRAMPOLINE_BASE}/project/${projectId}`,
      `${SCRATCH_API_BASE}/api/projects/${projectId}/`,
      `${SCRATCH_API_BASE}/internalapi/project/${projectId}/get/`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetchWithTimeout(endpoint, {
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://scratch.mit.edu/'
          }
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const projectJson = await response.json();
            return this.extractFromJSON(projectId, projectJson);
          } else {
            const arrayBuffer = await response.arrayBuffer();
            return this.extractFromBuffer(projectId, arrayBuffer);
          }
        }

        if (response.status === 404) {
          throw new ProjectLoadError(`Project ${projectId} not found`, 404);
        }
      } catch (err) {
        console.warn(`Failed to fetch from ${endpoint}:`, err);
      }
    }

    console.warn('Scratch API failed, falling back to demo project');
    return this.fetchDemoProject();
  }

  private async fetchDemoProject(): Promise<SB3Project> {
    const response = await fetchWithTimeout(DEMO_PROJECT_URL, {}, 15000);
    if (!response.ok) {
      throw new ProjectLoadError('Could not load demo project', 0);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return this.extractFromBuffer('demo', arrayBuffer);
  }

  async fetchByHash(projectHash: string): Promise<SB3Project> {
    const cached = await this.cache.getCompiled(projectHash);
    if (cached) return cached;

    const response = await fetchWithTimeout(`${TRAMPOLINE_BASE}/project/${projectHash}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://scratch.mit.edu/'
      }
    });
    if (!response.ok) {
      throw new ProjectLoadError(`Failed to fetch project hash ${projectHash}`, response.status);
    }

    const arrayBuffer = await response.arrayBuffer();
    return this.extractFromBuffer(projectHash, arrayBuffer);
  }

  private async extractFromJSON(id: string, json: ScratchProjectJSON): Promise<SB3Project> {
    const project: SB3Project = {
      id,
      json,
      assets: new Map(),
      thumbnail: undefined
    };

    const assetManifest = this.createAssetManifest(json);
    await this.loadAssets(project, assetManifest);

    await this.cache.setCompiled(id, project);
    return project;
  }

  private async extractFromBuffer(id: string, buffer: ArrayBuffer): Promise<SB3Project> {
    const extracted = await unzip(buffer);
    const projectJsonFile = extracted.files.find(f => f.name === 'project.json');
    
    if (!projectJsonFile) {
      throw new ProjectLoadError('Invalid SB3: project.json not found', 0);
    }

    const json: ScratchProjectJSON = JSON.parse(projectJsonFile.content as string);
    const project: SB3Project = { id, json, assets: new Map() };

    for (const file of extracted.files) {
      if (file.name !== 'project.json' && file.content) {
        const key = file.name.replace(/^.*\//, '');
        project.assets.set(key, file.content as ArrayBuffer);
      }
    }

    await this.cache.setCompiled(id, project);
    return project;
  }

  private createAssetManifest(json: ScratchProjectJSON): AssetManifest {
    const costumes: AssetReference[] = [];
    const sounds: AssetReference[] = [];
    let totalSize = 0;

    for (const target of json.targets) {
      for (const costume of target.costumes) {
        costumes.push({
          id: costume.assetId,
          name: costume.name,
          type: 'costume',
          md5ext: costume.md5ext,
          dataFormat: costume.dataFormat,
          rotationCenterX: costume.rotationCenterX,
          rotationCenterY: costume.rotationCenterY
        });
      }

      for (const sound of target.sounds) {
        sounds.push({
          id: sound.assetId,
          name: sound.name,
          type: 'sound',
          md5ext: sound.md5ext,
          dataFormat: sound.dataFormat
        });
      }
    }

    return { costumes, sounds, totalSize };
  }

  private async loadAssets(project: SB3Project, manifest: AssetManifest): Promise<void> {
    const loadCostume = async (asset: AssetReference): Promise<void> => {
      const cached = await this.cache.getAsset(asset.md5ext);
      if (cached) {
        project.assets.set(asset.md5ext, cached);
        return;
      }

      try {
        const response = await fetchWithTimeout(
          `${TRAMPOLINE_BASE}/asset/${asset.md5ext}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://scratch.mit.edu/'
            }
          },
          ASSET_TIMEOUT
        );
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          project.assets.set(asset.md5ext, buffer);
          await this.cache.setAsset(asset.md5ext, buffer);
        }
      } catch (err) {
        console.warn(`Failed to load asset ${asset.md5ext}:`, err);
      }
    };

    const promises = manifest.costumes.map(loadCostume);
    await Promise.all(promises);
  }

  async preloadAssets(manifest: AssetManifest, onProgress?: (loaded: number, total: number) => void): Promise<LoadedAssets> {
    const loaded: LoadedAssets = {
      costumes: new Map(),
      sounds: new Map(),
      vectors: new Map()
    };

    let loadedCount = 0;
    const total = manifest.costumes.length + manifest.sounds.length;

    const loadCostumeImage = async (asset: AssetReference): Promise<void> => {
      const buffer = await this.cache.getAsset(asset.md5ext);
      if (!buffer) return;

      if (asset.dataFormat === 'svg') {
        const blob = new Blob([buffer], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => { loaded.costumes.set(asset.id, img); resolve(); };
          img.onerror = reject;
          img.src = url;
        });
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([buffer], { type: `image/${asset.dataFormat}` });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => { loaded.costumes.set(asset.id, img); resolve(); };
          img.onerror = reject;
          img.src = url;
        });
        URL.revokeObjectURL(url);
      }

      loadedCount++;
      onProgress?.(loadedCount, total);
    };

    await Promise.all(manifest.costumes.map(loadCostumeImage));
    return loaded;
  }

  extract(project: ArrayBuffer | Blob): Promise<SB3Project> {
    return this.extractFromBuffer('temp', project as ArrayBuffer);
  }
}

export class ProjectLoadError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'ProjectLoadError';
  }
}

export { AssetCache } from './AssetCache';
