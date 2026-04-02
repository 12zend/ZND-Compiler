import { ProjectLoader } from './loader/ProjectLoader';
import { BlockParser } from './compiler/BlockParser';
import { JSCodeGenerator } from './compiler/JSCodeGenerator';
import { ExecutionEngine } from './core/ExecutionEngine';
import { benchmark, Benchmark } from './utils/benchmark';
import type { CompiledProgram, LoadedAssets, SB3Project } from './types';

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
  loadProject: (project: SB3Project) => Promise<void>;
  loadProjectFromData: (data: SB3Project) => Promise<void>;
  start: () => void;
  stop: () => void;
  broadcast: (message: string, args?: any[]) => void;
  getFPS: () => number;
  dispose: () => void;
  benchmark: Benchmark;
}

export class ZNDCompiler {
  private config: Required<ZNDConfig>;
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

    this.parser = new BlockParser();
    this.generator = new JSCodeGenerator(this.parser);
    this.engine = new ExecutionEngine();
  }

  async loadProject(project: SB3Project): Promise<void> {
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

    const loadedAssets = await this.loadAssets(project);

    await this.engine.load(this.compiled, loadedAssets, this.config.canvas);

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

  private async loadAssets(project: SB3Project): Promise<LoadedAssets> {
    const costumes = new Map<string, HTMLImageElement>();
    const sounds = new Map<string, AudioBuffer>();
    const vectors = new Map<string, Path2D>();

    const costumeRefs = new Set<string>();
    for (const target of project.json.targets) {
      for (const costume of target.costumes) {
        costumeRefs.add(costume.md5ext);
      }
    }

    await Promise.all(
      Array.from(costumeRefs).map(async (assetRef) => {
        const asset = project.assets.get(assetRef);
        if (!asset) {
          return;
        }

        const image = await loadImageFromAsset(assetRef, asset);
        costumes.set(assetRef, image);
      })
    );

    return { costumes, sounds, vectors };
  }
}

export function createZND(config: ZNDConfig): ZNDInstance {
  const compiler = new ZNDCompiler(config);

  return {
    engine: compiler['engine'],
    loadProject: (project) => compiler.loadProject(project),
    loadProjectFromData: async (data) => {
      await compiler.loadProject(data);
    },
    start: () => compiler.start(),
    stop: () => compiler.stop(),
    broadcast: (msg, args) => compiler.broadcast(msg, args),
    getFPS: () => compiler.getFPS(),
    dispose: () => compiler.dispose(),
    benchmark
  };
}

function getMimeType(assetRef: string): string {
  const lower = assetRef.toLowerCase();
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

async function loadImageFromAsset(assetRef: string, asset: ArrayBuffer): Promise<HTMLImageElement> {
  const blob = new Blob([asset], { type: getMimeType(assetRef) });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to decode asset: ${assetRef}`));
      img.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
