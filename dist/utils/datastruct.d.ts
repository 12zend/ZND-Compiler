export declare class ObjectPool<T> {
    private pool;
    private active;
    private factory;
    private reset?;
    constructor(factory: () => T, reset?: (obj: T) => void);
    acquire(): T;
    release(obj: T): void;
    releaseAll(): void;
    get poolSize(): number;
    get activeCount(): number;
    prewarm(count: number): void;
}
export declare class FastMap<K, V> {
    private map;
    set(key: K, value: V): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    delete(key: K): boolean;
    forEach(callback: (value: V, key: K) => void): void;
    get size(): number;
    entries(): IterableIterator<[K, V]>;
}
export declare class StringInterner {
    private map;
    intern(str: string): string;
    get size(): number;
}
export declare function memoize<T extends (...args: any[]) => any>(fn: T, maxSize?: number): T;
export declare class RingBuffer<T> {
    private buffer;
    private head;
    private tail;
    private count;
    private capacity;
    constructor(capacity: number);
    push(item: T): void;
    pop(): T | undefined;
    peek(): T | undefined;
    get length(): number;
    clear(): void;
}
export declare function clamp(value: number, min: number, max: number): number;
export declare function lerp(a: number, b: number, t: number): number;
export declare function degToRad(deg: number): number;
export declare function radToDeg(rad: number): number;
export declare function randomInt(min: number, max: number): number;
export declare function shuffle<T>(array: T[]): T[];
//# sourceMappingURL=datastruct.d.ts.map