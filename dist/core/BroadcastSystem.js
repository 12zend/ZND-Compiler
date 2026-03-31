export class BroadcastSystem {
    listeners = new Map();
    pendingBroadcasts = new Map();
    messageQueue = [];
    processing = false;
    subscribe(message, handler, waitForComplete = false) {
        const id = `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const listener = { id, message, handler, waitForComplete };
        if (!this.listeners.has(message)) {
            this.listeners.set(message, []);
        }
        this.listeners.get(message).push(listener);
        return id;
    }
    unsubscribe(id) {
        for (const listeners of this.listeners.values()) {
            const index = listeners.findIndex(l => l.id === id);
            if (index !== -1) {
                listeners.splice(index, 1);
                return;
            }
        }
    }
    send(message, args) {
        this.messageQueue.push({ message, args });
        this.processQueue();
    }
    async sendAndWait(message, args) {
        return new Promise((resolve) => {
            const hasListeners = this.listeners.has(message);
            this.send(message, args);
            if (!hasListeners) {
                resolve();
                return;
            }
            this.pendingBroadcasts.set(message, new Promise((res) => {
                const listener = {
                    id: 'wait_resolver',
                    message,
                    handler: () => { },
                    waitForComplete: false,
                    resolve: res
                };
                setTimeout(() => {
                    res();
                    this.pendingBroadcasts.delete(message);
                }, 5000);
                const listeners = this.listeners.get(message);
                if (listeners) {
                    const index = listeners.findIndex(l => l.id === 'wait_resolver');
                    if (index !== -1) {
                        listeners.splice(index, 1);
                    }
                }
            }));
            this.processQueue();
        });
    }
    async processQueue() {
        if (this.processing)
            return;
        this.processing = true;
        while (this.messageQueue.length > 0) {
            const { message, args } = this.messageQueue.shift();
            await this.dispatch(message, args);
        }
        this.processing = false;
    }
    async dispatch(message, args) {
        const listeners = this.listeners.get(message);
        if (!listeners || listeners.length === 0)
            return;
        const promises = [];
        for (const listener of listeners) {
            try {
                listener.handler(message, args);
                if (listener.waitForComplete && listener.resolve) {
                    promises.push(new Promise(resolve => {
                        setTimeout(resolve, 100);
                    }));
                }
            }
            catch (err) {
                console.error(`Broadcast handler error for "${message}":`, err);
            }
        }
        await Promise.all(promises);
    }
    clear() {
        this.listeners.clear();
        this.messageQueue = [];
        this.pendingBroadcasts.clear();
    }
    getListenerCount(message) {
        if (message) {
            return this.listeners.get(message)?.length || 0;
        }
        let total = 0;
        for (const listeners of this.listeners.values()) {
            total += listeners.length;
        }
        return total;
    }
    hasListeners(message) {
        const listeners = this.listeners.get(message);
        return listeners !== undefined && listeners.length > 0;
    }
}
//# sourceMappingURL=BroadcastSystem.js.map