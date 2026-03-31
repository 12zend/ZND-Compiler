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
export declare class Scheduler {
    private tasks;
    private taskQueue;
    private frameTime;
    private frameCount;
    private taskCounter;
    private highPriorityQueue;
    private normalPriorityQueue;
    private lowPriorityQueue;
    schedule(type: string, target: string, script: string, handler: () => Generator | Promise<void> | void, priority?: TaskPriority, delay?: number): Task;
    private addToQueue;
    processFrame(deltaTime: number): void;
    private getNextTask;
    private executeTask;
    private removeTask;
    cancel(type: string, target?: string, script?: string): void;
    cancelAll(): void;
    getTaskCount(): number;
    hasTask(type: string, target: string, script: string): boolean;
}
export declare const YIELD_TOKEN: unique symbol;
export declare function yieldToScheduler(): Generator<symbol>;
export declare function wait(duration: number): Generator<number>;
export declare function loop(times: number, body: () => Generator | void): Generator<number>;
//# sourceMappingURL=Scheduler.d.ts.map