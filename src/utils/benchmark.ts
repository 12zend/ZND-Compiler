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

export class Benchmark {
  private metrics: Map<string, BenchmarkMetrics> = new Map();
  private results: Map<string, BenchmarkResult> = new Map();
  private frameTimes: number[] = [];
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private running: boolean = false;
  private fpsCallback?: (fps: number) => void;
  private onProgress?: (progress: number) => void;

  startMetric(name: string): void {
    this.metrics.set(name, {
      name,
      startTime: performance.now(),
      memoryBefore: this.getMemoryUsage()
    });
  }

  endMetric(name: string): BenchmarkMetrics | null {
    const metric = this.metrics.get(name);
    if (!metric) return null;

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.memoryAfter = this.getMemoryUsage();
    metric.memoryDelta = metric.memoryAfter - (metric.memoryBefore || 0);

    return metric;
  }

  async run(
    name: string,
    fn: () => void | Promise<void>,
    iterations: number = 100
  ): Promise<BenchmarkResult> {
    const durations: number[] = [];
    const memoryBefore = this.getMemoryUsage();
    let memoryPeak = memoryBefore;
    let memoryAfter = memoryBefore;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      
      durations.push(end - start);
      memoryAfter = this.getMemoryUsage();
      memoryPeak = Math.max(memoryPeak, memoryAfter);

      this.onProgress?.((i + 1) / iterations);
    }

    durations.sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / iterations;
    const median = durations[Math.floor(iterations / 2)];

    let variance = 0;
    for (const d of durations) {
      variance += (d - avg) ** 2;
    }
    const stdDev = Math.sqrt(variance / iterations);

    const result: BenchmarkResult = {
      name,
      iterations,
      totalDuration: sum,
      averageDuration: avg,
      minDuration: durations[0],
      maxDuration: durations[iterations - 1],
      medianDuration: median,
      stdDeviation: stdDev,
      memoryUsage: {
        before: memoryBefore,
        after: memoryAfter,
        delta: memoryAfter - memoryBefore,
        peak: memoryPeak
      }
    };

    this.results.set(name, result);
    return result;
  }

  startFPSMonitoring(fpsCallback?: (fps: number) => void): void {
    this.running = true;
    this.frameTimes = [];
    this.frameCount = 0;
    this.lastFrameTime = performance.now();
    this.fpsCallback = fpsCallback;
    this.monitorFrame();
  }

  stopFPSMonitoring(): BenchmarkResult | null {
    this.running = false;

    if (this.frameTimes.length === 0) return null;

    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = 1000 / avgFrameTime;

    const result: BenchmarkResult = {
      name: 'FPS',
      iterations: this.frameCount,
      totalDuration: this.frameTimes.reduce((a, b) => a + b, 0),
      averageDuration: avgFrameTime,
      minDuration: Math.min(...this.frameTimes),
      maxDuration: Math.max(...this.frameTimes),
      medianDuration: this.frameTimes[Math.floor(this.frameTimes.length / 2)],
      stdDeviation: this.calculateStdDev(this.frameTimes),
      fps
    };

    return result;
  }

  private monitorFrame = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const frameTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > 60) {
      this.frameTimes.shift();
    }

    this.frameCount++;
    this.fpsCallback?.(1000 / frameTime);

    requestAnimationFrame(this.monitorFrame);
  };

  compare(...names: string[]): string {
    const results: BenchmarkResult[] = [];
    for (const name of names) {
      const result = this.results.get(name);
      if (result) results.push(result);
    }

    if (results.length === 0) return 'No results to compare';

    results.sort((a, b) => a.averageDuration - b.averageDuration);
    const fastest = results[0];

    let output = `Benchmark Comparison (${results.length} tests)\n`;
    output += '='.repeat(60) + '\n\n';

    for (const result of results) {
      const speedup = fastest.averageDuration / result.averageDuration;
      const timePerFrame = result.name === 'FPS' 
        ? ` (${(1000 / (result.fps || 60)).toFixed(2)}ms/frame)`
        : '';
      output += `${result.name}${timePerFrame}:\n`;
      output += `  Avg: ${result.averageDuration.toFixed(3)}ms\n`;
      output += `  Min: ${result.minDuration.toFixed(3)}ms\n`;
      output += `  Max: ${result.maxDuration.toFixed(3)}ms\n`;
      output += `  Speedup vs slowest: ${speedup.toFixed(2)}x\n`;
      if (result.memoryUsage) {
        output += `  Memory: ${(result.memoryUsage.delta / 1024).toFixed(2)}KB\n`;
      }
      output += '\n';
    }

    return output;
  }

  printResult(result: BenchmarkResult): void {
    console.log(`\n=== ${result.name} ===`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Total: ${result.totalDuration.toFixed(3)}ms`);
    console.log(`Average: ${result.averageDuration.toFixed(3)}ms`);
    console.log(`Median: ${result.medianDuration.toFixed(3)}ms`);
    console.log(`Min: ${result.minDuration.toFixed(3)}ms`);
    console.log(`Max: ${result.maxDuration.toFixed(3)}ms`);
    console.log(`Std Dev: ${result.stdDeviation.toFixed(3)}ms`);
    
    if (result.fps) {
      console.log(`FPS: ${result.fps.toFixed(1)}`);
    }
    
    if (result.memoryUsage) {
      console.log(`Memory Delta: ${(result.memoryUsage.delta / 1024).toFixed(2)}KB`);
    }
  }

  exportResults(): string {
    return JSON.stringify(Array.from(this.results.entries()), null, 2);
  }

  private getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  getResult(name: string): BenchmarkResult | undefined {
    return this.results.get(name);
  }

  clearResults(): void {
    this.results.clear();
    this.metrics.clear();
    this.frameTimes = [];
    this.frameCount = 0;
  }

  setProgressCallback(callback: (progress: number) => void): void {
    this.onProgress = callback;
  }
}

export const benchmark = new Benchmark();

export function measureAsync<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  benchmark.startMetric(name);
  return fn().finally(() => {
    benchmark.endMetric(name);
  });
}

export function measure<T>(
  name: string,
  fn: () => T
): T {
  benchmark.startMetric(name);
  try {
    return fn();
  } finally {
    benchmark.endMetric(name);
  }
}
