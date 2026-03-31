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

const FRAME_BUDGET_MS = 16;
const YIELD_INTERVAL = 100;

export class Scheduler {
  private tasks: Map<string, Task> = new Map();
  private taskQueue: Task[] = [];
  private frameTime: number = 0;
  private frameCount: number = 0;
  private taskCounter: number = 0;

  private highPriorityQueue: Task[] = [];
  private normalPriorityQueue: Task[] = [];
  private lowPriorityQueue: Task[] = [];

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

  private addToQueue(task: Task): void {
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

    const startTime = performance.now();
    let processedCount = 0;

    while (processedCount < 100) {
      const task = this.getNextTask();
      if (!task) break;

      if (task.scheduledTime > this.frameTime) {
        this.addToQueue(task);
        break;
      }

      try {
        this.executeTask(task);
        processedCount++;
      } catch (err) {
        console.error(`Task error: ${task.id}`, err);
        this.removeTask(task);
      }

      if (performance.now() - startTime > FRAME_BUDGET_MS * 0.5) {
        break;
      }
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

  private executeTask(task: Task): void {
    if (!task.generator) {
      const result = task.handler();
      
      if (result && typeof result.next === 'function') {
        task.generator = result as Generator;
      } else {
        this.removeTask(task);
        return;
      }
    }

    const frameStart = performance.now();
    
    while (true) {
      const { value, done } = task.generator.next();
      
      if (done) {
        this.removeTask(task);
        return;
      }

      if (value === YIELD_TOKEN) {
        if (performance.now() - frameStart > FRAME_BUDGET_MS * 0.3) {
          return;
        }
        continue;
      }

      if (value instanceof Promise) {
        return;
      }

      if (performance.now() - frameStart > FRAME_BUDGET_MS * 0.3) {
        return;
      }
    }
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

export const YIELD_TOKEN = Symbol('YIELD');

export function* yieldToScheduler(): Generator<symbol> {
  return yield YIELD_TOKEN;
}

export function* wait(duration: number): Generator<number> {
  const start = performance.now();
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
          yield YIELD_TOKEN;
        }
      }
    }
    yield YIELD_TOKEN;
  }
}
