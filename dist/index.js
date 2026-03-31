import { ProjectLoader } from './loader/ProjectLoader';
import { BlockParser } from './compiler/BlockParser';
import { JSCodeGenerator } from './compiler/JSCodeGenerator';
import { ExecutionEngine } from './core/ExecutionEngine';
import { benchmark } from './utils/benchmark';
export class ZNDCompiler {
    config;
    loader;
    parser;
    generator;
    engine;
    compiled = null;
    fpsHistory = [];
    maxFPSHistory = 60;
    constructor(config) {
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
    async loadProject(projectId) {
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
    start() {
        this.engine.start();
        this.startFPSMonitoring();
    }
    stop() {
        this.engine.stop();
    }
    broadcast(message, args) {
        this.engine.broadcast(message, args);
    }
    getFPS() {
        if (this.fpsHistory.length === 0)
            return 0;
        return this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    }
    dispose() {
        this.engine.stop();
        this.compiled = null;
    }
    startFPSMonitoring() {
        let lastTime = performance.now();
        let frames = 0;
        const updateFPS = () => {
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
export function createZND(config) {
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
//# sourceMappingURL=index.js.map