export declare class AssetCache {
    private db;
    private memoryCache;
    private memoryCacheLimit;
    private memoryCacheSize;
    init(): Promise<void>;
    getCompiled(id: string): Promise<any | null>;
    setCompiled(id: string, data: any): Promise<void>;
    getAsset(hash: string): Promise<ArrayBuffer | null>;
    setAsset(hash: string, data: ArrayBuffer): Promise<void>;
    private addToMemoryCache;
    private evictMemoryCache;
    clear(): Promise<void>;
    getStorageEstimate(): Promise<{
        used: number;
        quota: number;
    }>;
}
export declare class LRUCache<K, V> {
    private cache;
    private maxSize;
    constructor(maxSize: number);
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    has(key: K): boolean;
    clear(): void;
    get size(): number;
}
//# sourceMappingURL=AssetCache.d.ts.map