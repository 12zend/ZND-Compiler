import type { SB3Project, ExtractedProject, AssetReference, LoadedAssets, ScratchProjectJSON, AssetManifest } from '../types';
import { unzip } from '../utils/zip';
import { AssetCache } from './AssetCache';

const SCRATCH_API_BASE = 'https://projects.scratch.mit.edu';
const SCRATCH_CDN_BASE = 'https://assets.scratch.mit.edu';

const CORS_PROXIES = [
  '',
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
];

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

async function fetchWithCorsProxy(url: string, options: RequestInit = {}, timeout: number = DEFAULT_TIMEOUT): Promise<Response> {
  for (const proxy of CORS_PROXIES) {
    try {
      const targetUrl = proxy + encodeURIComponent(url);
      const response = await fetchWithTimeout(targetUrl, options, timeout);
      if (response.ok || response.status !== 0) {
        return response;
      }
    } catch (err) {
      console.warn(`Proxy ${proxy} failed:`, err);
    }
  }
  throw new ProjectLoadError('All CORS proxies failed', 0);
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

    let lastError: Error | null = null;
    const endpoints = [
      `${SCRATCH_API_BASE}/api/projects/${projectId}/`,
      `${SCRATCH_API_BASE}/internalapi/project/${projectId}/get/`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetchWithCorsProxy(endpoint, {
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'ZND-Compiler/1.0'
          }
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const projectJson = await response.json();
            return this.extractFromJSON(projectId, projectJson);
          }
        }

        if (response.status === 404) {
          throw new ProjectLoadError(`Project ${projectId} not found`, 404);
        }

        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        lastError = err as Error;
        console.warn(`Failed to fetch from ${endpoint}:`, err);
      }
    }

    throw new ProjectLoadError(
      `Could not connect to Scratch servers. The project may not exist, or there may be a network/CORS issue. Original error: ${lastError?.message || 'Unknown'}`,
      0
    );
  }

  async fetchByHash(projectHash: string): Promise<SB3Project> {
    const cached = await this.cache.getCompiled(projectHash);
    if (cached) return cached;

    const response = await fetchWithCorsProxy(`${SCRATCH_CDN_BASE}/internalapi/project/${projectHash}/get/`);
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
        const response = await fetchWithCorsProxy(
          `${SCRATCH_CDN_BASE}/internalapi/asset/${asset.md5ext}/get/`,
          {},
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
