export interface BenchmarkMetrics {
    name: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    memoryBefore?: number;
    memoryAfter?: number;
    memoryDelta?: number;
    custom?: Record<string, number>;
}
export interface BenchmarkResult {
    name: string;
    iterations: number;
    totalDuration: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    medianDuration: number;
    stdDeviation: number;
    fps?: number;
    memoryUsage?: {
        before: number;
        after: number;
        delta: number;
        peak: number;
    };
}
export declare class Benchmark {
    private metrics;
    private results;
    private frameTimes;
    private frameCount;
    private lastFrameTime;
    private running;
    private fpsCallback?;
    private onProgress?;
    startMetric(name: string): void;
    endMetric(name: string): BenchmarkMetrics | null;
    run(name: string, fn: () => void | Promise<void>, iterations?: number): Promise<BenchmarkResult>;
    startFPSMonitoring(fpsCallback?: (fps: number) => void): void;
    stopFPSMonitoring(): BenchmarkResult | null;
    private monitorFrame;
    compare(...names: string[]): string;
    printResult(result: BenchmarkResult): void;
    exportResults(): string;
    private getMemoryUsage;
    private calculateStdDev;
    getResult(name: string): BenchmarkResult | undefined;
    clearResults(): void;
    setProgressCallback(callback: (progress: number) => void): void;
}
export declare const benchmark: Benchmark;
export declare function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T>;
export declare function measure<T>(name: string, fn: () => T): T;
//# sourceMappingURL=benchmark.d.ts.map