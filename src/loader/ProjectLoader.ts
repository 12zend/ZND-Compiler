import type { SB3Project, ExtractedProject, AssetReference, LoadedAssets, ScratchProjectJSON, AssetManifest } from '../types';
import { unzip } from '../utils/zip';
import { AssetCache } from './AssetCache';

export class ProjectLoader {
  private cache: AssetCache;

  constructor(cache?: AssetCache) {
    this.cache = cache || new AssetCache();
  }

  async loadFromFile(file: File): Promise<SB3Project> {
    const arrayBuffer = await file.arrayBuffer();
    return this.extractFromBuffer(file.name, arrayBuffer);
  }

  async loadFromArrayBuffer(buffer: ArrayBuffer, id: string = 'upload'): Promise<SB3Project> {
    return this.extractFromBuffer(id, buffer);
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
