import type { CompiledProgram, IRCostume } from '../types/ir';
import type { LoadedAssets, PrimitiveValue } from '../types';
import { ObjectPool } from '../utils/datastruct';
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

export interface RuntimeCostume {
  id: string;
  name: string;
  assetRef: string;
  image: HTMLImageElement;
  width: number;
  height: number;
  rotationCenterX: number;
  rotationCenterY: number;
  bitmapResolution?: number;
}

export interface PenState {
  down: boolean;
  hue: number;
  saturation: number;
  lightness: number;
  transparency: number;
  size: number;
}

function createDefaultPenState(): PenState {
  return {
    down: false,
    hue: 240,
    saturation: 100,
    lightness: 50,
    transparency: 0,
    size: 1
  };
}

export class SpriteInstance {
  id: string;
  name: string;
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
  isStage: boolean = false;
  readonly pen: PenState = createDefaultPenState();

  private _x: number = 0;
  private _y: number = 0;
  private costumes: RuntimeCostume[] = [];
  private renderer: WebGLRenderer | null = null;

  constructor(id: string, name: string, defaultX: number = 0, defaultY: number = 0) {
    this.id = id;
    this.name = name;
    this._x = defaultX;
    this._y = defaultY;
  }

  get x(): number {
    return this._x;
  }

  set x(value: number) {
    this.updatePosition(value, this._y);
  }

  get y(): number {
    return this._y;
  }

  set y(value: number) {
    this.updatePosition(this._x, value);
  }

  get costumeName(): string {
    return this.getCurrentCostume()?.name ?? '';
  }

  attachRenderer(renderer: WebGLRenderer): void {
    this.renderer = renderer;
  }

  setRuntimeCostumes(costumes: RuntimeCostume[]): void {
    this.costumes = costumes;
    if (this.costumes.length === 0) {
      this.costumeIndex = 0;
      return;
    }
    this.costumeIndex = clampIndex(this.costumeIndex, this.costumes.length);
  }

  getCurrentCostume(): RuntimeCostume | null {
    if (this.costumes.length === 0) {
      return null;
    }
    const index = clampIndex(this.costumeIndex, this.costumes.length);
    return this.costumes[index] ?? null;
  }

  setCostume(indexOrName: number | string): void {
    if (this.costumes.length === 0) {
      this.costumeIndex = 0;
      return;
    }

    if (typeof indexOrName === 'number') {
      this.costumeIndex = clampIndex(Math.floor(indexOrName) - 1, this.costumes.length);
      return;
    }

    const normalized = String(indexOrName);
    const foundIndex = this.costumes.findIndex((costume) =>
      costume.name === normalized || costume.id === normalized || costume.assetRef === normalized
    );

    if (foundIndex !== -1) {
      this.costumeIndex = foundIndex;
    }
  }

  nextCostume(): void {
    if (this.costumes.length === 0) {
      return;
    }
    this.costumeIndex = (this.costumeIndex + 1) % this.costumes.length;
  }

  move(steps: number): void {
    const rad = (this.direction - 90) * (Math.PI / 180);
    this.gotoXY(
      this._x + Math.cos(rad) * steps,
      this._y + Math.sin(rad) * steps
    );
  }

  gotoXY(x: number, y: number): void {
    this.updatePosition(x, y);
  }

