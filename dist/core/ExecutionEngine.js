import { ObjectPool } from '../utils/datastruct';
import { WebGLRenderer } from '../renderer/WebGLRenderer';
import { Scheduler } from './Scheduler';
import { BroadcastSystem } from './BroadcastSystem';
import { CloneManager } from './CloneManager';
export class SpriteInstance {
    id;
    name;
    x = 0;
    y = 0;
    direction = 90;
    size = 100;
    rotationStyle = 'all-around';
    visible = true;
    draggable = false;
    costumeIndex = 0;
    layerOrder = 0;
    variables = new Map();
    lists = new Map();
    effects = {};
    isClone = false;
    cloneOrigin = null;
    costume = null;
    rotationCenterX = 0;
    rotationCenterY = 0;
    constructor(id, name, defaultX = 0, defaultY = 0) {
        this.id = id;
        this.name = name;
        this.x = defaultX;
        this.y = defaultY;
    }
    setCostume(indexOrName) {
        if (typeof indexOrName === 'number') {
            this.costumeIndex = Math.max(0, indexOrName - 1);
        }
        else {
            this.costumeIndex = this.costumeIndex;
        }
    }
    nextCostume() {
        this.costumeIndex = (this.costumeIndex + 1) % 1;
    }
    move(steps) {
        const rad = (this.direction - 90) * (Math.PI / 180);
        this.x += Math.cos(rad) * steps;
        this.y += Math.sin(rad) * steps;
    }
    gotoXY(x, y) {
        this.x = x;
        this.y = y;
    }
    glideTo(secs, x, y) {
    }
    setEffect(effect, value) {
        this.effects[effect] = value;
    }
    changeEffect(effect, delta) {
        this.effects[effect] = (this.effects[effect] || 0) + delta;
    }
    clearEffects() {
        this.effects = {};
    }
    goToLayer(position) {
        this.layerOrder = position === 'front' ? 9999 : -9999;
    }
    goInFrontOf(spriteId) {
    }
}
export class ExecutionEngine {
    program = null;
    context = null;
    running = false;
    frameId = 0;
    lastFrameTime = 0;
    deltaTime = 0;
    frameTime = 0;
    spritePool;
    assetPool;
    constructor() {
        this.spritePool = new ObjectPool(() => new SpriteInstance('', ''), (sprite) => {
            sprite.x = 0;
            sprite.y = 0;
            sprite.direction = 90;
            sprite.size = 100;
            sprite.visible = true;
            sprite.costumeIndex = 0;
            sprite.layerOrder = 0;
            sprite.effects = {};
            sprite.isClone = false;
            sprite.cloneOrigin = null;
            sprite.variables.clear();
            sprite.lists.clear();
        });
        this.assetPool = new ObjectPool(() => ({}));
    }
    async load(program, assets) {
        this.program = program;
        const renderer = new WebGLRenderer();
        const scheduler = new Scheduler();
        const broadcasts = new BroadcastSystem();
        const cloneManager = new CloneManager(this.spritePool);
        const variables = new Map();
        const lists = new Map();
        const sprites = new Map();
        for (const [id, variable] of program.ir.globalVariables) {
            variables.set(id, variable.value);
        }
        for (const [id, list] of program.ir.globalLists) {
            lists.set(id, [...list.contents]);
        }
        for (const sprite of program.ir.orderedSprites) {
            const instance = this.spritePool.acquire();
            instance.name = sprite.name;
            instance.id = sprite.id;
            instance.x = sprite.defaultX;
            instance.y = sprite.defaultY;
            instance.direction = sprite.defaultDirection;
            instance.size = sprite.defaultSize;
            instance.rotationStyle = sprite.defaultRotationStyle;
            instance.visible = sprite.defaultVisible;
            instance.draggable = sprite.defaultDraggable;
            for (const [id, variable] of sprite.variables) {
                instance.variables.set(id, variable.value);
            }
            sprites.set(sprite.id, instance);
        }
        this.context = {
            sprites,
            variables,
            lists,
            broadcasts,
            cloneManager,
            renderer,
            scheduler,
            stopFlags: new Set()
        };
        await renderer.init(document.createElement('canvas'));
    }
    start() {
        if (!this.context || this.running)
            return;
        this.running = true;
        this.lastFrameTime = performance.now();
        this.executeFrame();
    }
    stop() {
        this.running = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
        }
    }
    executeFrame = () => {
        if (!this.running || !this.context)
            return;
        const now = performance.now();
        this.deltaTime = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        this.frameTime += this.deltaTime;
        this.context.scheduler.processFrame(this.deltaTime);
        this.context.renderer.clear();
        const sortedSprites = Array.from(this.context.sprites.values())
            .sort((a, b) => a.layerOrder - b.layerOrder);
        for (const sprite of sortedSprites) {
            if (sprite.visible) {
                this.context.renderer.renderSprite(sprite);
            }
        }
        this.frameId = requestAnimationFrame(this.executeFrame);
    };
    broadcast(message, args) {
        if (!this.context)
            return;
        this.context.broadcasts.send(message, args);
    }
    getContext() {
        return this.context;
    }
    getSprite(nameOrId) {
        if (!this.context)
            return undefined;
        return this.context.sprites.get(nameOrId);
    }
    setVariable(nameOrId, value) {
        if (!this.context)
            return;
        this.context.variables.set(nameOrId, value);
    }
    getVariable(nameOrId) {
        if (!this.context)
            return null;
        return this.context.variables.get(nameOrId) ?? null;
    }
}
export const executionEngine = new ExecutionEngine();
//# sourceMappingURL=ExecutionEngine.js.map