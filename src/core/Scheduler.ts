import type { PrimitiveValue } from '../types';
import { RingBuffer } from '../utils/datastruct';

export type TaskPriority = 'high' | 'normal' | 'low';

export interface Task {
  id: string;
  type: string;
  target: string;
  script: string;
  handler: () => Generator | Promise<void> | void;
  priority: TaskPriority;
  scheduledTime: number;
  generator?: Generator;
  resolved: boolean;
}

const FRAME_BUDGET_MS = 33; // Target 30FPS (approx 33ms per frame)
const YIELD_INTERVAL = 100;

export class Scheduler {
  private tasks: Map<string, Task> = new Map();
  private frameTime: number = 0;
  private frameCount: number = 0;
  private taskCounter: number = 0;

  private highPriorityQueue: Task[] = [];
  private normalPriorityQueue: Task[] = [];
  private lowPriorityQueue: Task[] = [];
  
  // Tasks that yielded this frame and should wait for the next frame
  private nextFrameQueue: Task[] = [];

  schedule(
    type: string,
    target: string,
    script: string,
    handler: () => Generator | Promise<void> | void,
    priority: TaskPriority = 'normal',
    delay: number = 0
  ): Task {
    const key = `${type}:${target}:${script}`;
    
    if (this.tasks.has(key)) {
      return this.tasks.get(key)!;
    }

    const task: Task = {
      id: `task_${++this.taskCounter}`,
      type,
      target,
      script,
      handler,
      priority,
      scheduledTime: this.frameTime + delay,
      resolved: false
    };

    this.tasks.set(key, task);
    this.addToQueue(task);

    return task;
  }

  private addToQueue(task: Task, forNextFrame: boolean = false): void {
    if (forNextFrame) {
      this.nextFrameQueue.push(task);
      return;
    }

    switch (task.priority) {
      case 'high':
        this.highPriorityQueue.push(task);
        break;
      case 'normal':
        this.normalPriorityQueue.push(task);
        break;
      case 'low':
        this.lowPriorityQueue.push(task);
        break;
    }
  }

  processFrame(deltaTime: number): void {
    this.frameTime += deltaTime;
    this.frameCount++;

    // Move tasks from nextFrameQueue to priority queues
    while (this.nextFrameQueue.length > 0) {
      this.addToQueue(this.nextFrameQueue.shift()!);
    }

    const startTime = performance.now();
    let processedCount = 0;

    // To prevent infinite loops or over-processing, but allow enough work
    const maxProcessed = 500; 

    while (processedCount < maxProcessed) {
      const task = this.getNextTask();
      if (!task) break;

      if (task.scheduledTime > this.frameTime) {
        this.nextFrameQueue.push(task); // Try again next frame
        processedCount++;
        continue;
      }

      try {
        const status = this.executeTask(task);
        if (status === 'yield') {
          // Task yielded, move to next frame queue
          this.addToQueue(task, true);
        } else if (status === 'pending') {
          // Task is waiting for a promise, it will re-add itself
        } else if (status === 'continue') {
          // Task should continue in the SAME frame (if budget allows)
          this.addToQueue(task, false);
        }
        processedCount++;
      } catch (err) {
        console.error(`Task error: ${task.id}`, err);
        this.removeTask(task);
      }

      if (performance.now() - startTime > FRAME_BUDGET_MS) {
        break;
      }
    }

    if (this.frameCount % 60 === 0) {
      console.log('[ZND] frame status', {
        frame: this.frameCount,
        processedCount,
        activeTasks: this.tasks.size
      });
    }
  }

  private getNextTask(): Task | undefined {
    if (this.highPriorityQueue.length > 0) {
      return this.highPriorityQueue.shift();
    }
    if (this.normalPriorityQueue.length > 0) {
      return this.normalPriorityQueue.shift();
    }
    return this.lowPriorityQueue.shift();
  }

  private executeTask(task: Task): 'complete' | 'yield' | 'pending' | 'continue' {
    if (!task.generator) {
      const result = task.handler();
      
      if (result && typeof result === 'object' && typeof (result as any).next === 'function') {
        task.generator = result as unknown as Generator;
      } else {
        this.removeTask(task);
        return 'complete';
      }
    }

    const generator = task.generator;
    const { value, done } = generator.next();
    
    if (done) {
      this.removeTask(task);
      return 'complete';
    }

    if (value === YIELD_TOKEN) {
      return 'yield';
    }

    if (value instanceof Promise) {
      void value.finally(() => {
        if (!task.resolved && this.tasks.has(`${task.type}:${task.target}:${task.script}`)) {
          this.addToQueue(task, false); // Add to current frame if possible, or it will be picked up next frame if budget exhausted
        }
      });
      return 'pending';
    }

    // Default to continue in the same frame for simple steps
    return 'continue';
  }

  private removeTask(task: Task): void {
    this.tasks.delete(`${task.type}:${task.target}:${task.script}`);
    task.resolved = true;
  }

  cancel(type: string, target?: string, script?: string): void {
    const prefix = `${type}:${target || ''}:${script || ''}`;
    
    for (const [key, task] of this.tasks) {
      if (key.startsWith(prefix)) {
        this.removeTask(task);
      }
    }
  }

  cancelAll(): void {
    this.tasks.clear();
    this.highPriorityQueue = [];
    this.normalPriorityQueue = [];
    this.lowPriorityQueue = [];
  }

  getTaskCount(): number {
    return this.tasks.size;
  }

  hasTask(type: string, target: string, script: string): boolean {
    return this.tasks.has(`${type}:${target}:${script}`);
  }
}

export const YIELD_TOKEN = Symbol.for('YIELD');

export function* yieldToScheduler(): Generator<Symbol> {
  yield YIELD_TOKEN;
}

export function* wait(duration: number): Generator<Symbol> {
  const start = performance.now();
  // Always yield at least once
  yield YIELD_TOKEN;
  while (performance.now() - start < duration * 1000) {
    yield YIELD_TOKEN;
  }
}

export function* loop(times: number, body: () => Generator | void): Generator<number> {
  for (let i = 0; i < times; i++) {
    const result = body();
    if (result && typeof result.next === 'function') {
      while (true) {
        const { value, done } = (result as Generator).next();
        if (done) break;
        if (value === YIELD_TOKEN) {
          yield YIELD_TOKEN as unknown as number;
        }
      }
    }
    yield YIELD_TOKEN as unknown as number;
  }
}
