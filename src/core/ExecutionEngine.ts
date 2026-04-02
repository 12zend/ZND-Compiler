import type { CompiledProgram, CompiledScript, IRSprite } from '../types/ir';
import type { LoadedAssets, PrimitiveValue } from '../types';
import { ObjectPool, FastMap, RingBuffer } from '../utils/datastruct';
import { WebGLRenderer } from '../renderer/WebGLRenderer';
import { Scheduler } from './Scheduler';
import { BroadcastSystem } from './BroadcastSystem';
import { CloneManager } from './CloneManager';

export interface RuntimeContext {
  sprites: Map<string, SpriteInstance>;
  variables: Map<string, PrimitiveValue>;
  lists: Map<string, PrimitiveValue[]>;
  broadcasts: BroadcastSystem;
  cloneManager: CloneManager;
  renderer: WebGLRenderer;
  scheduler: Scheduler;
  stopFlags: Set<string>;
}

export class SpriteInstance {
  id: string;
  name: string;
  x: number = 0;
  y: number = 0;
  direction: number = 90;
  size: number = 100;
  rotationStyle: 'all-around' | 'left-right' | 'don\'t rotate' = 'all-around';
  visible: boolean = true;
  draggable: boolean = false;
  costumeIndex: number = 0;
  layerOrder: number = 0;
  variables: Map<string, PrimitiveValue> = new Map();
  lists: Map<string, PrimitiveValue[]> = new Map();
  effects: Record<string, number> = {};
  isClone: boolean = false;
  cloneOrigin: string | null = null;

  private costume: HTMLImageElement | SVGElement | null = null;
  private rotationCenterX: number = 0;
  private rotationCenterY: number = 0;

  constructor(id: string, name: string, defaultX: number = 0, defaultY: number = 0) {
    this.id = id;
    this.name = name;
    this.x = defaultX;
    this.y = defaultY;
  }

  setCostume(indexOrName: number | string): void {
    if (typeof indexOrName === 'number') {
      this.costumeIndex = Math.max(0, indexOrName - 1);
    } else {
      this.costumeIndex = this.costumeIndex;
    }
  }

  nextCostume(): void {
    this.costumeIndex = (this.costumeIndex + 1) % 1;
  }

  move(steps: number): void {
    const rad = (this.direction - 90) * (Math.PI / 180);
    this.x += Math.cos(rad) * steps;
    this.y += Math.sin(rad) * steps;
  }

  gotoXY(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  glideTo(secs: number, x: number, y: number): void {
  }

  setEffect(effect: string, value: number): void {
    this.effects[effect] = value;
  }

  changeEffect(effect: string, delta: number): void {
    this.effects[effect] = (this.effects[effect] || 0) + delta;
  }

  clearEffects(): void {
    this.effects = {};
  }

  goToLayer(position: string): void {
    this.layerOrder = position === 'front' ? 9999 : -9999;
  }

  goInFrontOf(spriteId: string): void {
  }
}

export class ExecutionEngine {
  private program: CompiledProgram | null = null;
  private context: RuntimeContext | null = null;
  private running: boolean = false;
  private frameId: number = 0;
  private lastFrameTime: number = 0;
  private deltaTime: number = 0;
  private frameTime: number = 0;

  private spritePool: ObjectPool<SpriteInstance>;
  private assetPool: ObjectPool<any>;

  constructor() {
    this.spritePool = new ObjectPool<SpriteInstance>(
      () => new SpriteInstance('', ''),
      (sprite) => {
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
      }
    );

    this.assetPool = new ObjectPool<any>(() => ({}));
  }

  async load(program: CompiledProgram, assets: LoadedAssets, canvas: HTMLCanvasElement): Promise<void> {
    this.program = program;

    const renderer = new WebGLRenderer();
    const scheduler = new Scheduler();
    const broadcasts = new BroadcastSystem();
    const cloneManager = new CloneManager(this.spritePool);

    const variables = new Map<string, PrimitiveValue>();
    const lists = new Map<string, PrimitiveValue[]>();
    const sprites = new Map<string, SpriteInstance>();

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
      instance.rotationStyle = sprite.defaultRotationStyle as any;
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

    await renderer.init(canvas);
  }

  start(): void {
    if (!this.context || this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.executeFrame();
  }

  stop(): void {
    this.running = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
  }

  private executeFrame = (): void => {
    if (!this.running || !this.context) return;

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

  broadcast(message: string, args?: any[]): void {
    if (!this.context) return;
    this.context.broadcasts.send(message, args);
  }

  getContext(): RuntimeContext | null {
    return this.context;
  }

  getSprite(nameOrId: string): SpriteInstance | undefined {
    if (!this.context) return undefined;
    return this.context.sprites.get(nameOrId);
  }

  setVariable(nameOrId: string, value: PrimitiveValue): void {
    if (!this.context) return;
    this.context.variables.set(nameOrId, value);
  }

  getVariable(nameOrId: string): PrimitiveValue {
    if (!this.context) return null;
    return this.context.variables.get(nameOrId) ?? null;
  }
}

export const executionEngine = new ExecutionEngine();
