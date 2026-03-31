import { ProjectLoader } from './loader/ProjectLoader';
import { BlockParser } from './compiler/BlockParser';
import { JSCodeGenerator } from './compiler/JSCodeGenerator';
import { ExecutionEngine } from './core/ExecutionEngine';
import { benchmark, Benchmark } from './utils/benchmark';
import type { CompiledProgram } from './types/ir';

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

export class ZNDCompiler {
  private config: Required<ZNDConfig>;
  private loader: ProjectLoader;
  private parser: BlockParser;
  private generator: JSCodeGenerator;
  private engine: ExecutionEngine;
  private compiled: CompiledProgram | null = null;
  private fpsHistory: number[] = [];
  private maxFPSHistory: number = 60;

  constructor(config: ZNDConfig) {
    this.config = {
      canvas: config.canvas,
      width: config.width || 480,
      height: config.height || 360,
      autoStart: config.autoStart ?? true,
      maxFPS: config.maxFPS || 60,
      enableWebGL: config.enableWebGL ?? true,
      enableCaching: config.enableCaching ?? true,
      debugMode: config.debugMode ?? false
    };

    this.config.canvas.width = this.config.width;
    this.config.canvas.height = this.config.height;

    this.loader = new ProjectLoader();
    this.parser = new BlockParser();
    this.generator = new JSCodeGenerator(this.parser);
    this.engine = new ExecutionEngine();
  }

  async loadProject(projectId: string): Promise<void> {
    benchmark.startMetric('project_load');
    const project = await this.loader.fetch(projectId);
    benchmark.endMetric('project_load');

    if (this.config.debugMode) {
      console.log('Project loaded:', project);
    }

    benchmark.startMetric('project_parse');
    const parseResult = this.parser.parse(project.json);
    benchmark.endMetric('project_parse');

    if (this.config.debugMode) {
      console.log('IR parsed:', parseResult);
    }

    benchmark.startMetric('project_compile');
    this.compiled = this.generator.generateProgram(parseResult);
    benchmark.endMetric('project_compile');

    if (this.config.debugMode) {
      console.log('Compiled:', this.compiled);
    }

    if (!this.compiled) {
      throw new Error('Compilation failed');
    }
    await this.engine.load(this.compiled, { costumes: new Map(), sounds: new Map(), vectors: new Map() });

    if (this.config.autoStart) {
      this.engine.start();
      this.startFPSMonitoring();
    }
  }

  start(): void {
    this.engine.start();
    this.startFPSMonitoring();
  }

  stop(): void {
    this.engine.stop();
  }

  broadcast(message: string, args?: any[]): void {
    this.engine.broadcast(message, args);
  }

  getFPS(): number {
    if (this.fpsHistory.length === 0) return 0;
    return this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
  }

  dispose(): void {
    this.engine.stop();
    this.compiled = null;
  }

  private startFPSMonitoring(): void {
    let lastTime = performance.now();
    let frames = 0;

    const updateFPS = (): void => {
      frames++;
      const now = performance.now();
      
      if (now - lastTime >= 1000) {
        this.fpsHistory.push(frames);
        if (this.fpsHistory.length > this.maxFPSHistory) {
          this.fpsHistory.shift();
        }
        frames = 0;
        lastTime = now;
      }

      requestAnimationFrame(updateFPS);
    };

    requestAnimationFrame(updateFPS);
  }
}

export function createZND(config: ZNDConfig): ZNDInstance {
  const compiler = new ZNDCompiler(config);

  return {
    engine: compiler['engine'],
    loadProject: (id) => compiler.loadProject(id),
    loadProjectFromData: async (data) => {
      await compiler.loadProject('temp');
    },
    start: () => compiler.start(),
    stop: () => compiler.stop(),
    broadcast: (msg, args) => compiler.broadcast(msg, args),
    getFPS: () => compiler.getFPS(),
    dispose: () => compiler.dispose(),
    benchmark
  };
}
