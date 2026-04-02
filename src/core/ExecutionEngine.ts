import type { CompiledProgram, IRBlock, IRCostume, IRScript, IRValue } from '../types/ir';
import type { LoadedAssets, PrimitiveValue } from '../types';
import { ObjectPool } from '../utils/datastruct';
import { WebGLRenderer } from '../renderer/WebGLRenderer';
import { Scheduler, wait, YIELD_TOKEN } from './Scheduler';
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

  ifOnEdgeBounce(): void {
    const costume = this.getCurrentCostume();
    const logicalWidth = costume ? (costume.width / (costume.bitmapResolution || 1)) * (this.size / 100) : this.size;
    const logicalHeight = costume ? (costume.height / (costume.bitmapResolution || 1)) * (this.size / 100) : this.size;
    const halfWidth = logicalWidth / 2;
    const halfHeight = logicalHeight / 2;

    let bouncedX = false;
    let bouncedY = false;

    if (this._x - halfWidth < -240) {
      this._x = -240 + halfWidth;
      bouncedX = true;
    } else if (this._x + halfWidth > 240) {
      this._x = 240 - halfWidth;
      bouncedX = true;
    }

    if (this._y - halfHeight < -180) {
      this._y = -180 + halfHeight;
      bouncedY = true;
    } else if (this._y + halfHeight > 180) {
      this._y = 180 - halfHeight;
      bouncedY = true;
    }

    if (!bouncedX && !bouncedY) {
      return;
    }

    let dx = Math.cos((this.direction - 90) * (Math.PI / 180));
    let dy = Math.sin((this.direction - 90) * (Math.PI / 180));

    if (bouncedX) {
      dx *= -1;
    }
    if (bouncedY) {
      dy *= -1;
    }

    this.direction = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
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
  private targetFPS: number = 30;
  private frameInterval: number = 1000 / 30;

  private spritePool: ObjectPool<SpriteInstance>;
  private assetPool: ObjectPool<any>;
  
  private mouseX: number = 0;
  private mouseY: number = 0;

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

    // Set up mouse listeners
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Convert to Scratch coordinates (-240 to 240, -180 to 180)
      this.mouseX = (x / rect.width) * 480 - 240;
      this.mouseY = 180 - (y / rect.height) * 360;
    });

    for (const [id, variable] of program.ir.globalVariables) {
      variables.set(id, variable.value);
    }

    for (const [id, list] of program.ir.globalLists) {
      lists.set(id, [...list.contents]);
    }

    await renderer.init(canvas);
    console.log('[ZND] renderer initialization complete', {
      gpu: renderer.isGPUAvailable()
    });

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

    // Set up broadcast subscriptions
    for (const sprite of program.ir.orderedSprites) {
      for (const script of sprite.scripts) {
        if (script.hatOpcode === 'event_whenbroadcastreceived') {
          const broadcastMsg = String(script.topBlock.fields.BROADCAST_OPTION?.value || '');
          broadcasts.subscribe(broadcastMsg, () => {
            // Scratch restarts the script if it's already running
            scheduler.cancel('script', script.targetId, script.id);
            scheduler.schedule(
              'script',
              script.targetId,
              script.id,
              () => this.runScript(script),
              'normal'
            );
          });
        }
      }
    }

    console.log('[ZND] engine load complete', {
      spriteCount: sprites.size,
      globalVariableCount: variables.size,
      globalListCount: lists.size
    });
  }

  start(): void {
    if (!this.context || this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.startHatScripts();
    console.log('[ZND] engine start complete');
    this.executeFrame();
  }

  stop(): void {
    this.running = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
    this.context?.scheduler.cancelAll();
    console.log('[ZND] engine stop complete');
  }

  setTargetFPS(fps: number): void {
    this.targetFPS = fps > 0 ? fps : 30;
    this.frameInterval = 1000 / this.targetFPS;
  }

  getTargetFPS(): number {
    return this.targetFPS;
  }

  private executeFrame = (): void => {
    if (!this.running || !this.context) return;

    const now = performance.now();
    const elapsed = now - this.lastFrameTime;

    if (elapsed < this.frameInterval) {
      this.frameId = requestAnimationFrame(this.executeFrame);
      return;
    }

    this.deltaTime = elapsed / 1000;
    this.lastFrameTime = now - (elapsed % this.frameInterval);
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

  setVariable(nameOrId: string, value: PrimitiveValue, spriteId?: string): void {
    if (!this.context) return;
    if (spriteId) {
      const sprite = this.context.sprites.get(spriteId);
      if (sprite && sprite.variables.has(nameOrId)) {
        sprite.variables.set(nameOrId, value);
        return;
      }
    }
    this.context.variables.set(nameOrId, value);
  }

  getVariable(nameOrId: string, spriteId?: string): PrimitiveValue {
    if (!this.context) return null;
    if (spriteId) {
      const sprite = this.context.sprites.get(spriteId);
      if (sprite && sprite.variables.has(nameOrId)) {
        return sprite.variables.get(nameOrId) ?? null;
      }
    }
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

  private startHatScripts(): void {
    if (!this.context || !this.program) {
      return;
    }

    for (const script of this.program.ir.orderedSprites.flatMap((sprite) => sprite.scripts)) {
      if (script.hatOpcode !== 'event_whenflagclicked') {
        continue;
      }

      this.context.scheduler.schedule(
        'script',
        script.targetId,
        script.id,
        () => this.runScript(script),
        'normal'
      );
      console.log('[ZND] hat script scheduled', {
        targetId: script.targetId,
        scriptId: script.id,
        hatOpcode: script.hatOpcode
      });
    }
  }

  private *runScript(script: IRScript): Generator<symbol | number | void> {
    if (!this.context) {
      return;
    }

    const sprite = this.context.sprites.get(script.targetId);
    if (!sprite || !script.topBlock.next) {
      return;
    }

    yield* this.runBlockChain(sprite, script.topBlock.next);
  }

  private *runBlockChain(sprite: SpriteInstance, startBlock: IRBlock | null): Generator<symbol | number | void> {
    let current = startBlock;

    while (current && this.running) {
      switch (current.opcode) {
        case 'motion_movesteps':
          sprite.move(this.getNumericInput(current.inputs.STEPS, sprite));
          break;
        case 'motion_gotoxy':
          sprite.gotoXY(
            this.getNumericInput(current.inputs.X, sprite),
            this.getNumericInput(current.inputs.Y, sprite)
          );
          break;
        case 'motion_setx':
          sprite.x = this.getNumericInput(current.inputs.X, sprite);
          break;
        case 'motion_sety':
          sprite.y = this.getNumericInput(current.inputs.Y, sprite);
          break;
        case 'motion_changexby':
          sprite.x += this.getNumericInput(current.inputs.DX, sprite);
          break;
        case 'motion_changeyby':
          sprite.y += this.getNumericInput(current.inputs.DY, sprite);
          break;
        case 'motion_pointindirection':
          sprite.direction = this.getNumericInput(current.inputs.DIRECTION, sprite);
          break;
        case 'motion_pointtowards':
          this.pointSpriteTowards(sprite, this.getStringInput(current.inputs.TOWARDS, sprite));
          break;
        case 'motion_turnright':
          sprite.direction += this.getNumericInput(current.inputs.DEGREES, sprite);
          break;
        case 'motion_turnleft':
          sprite.direction -= this.getNumericInput(current.inputs.DEGREES, sprite);
          break;
        case 'motion_ifonedgebounce':
          sprite.ifOnEdgeBounce();
          break;
        case 'motion_goto':
          this.moveSpriteToTarget(sprite, this.getStringInput(current.inputs.TO, sprite));
          break;
        case 'motion_glidesecstoxy': {
          const secs = this.getNumericInput(current.inputs.SECS, sprite);
          const startX = sprite.x;
          const startY = sprite.y;
          const targetX = this.getNumericInput(current.inputs.X, sprite);
          const targetY = this.getNumericInput(current.inputs.Y, sprite);
          const startTime = performance.now();
          const duration = secs * 1000;
          
          if (duration <= 0) {
            sprite.gotoXY(targetX, targetY);
          } else {
            while (performance.now() - startTime < duration) {
              const t = (performance.now() - startTime) / duration;
              sprite.gotoXY(
                startX + (targetX - startX) * t,
                startY + (targetY - startY) * t
              );
              yield YIELD_TOKEN;
            }
            sprite.gotoXY(targetX, targetY);
          }
          break;
        }
        case 'motion_glideto': {
          const secs = this.getNumericInput(current.inputs.SECS, sprite);
          const startX = sprite.x;
          const startY = sprite.y;
          const targetName = this.getStringInput(current.inputs.TO, sprite);
          const startTime = performance.now();
          const duration = secs * 1000;
          
          if (duration <= 0) {
            this.moveSpriteToTarget(sprite, targetName);
          } else {
            while (performance.now() - startTime < duration) {
              const targetXY = this.getTargetXY(targetName);
              if (!targetXY) break;
              const t = (performance.now() - startTime) / duration;
              sprite.gotoXY(
                startX + (targetXY[0] - startX) * t,
                startY + (targetXY[1] - startY) * t
              );
              yield YIELD_TOKEN;
            }
            this.moveSpriteToTarget(sprite, targetName);
          }
          break;
        }
        case 'motion_setrotationstyle': {
          const style = typeof current.fields.STYLE === 'string' ? current.fields.STYLE : 'all-around';
          sprite.rotationStyle = style as SpriteInstance['rotationStyle'];
          break;
        }
        case 'looks_show':
          sprite.visible = true;
          break;
        case 'looks_hide':
          sprite.visible = false;
          break;
        case 'looks_switchcostumeto':
          sprite.setCostume(this.getCostumeSelector(current.inputs.COSTUME, sprite));
          break;
        case 'looks_nextcostume':
          sprite.nextCostume();
          break;
        case 'looks_changesizeby':
          sprite.size += this.getNumericInput(current.inputs.CHANGE, sprite);
          break;
        case 'looks_setsizeto':
          sprite.size = this.getNumericInput(current.inputs.SIZE, sprite);
          break;
        case 'looks_changeeffectby':
          sprite.changeEffect(String(current.fields.EFFECT?.value || 'ghost'), this.getNumericInput(current.inputs.CHANGE, sprite));
          break;
        case 'looks_seteffectto':
          sprite.setEffect(String(current.fields.EFFECT?.value || 'ghost'), this.getNumericInput(current.inputs.VALUE, sprite));
          break;
        case 'looks_cleargraphiceffects':
          sprite.clearEffects();
          break;
        case 'looks_gotofrontback':
          sprite.goToLayer(String(current.fields.FRONT_BACK?.value || 'front'));
          break;
        case 'looks_gobackfront':
          // Simplified: just go back/front by a large amount
          if (current.fields.FORWARD_BACKWARD?.value === 'backward') {
            sprite.layerOrder -= this.getNumericInput(current.inputs.NUM, sprite);
          } else {
            sprite.layerOrder += this.getNumericInput(current.inputs.NUM, sprite);
          }
          break;
        case 'control_wait':
          yield* wait(this.getNumericInput(current.inputs.DURATION, sprite));
          break;
        case 'control_if': {
          const condition = Boolean(this.evaluateValue(current.inputs.CONDITION, sprite));
          if (condition) {
            const substack = this.getSubstack(current.inputs.SUBSTACK);
            if (substack) {
              yield* this.runBlockChain(sprite, substack);
            }
          }
          break;
        }
        case 'control_if_else': {
          const condition = Boolean(this.evaluateValue(current.inputs.CONDITION, sprite));
          if (condition) {
            const substack = this.getSubstack(current.inputs.SUBSTACK);
            if (substack) {
              yield* this.runBlockChain(sprite, substack);
            }
          } else {
            const substack2 = this.getSubstack(current.inputs.SUBSTACK2);
            if (substack2) {
              yield* this.runBlockChain(sprite, substack2);
            }
          }
          break;
        }
        case 'control_repeat': {
          const times = Math.max(0, Math.floor(this.getNumericInput(current.inputs.TIMES, sprite)));
          const substack = this.getSubstack(current.inputs.SUBSTACK);
          for (let i = 0; i < times && this.running; i++) {
            if (substack) {
              yield* this.runBlockChain(sprite, substack);
            }
            yield YIELD_TOKEN;
          }
          break;
        }
        case 'control_forever': {
          const substack = this.getSubstack(current.inputs.SUBSTACK);
          while (this.running) {
            if (substack) {
              yield* this.runBlockChain(sprite, substack);
            }
            yield YIELD_TOKEN;
          }
          return;
        }
        case 'control_stop': {
          const mode = String(current.fields.STOP_OPTION?.value || 'all');
          if (mode === 'all') {
            this.stop();
          } else if (mode === 'this script') {
            return;
          } else if (mode === 'other scripts in sprite') {
            // Simplified: cancel all other scripts for this sprite
            this.context.scheduler.cancel('script', sprite.id);
            // Note: This won't cancel the current script because it's currently executing 
            // and not in the priority queues of the scheduler during its own execution.
          }
          break;
        }
        case 'event_broadcast':
          this.context.broadcasts.send(this.getStringInput(current.inputs.BROADCAST_INPUT, sprite));
          break;
        case 'event_broadcastandwait':
          yield this.context.broadcasts.sendAndWait(this.getStringInput(current.inputs.BROADCAST_INPUT, sprite));
          break;
        case 'data_setvariableto':
          this.setVariable(current.fields.VARIABLE?.id || current.fields.VARIABLE?.name, this.evaluateValue(current.inputs.VALUE, sprite), sprite.id);
          break;
        case 'data_changevariableby': {
          const varId = current.fields.VARIABLE?.id || current.fields.VARIABLE?.name;
          const currentVal = Number(this.getVariable(varId, sprite.id)) || 0;
          const delta = Number(this.evaluateValue(current.inputs.VALUE, sprite)) || 0;
          this.setVariable(varId, currentVal + delta, sprite.id);
          break;
        }
        case 'pen_penup':
        case 'pen_penUp':
          sprite.penUp();
          break;
        case 'pen_pendown':
        case 'pen_penDown':
          sprite.penDown();
          break;
        case 'pen_clear':
          sprite.clearPen();
          break;
        case 'pen_stamp':
          sprite.stamp();
          break;
        case 'pen_setpencolortocolor':
        case 'pen_setPenColorToColor': {
          const colorInput = current.inputs.COLOR;
          if (colorInput) {
            sprite.setPenColor(String(this.evaluateValue(colorInput, sprite)));
          } else if (typeof current.fields.COLOR === 'string') {
            sprite.setPenColor(current.fields.COLOR);
          }
          break;
        }
        case 'pen_changepensizeby':
        case 'pen_changePenSizeBy':
          sprite.changePenSize(this.getNumericInput(current.inputs.SIZE, sprite));
          break;
        case 'pen_setpensizeto':
        case 'pen_setPenSizeTo':
          sprite.setPenSize(this.getNumericInput(current.inputs.SIZE, sprite));
          break;
      }

      current = current.next;
    }
  }

  private evaluateValue(input: IRValue | IRValue[] | undefined, sprite: SpriteInstance): PrimitiveValue {
    if (!input) return 0;

    if (Array.isArray(input)) {
      for (const item of input) {
        if (item.type === 'block' && item.resolvedBlock) {
          return this.evaluateReporter(item.resolvedBlock, sprite);
        }
      }
      for (const item of input) {
        if (item.type === 'literal') return item.value;
      }
      return 0;
    }

    if (input.type === 'block' && input.resolvedBlock) {
      return this.evaluateReporter(input.resolvedBlock, sprite);
    }

    if (input.type === 'variable') {
      return this.getVariable(String(input.value), sprite.id);
    }

    return input.value;
  }

  private evaluateReporter(block: IRBlock, sprite: SpriteInstance): PrimitiveValue {
    switch (block.opcode) {
      case 'operator_add':
        return Number(this.evaluateValue(block.inputs.NUM1, sprite)) + Number(this.evaluateValue(block.inputs.NUM2, sprite));
      case 'operator_subtract':
        return Number(this.evaluateValue(block.inputs.NUM1, sprite)) - Number(this.evaluateValue(block.inputs.NUM2, sprite));
      case 'operator_multiply':
        return Number(this.evaluateValue(block.inputs.NUM1, sprite)) * Number(this.evaluateValue(block.inputs.NUM2, sprite));
      case 'operator_divide':
        return Number(this.evaluateValue(block.inputs.NUM1, sprite)) / Number(this.evaluateValue(block.inputs.NUM2, sprite));
      case 'operator_random': {
        const from = Number(this.evaluateValue(block.inputs.FROM, sprite));
        const to = Number(this.evaluateValue(block.inputs.TO, sprite));
        const low = Math.min(from, to);
        const high = Math.max(from, to);
        if (Math.floor(low) === low && Math.floor(high) === high) {
          return Math.floor(Math.random() * (high - low + 1)) + low;
        }
        return Math.random() * (high - low) + low;
      }
      case 'operator_lt':
        return this.compare(this.evaluateValue(block.inputs.OPERAND1, sprite), this.evaluateValue(block.inputs.OPERAND2, sprite)) < 0;
      case 'operator_equals':
        return this.compare(this.evaluateValue(block.inputs.OPERAND1, sprite), this.evaluateValue(block.inputs.OPERAND2, sprite)) === 0;
      case 'operator_gt':
        return this.compare(this.evaluateValue(block.inputs.OPERAND1, sprite), this.evaluateValue(block.inputs.OPERAND2, sprite)) > 0;
      case 'operator_and':
        return Boolean(this.evaluateValue(block.inputs.OPERAND1, sprite)) && Boolean(this.evaluateValue(block.inputs.OPERAND2, sprite));
      case 'operator_or':
        return Boolean(this.evaluateValue(block.inputs.OPERAND1, sprite)) || Boolean(this.evaluateValue(block.inputs.OPERAND2, sprite));
      case 'operator_not':
        return !Boolean(this.evaluateValue(block.inputs.OPERAND, sprite));
      case 'operator_join':
        return String(this.evaluateValue(block.inputs.STRING1, sprite)) + String(this.evaluateValue(block.inputs.STRING2, sprite));
      case 'motion_xposition':
        return sprite.x;
      case 'motion_yposition':
        return sprite.y;
      case 'motion_direction':
        return sprite.direction;
      case 'looks_size':
        return sprite.size;
      case 'looks_costumenumbername':
        return block.fields.NUMBER_NAME?.value === 'name' ? sprite.costumeName : sprite.costumeIndex + 1;
      case 'sensing_mousex':
        return this.mouseX;
      case 'sensing_mousey':
        return this.mouseY;
      case 'sensing_touchingobject': {
        const targetName = this.getStringInput(block.inputs.TOUCHINGOBJECTMENU, sprite);
        const targetXY = this.getTargetXY(targetName);
        if (!targetXY) return false;
        
        // Simple distance-based collision check
        const dx = targetXY[0] - sprite.x;
        const dy = targetXY[1] - sprite.y;
        const distSq = dx * dx + dy * dy;
        
        const c1 = sprite.getCurrentCostume();
        const r1 = c1 ? (Math.max(c1.width, c1.height) / (2 * (c1.bitmapResolution || 1))) * (sprite.size / 100) : 10;
        
        let r2 = 10;
        if (targetName === '_mouse_') {
          r2 = 1;
        } else {
          const target = this.getSprite(targetName);
          if (target) {
            const c2 = target.getCurrentCostume();
            r2 = c2 ? (Math.max(c2.width, c2.height) / (2 * (c2.bitmapResolution || 1))) * (target.size / 100) : 10;
          }
        }
        
        return distSq < (r1 + r2) * (r1 + r2);
      }
      case 'sensing_distanceto': {
        const targetName = this.getStringInput(block.inputs.DISTANCETOMENU, sprite);
        const targetXY = this.getTargetXY(targetName);
        if (!targetXY) return 10000;
        const dx = targetXY[0] - sprite.x;
        const dy = targetXY[1] - sprite.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
      case 'data_variable':
        return this.getVariable(block.fields.VARIABLE?.id || block.fields.VARIABLE?.name, sprite.id);
      default:
        console.warn(`[ZND] unknown reporter opcode: ${block.opcode}`);
        return 0;
    }
  }

  private compare(v1: any, v2: any): number {
    const n1 = Number(v1);
    const n2 = Number(v2);
    if (!isNaN(n1) && !isNaN(n2)) {
      return n1 - n2;
    }
    const s1 = String(v1).toLocaleLowerCase();
    const s2 = String(v2).toLocaleLowerCase();
    if (s1 < s2) return -1;
    if (s1 > s2) return 1;
    return 0;
  }

  private getSubstack(input: IRValue | IRValue[] | undefined): IRBlock | null {
    if (!input) {
      return null;
    }

    if (Array.isArray(input)) {
      for (const item of input) {
        if (item.resolvedBlock) {
          return item.resolvedBlock;
        }
      }
      return null;
    }

    return input.resolvedBlock ?? null;
  }

  private getNumericInput(input: IRValue | IRValue[] | undefined, sprite: SpriteInstance): number {
    const value = this.evaluateValue(input, sprite);
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private getStringInput(input: IRValue | IRValue[] | undefined, sprite: SpriteInstance): string {
    const value = this.evaluateValue(input, sprite);
    return typeof value === 'string' ? value : String(value ?? '');
  }

  private getCostumeSelector(input: IRValue | IRValue[] | undefined, sprite: SpriteInstance): number | string {
    const value = this.evaluateValue(input, sprite);
    if (typeof value === 'number' || typeof value === 'string') {
      return value;
    }
    return 0;
  }

  private moveSpriteToTarget(sprite: SpriteInstance, targetName: string): void {
    const targetXY = this.getTargetXY(targetName);
    if (!targetXY) {
      return;
    }
    sprite.gotoXY(targetXY[0], targetXY[1]);
  }

  private pointSpriteTowards(sprite: SpriteInstance, targetName: string): void {
    const targetXY = this.getTargetXY(targetName);
    if (!targetXY) {
      return;
    }

    const dx = targetXY[0] - sprite.x;
    const dy = targetXY[1] - sprite.y;
    sprite.direction = 90 - (Math.atan2(dy, dx) * 180 / Math.PI);
  }

  private getTargetXY(targetName: string): [number, number] | null {
    if (!this.context) {
      return null;
    }

    if (targetName === '_random_') {
      return [
        Math.round(480 * (Math.random() - 0.5)),
        Math.round(360 * (Math.random() - 0.5))
      ];
    }

    if (targetName === '_mouse_') {
      return [this.mouseX, this.mouseY];
    }

    const targetSprite = this.context.sprites.get(targetName);
    if (!targetSprite) {
      // Try to find by name
      for (const s of this.context.sprites.values()) {
        if (s.name === targetName) return [s.x, s.y];
      }
      return null;
    }

    return [targetSprite.x, targetSprite.y];
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