  glideTo(_secs: number, x: number, y: number): void {
    this.gotoXY(x, y);
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

  goInFrontOf(_spriteId: string): void {
  }

  penDown(): void {
    this.pen.down = true;
  }

  penUp(): void {
    this.pen.down = false;
  }

  clearPen(): void {
    this.renderer?.clearPenLayer();
  }

  stamp(): void {
    if (!this.renderer) {
      return;
    }
    this.renderer.stampSprite(this);
  }

  setPenColor(color: string): void {
    const hsl = hexToHsl(color);
    if (!hsl) {
      return;
    }
    this.pen.hue = hsl.h;
    this.pen.saturation = hsl.s;
    this.pen.lightness = hsl.l;
  }

  changePenColor(delta: number): void {
    this.pen.hue = normalizeHue(this.pen.hue + delta);
  }

  setPenColorParam(param: string, value: number): void {
    switch (param.toLowerCase()) {
      case 'color':
        this.pen.hue = normalizeHue(value);
        break;
      case 'saturation':
        this.pen.saturation = clamp(value, 0, 100);
        break;
      case 'brightness':
        this.pen.lightness = clamp(value / 2, 0, 100);
        break;
      case 'transparency':
        this.pen.transparency = clamp(value, 0, 100);
        break;
    }
  }

  changePenColorParam(param: string, delta: number): void {
    switch (param.toLowerCase()) {
      case 'color':
        this.changePenColor(delta);
        break;
      case 'saturation':
        this.pen.saturation = clamp(this.pen.saturation + delta, 0, 100);
        break;
      case 'brightness':
        this.pen.lightness = clamp(this.pen.lightness + (delta / 2), 0, 100);
        break;
      case 'transparency':
        this.pen.transparency = clamp(this.pen.transparency + delta, 0, 100);
        break;
    }
  }

  setPenSize(size: number): void {
    this.pen.size = Math.max(1, size);
  }

  changePenSize(delta: number): void {
    this.pen.size = Math.max(1, this.pen.size + delta);
  }

  getPenCssColor(): string {
    const alpha = 1 - clamp(this.pen.transparency, 0, 100) / 100;
    return `hsla(${normalizeHue(this.pen.hue)}, ${clamp(this.pen.saturation, 0, 100)}%, ${clamp(this.pen.lightness, 0, 100)}%, ${alpha})`;
  }

  private updatePosition(nextX: number, nextY: number): void {
    const prevX = this._x;
    const prevY = this._y;

    this._x = nextX;
    this._y = nextY;

    if (!this.pen.down || !this.renderer) {
      return;
    }

    this.renderer.drawPenLine(prevX, prevY, nextX, nextY, this.pen);
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
        sprite.direction = 90;
        sprite.size = 100;
        sprite.visible = true;
        sprite.costumeIndex = 0;
        sprite.layerOrder = 0;
        sprite.effects = {};
        sprite.isClone = false;
        sprite.cloneOrigin = null;
        sprite.isStage = false;
        sprite.pen.down = false;
        sprite.pen.hue = 240;
        sprite.pen.saturation = 100;
        sprite.pen.lightness = 50;
        sprite.pen.transparency = 0;
        sprite.pen.size = 1;
        sprite.variables.clear();
        sprite.lists.clear();
        sprite.setRuntimeCostumes([]);
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

    await renderer.init(canvas);

    for (const sprite of program.ir.orderedSprites) {
      const instance = this.spritePool.acquire();
      instance.name = sprite.name;
      instance.id = sprite.id;
      instance.isStage = sprite.isStage;
      instance.attachRenderer(renderer);
      instance.x = sprite.defaultX;
      instance.y = sprite.defaultY;
      instance.direction = sprite.defaultDirection;
      instance.size = sprite.defaultSize;
      instance.rotationStyle = sprite.defaultRotationStyle as SpriteInstance['rotationStyle'];
      instance.visible = sprite.defaultVisible;
      instance.draggable = sprite.defaultDraggable;
      instance.layerOrder = sprite.isStage ? -1 : 0;

      for (const [id, variable] of sprite.variables) {
        instance.variables.set(id, variable.value);
      }

      const runtimeCostumes = this.createRuntimeCostumes(sprite.costumes, assets);
      instance.setRuntimeCostumes(runtimeCostumes);
      instance.costumeIndex = clampIndex(sprite.defaultCostumeIndex, Math.max(runtimeCostumes.length, 1));

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
      if (!sprite.visible) {
        continue;
      }

      this.context.renderer.renderSprite(sprite);

      if (sprite.isStage) {
        this.context.renderer.renderPenLayer();
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

  private createRuntimeCostumes(costumes: IRCostume[], assets: LoadedAssets): RuntimeCostume[] {
    const runtimeCostumes: RuntimeCostume[] = [];

    for (const costume of costumes) {
      const image = assets.costumes.get(costume.assetRef);
      if (!image) {
        continue;
      }

      runtimeCostumes.push({
        id: costume.id,
        name: costume.name,
        assetRef: costume.assetRef,
        image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        rotationCenterX: costume.rotationCenterX,
        rotationCenterY: costume.rotationCenterY,
        bitmapResolution: costume.bitmapResolution
      });
    }

    return runtimeCostumes;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(length - 1, Math.max(0, index));
}

function normalizeHue(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function hexToHsl(hexColor: string): { h: number; s: number; l: number } | null {
  const hex = hexColor.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    switch (max) {
      case r:
        hue = 60 * (((g - b) / delta) % 6);
        break;
      case g:
        hue = 60 * ((b - r) / delta + 2);
        break;
      default:
        hue = 60 * ((r - g) / delta + 4);
        break;
    }
  }

  return {
    h: normalizeHue(hue),
    s: saturation * 100,
    l: lightness * 100
  };
}

export const executionEngine = new ExecutionEngine();
