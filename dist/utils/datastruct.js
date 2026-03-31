export class ObjectPool {
    pool = [];
    active = new Set();
    factory;
    reset;
    constructor(factory, reset) {
        this.factory = factory;
        this.reset = reset;
    }
    acquire() {
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        }
        else {
            obj = this.factory();
        }
        this.active.add(obj);
        return obj;
    }
    release(obj) {
        if (!this.active.has(obj))
            return;
        this.active.delete(obj);
        if (this.reset) {
            this.reset(obj);
        }
        this.pool.push(obj);
    }
    releaseAll() {
        for (const obj of this.active) {
            if (this.reset)
                this.reset(obj);
            this.pool.push(obj);
        }
        this.active.clear();
    }
    get poolSize() {
        return this.pool.length;
    }
    get activeCount() {
        return this.active.size;
    }
    prewarm(count) {
        for (let i = 0; i < count; i++) {
            this.pool.push(this.factory());
        }
    }
}
export class FastMap {
    map = new Map();
    set(key, value) {
        this.map.set(key, value);
    }
    get(key) {
        return this.map.get(key);
    }
    has(key) {
        return this.map.has(key);
    }
    delete(key) {
        return this.map.delete(key);
    }
    forEach(callback) {
        this.map.forEach(callback);
    }
    get size() {
        return this.map.size;
    }
    entries() {
        return this.map.entries();
    }
}
export class StringInterner {
    map = new Map();
    intern(str) {
        let result = this.map.get(str);
        if (result === undefined) {
            this.map.set(str, str);
            result = str;
        }
        return result;
    }
    get size() {
        return this.map.size;
    }
}
export function memoize(fn, maxSize = 1024) {
    const cache = new Map();
    return ((...args) => {
        const key = JSON.stringify(args);
        let result = cache.get(key);
        if (result === undefined) {
            result = fn(...args);
            if (cache.size >= maxSize) {
                const firstKey = cache.keys().next().value;
                cache.delete(firstKey);
            }
            cache.set(key, result);
        }
        return result;
    });
}
export class RingBuffer {
    buffer;
    head = 0;
    tail = 0;
    count = 0;
    capacity;
    constructor(capacity) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
    }
    push(item) {
        this.buffer[this.tail] = item;
        this.tail = (this.tail + 1) % this.capacity;
        if (this.count < this.capacity) {
            this.count++;
        }
        else {
            this.head = (this.head + 1) % this.capacity;
        }
    }
    pop() {
        if (this.count === 0)
            return undefined;
        const item = this.buffer[this.head];
        this.buffer[this.head] = undefined;
        this.head = (this.head + 1) % this.capacity;
        this.count--;
        return item;
    }
    peek() {
        return this.count > 0 ? this.buffer[this.head] : undefined;
    }
    get length() {
        return this.count;
    }
    clear() {
        this.buffer = new Array(this.capacity);
        this.head = 0;
        this.tail = 0;
        this.count = 0;
    }
}
export function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function degToRad(deg) {
    return deg * (Math.PI / 180);
}
export function radToDeg(rad) {
    return rad * (180 / Math.PI);
}
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
//# sourceMappingURL=datastruct.js.map