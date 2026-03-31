import type { SB3Project, LoadedAssets, AssetManifest } from '../types';
import { AssetCache } from './AssetCache';
export declare class ProjectLoader {
    private cache;
    constructor(cache?: AssetCache);
    fetch(projectId: string): Promise<SB3Project>;
    fetchByHash(projectHash: string): Promise<SB3Project>;
    private extractFromJSON;
    private extractFromBuffer;
    private createAssetManifest;
    private loadAssets;
    preloadAssets(manifest: AssetManifest, onProgress?: (loaded: number, total: number) => void): Promise<LoadedAssets>;
    extract(project: ArrayBuffer | Blob): Promise<SB3Project>;
}
export declare class ProjectLoadError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number);
}
export { AssetCache } from './AssetCache';
//# sourceMappingURL=ProjectLoader.d.ts.map