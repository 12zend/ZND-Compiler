const DB_NAME = 'znd-compiler-cache';
const DB_VERSION = 1;
const STORE_COMPILED = 'compiledProjects';
const STORE_ASSETS = 'assets';
const STORE_META = 'metadata';
export class AssetCache {
    db = null;
    memoryCache = new Map();
    memoryCacheLimit = 50 * 1024 * 1024;
    memoryCacheSize = 0;
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_COMPILED)) {
                    const store = db.createObjectStore(STORE_COMPILED, { keyPath: 'id' });
                    store.createIndex('lastAccessed', 'lastAccessed');
                }
                if (!db.objectStoreNames.contains(STORE_ASSETS)) {
                    const store = db.createObjectStore(STORE_ASSETS, { keyPath: 'hash' });
                    store.createIndex('type', 'type');
                    store.createIndex('projectId', 'projectId');
                }
                if (!db.objectStoreNames.contains(STORE_META)) {
                    db.createObjectStore(STORE_META, { keyPath: 'projectId' });
                }
            };
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
        });
    }
    async getCompiled(id) {
        if (!this.db)
            await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_COMPILED, 'readonly');
            const store = tx.objectStore(STORE_COMPILED);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }
    async setCompiled(id, data) {
        if (!this.db)
            await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_COMPILED, 'readwrite');
            const store = tx.objectStore(STORE_COMPILED);
            const record = { id, ...data, lastAccessed: Date.now() };
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    async getAsset(hash) {
        if (this.memoryCache.has(hash)) {
            return this.memoryCache.get(hash);
        }
        if (!this.db)
            await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_ASSETS, 'readonly');
            const store = tx.objectStore(STORE_ASSETS);
            const request = store.get(hash);
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    this.addToMemoryCache(hash, result.data);
                    resolve(result.data);
                }
                else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
    async setAsset(hash, data) {
        this.addToMemoryCache(hash, data);
        if (!this.db)
            await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_ASSETS, 'readwrite');
            const store = tx.objectStore(STORE_ASSETS);
            const record = { hash, data, size: data.byteLength, lastAccessed: Date.now() };
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    addToMemoryCache(hash, data) {
        if (this.memoryCacheSize + data.byteLength > this.memoryCacheLimit) {
            this.evictMemoryCache();
        }
        this.memoryCache.set(hash, data);
        this.memoryCacheSize += data.byteLength;
    }
    evictMemoryCache() {
        const entries = Array.from(this.memoryCache.entries());
        const toRemove = entries.slice(0, Math.floor(entries.length * 0.3));
        for (const [hash, data] of toRemove) {
            this.memoryCache.delete(hash);
            this.memoryCacheSize -= data.byteLength;
        }
    }
    async clear() {
        if (!this.db)
            await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([STORE_COMPILED, STORE_ASSETS, STORE_META], 'readwrite');
            tx.objectStore(STORE_COMPILED).clear();
            tx.objectStore(STORE_ASSETS).clear();
            tx.objectStore(STORE_META).clear();
            tx.oncomplete = () => {
                this.memoryCache.clear();
                this.memoryCacheSize = 0;
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }
    async getStorageEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return { used: estimate.usage || 0, quota: estimate.quota || 0 };
        }
        return { used: 0, quota: 0 };
    }
}
export class LRUCache {
    cache = new Map();
    maxSize;
    constructor(maxSize) {
        this.maxSize = maxSize;
    }
    get(key) {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }
    has(key) {
        return this.cache.has(key);
    }
    clear() {
        this.cache.clear();
    }
    get size() {
        return this.cache.size;
    }
}
//# sourceMappingURL=AssetCache.js.map