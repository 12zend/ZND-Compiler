import type { CompiledProgram } from '../types/ir';
import type { LoadedAssets, PrimitiveValue } from '../types';
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
export declare class SpriteInstance {
    id: string;
    name: string;
    x: number;
    y: number;
    direction: number;
    size: number;
    rotationStyle: 'all-around' | 'left-right' | 'don\'t rotate';
    visible: boolean;
    draggable: boolean;
    costumeIndex: number;
    layerOrder: number;
    variables: Map<string, PrimitiveValue>;
    lists: Map<string, PrimitiveValue[]>;
    effects: Record<string, number>;
    isClone: boolean;
    cloneOrigin: string | null;
    private costume;
    private rotationCenterX;
    private rotationCenterY;
    constructor(id: string, name: string, defaultX?: number, defaultY?: number);
    setCostume(indexOrName: number | string): void;
    nextCostume(): void;
    move(steps: number): void;
    gotoXY(x: number, y: number): void;
    glideTo(secs: number, x: number, y: number): void;
    setEffect(effect: string, value: number): void;
    changeEffect(effect: string, delta: number): void;
    clearEffects(): void;
    goToLayer(position: string): void;
    goInFrontOf(spriteId: string): void;
}
export declare class ExecutionEngine {
    private program;
    private context;
    private running;
    private frameId;
    private lastFrameTime;
    private deltaTime;
    private frameTime;
    private spritePool;
    private assetPool;
    constructor();
    load(program: CompiledProgram, assets: LoadedAssets): Promise<void>;
    start(): void;
    stop(): void;
    private executeFrame;
    broadcast(message: string, args?: any[]): void;
    getContext(): RuntimeContext | null;
    getSprite(nameOrId: string): SpriteInstance | undefined;
    setVariable(nameOrId: string, value: PrimitiveValue): void;
    getVariable(nameOrId: string): PrimitiveValue;
}
export declare const executionEngine: ExecutionEngine;
//# sourceMappingURL=ExecutionEngine.d.ts.map