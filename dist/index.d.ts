import { ExecutionEngine } from './core/ExecutionEngine';
export interface ZNDConfig {
    canvas: HTMLCanvasElement;
    width?: number;
    height?: number;
    autoStart?: boolean;
    maxFPS?: number;
    enableWebGL?: boolean;
    enableCaching?: boolean;
    debugMode?: boolean;
}
export interface ZNDInstance {
    engine: ExecutionEngine;
    loadProject: (projectId: string) => Promise<void>;
    loadProjectFromData: (data: any) => Promise<void>;
    start: () => void;
    stop: () => void;
    broadcast: (message: string, args?: any[]) => void;
    getFPS: () => number;
    dispose: () => void;
    benchmark: Benchmark;
}
export declare class ZNDCompiler {
    private config;
    private loader;
    private parser;
    private generator;
    private engine;
    private compiled;
    private fpsHistory;
    private maxFPSHistory;
    constructor(config: ZNDConfig);
    loadProject(projectId: string): Promise<void>;
    start(): void;
    stop(): void;
    broadcast(message: string, args?: any[]): void;
    getFPS(): number;
    dispose(): void;
    private startFPSMonitoring;
}
export declare function createZND(config: ZNDConfig): ZNDInstance;
//# sourceMappingURL=index.d.ts.map