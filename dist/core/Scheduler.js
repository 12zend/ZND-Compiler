const FRAME_BUDGET_MS = 16;
const YIELD_INTERVAL = 100;
export class Scheduler {
    tasks = new Map();
    taskQueue = [];
    frameTime = 0;
    frameCount = 0;
    taskCounter = 0;
    highPriorityQueue = [];
    normalPriorityQueue = [];
    lowPriorityQueue = [];
    schedule(type, target, script, handler, priority = 'normal', delay = 0) {
        const key = `${type}:${target}:${script}`;
        if (this.tasks.has(key)) {
            return this.tasks.get(key);
        }
        const task = {
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
    addToQueue(task) {
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
    processFrame(deltaTime) {
        this.frameTime += deltaTime;
        this.frameCount++;
        const startTime = performance.now();
        let processedCount = 0;
        while (processedCount < 100) {
            const task = this.getNextTask();
            if (!task)
                break;
            if (task.scheduledTime > this.frameTime) {
                this.addToQueue(task);
                break;
            }
            try {
                this.executeTask(task);
                processedCount++;
            }
            catch (err) {
                console.error(`Task error: ${task.id}`, err);
                this.removeTask(task);
            }
            if (performance.now() - startTime > FRAME_BUDGET_MS * 0.5) {
                break;
            }
        }
    }
    getNextTask() {
        if (this.highPriorityQueue.length > 0) {
            return this.highPriorityQueue.shift();
        }
        if (this.normalPriorityQueue.length > 0) {
            return this.normalPriorityQueue.shift();
        }
        return this.lowPriorityQueue.shift();
    }
    executeTask(task) {
        if (!task.generator) {
            const result = task.handler();
            if (result && typeof result.next === 'function') {
                task.generator = result;
            }
            else {
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
    removeTask(task) {
        this.tasks.delete(`${task.type}:${task.target}:${task.script}`);
        task.resolved = true;
    }
    cancel(type, target, script) {
        const prefix = `${type}:${target || ''}:${script || ''}`;
        for (const [key, task] of this.tasks) {
            if (key.startsWith(prefix)) {
                this.removeTask(task);
            }
        }
    }
    cancelAll() {
        this.tasks.clear();
        this.highPriorityQueue = [];
        this.normalPriorityQueue = [];
        this.lowPriorityQueue = [];
    }
    getTaskCount() {
        return this.tasks.size;
    }
    hasTask(type, target, script) {
        return this.tasks.has(`${type}:${target}:${script}`);
    }
}
export const YIELD_TOKEN = Symbol('YIELD');
export function* yieldToScheduler() {
    return yield YIELD_TOKEN;
}
export function* wait(duration) {
    const start = performance.now();
    while (performance.now() - start < duration * 1000) {
        yield YIELD_TOKEN;
    }
}
export function* loop(times, body) {
    for (let i = 0; i < times; i++) {
        const result = body();
        if (result && typeof result.next === 'function') {
            while (true) {
                const { value, done } = result.next();
                if (done)
                    break;
                if (value === YIELD_TOKEN) {
                    yield YIELD_TOKEN;
                }
            }
        }
        yield YIELD_TOKEN;
    }
}
//# sourceMappingURL=Scheduler.js.map