import type { PrimitiveValue } from '../types';

export type BroadcastHandler = (message: string, args?: any[]) => void;

interface BroadcastListener {
  id: string;
  message: string;
  handler: BroadcastHandler;
  waitForComplete: boolean;
  resolve?: (value?: any) => void;
}

export class BroadcastSystem {
  private listeners: Map<string, BroadcastListener[]> = new Map();
  private pendingBroadcasts: Map<string, Promise<void>> = new Map();
  private messageQueue: { message: string; args?: any[] }[] = [];
  private processing: boolean = false;

  subscribe(
    message: string,
    handler: BroadcastHandler,
    waitForComplete: boolean = false
  ): string {
    const id = `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const listener: BroadcastListener = { id, message, handler, waitForComplete };
    
    if (!this.listeners.has(message)) {
      this.listeners.set(message, []);
    }
    this.listeners.get(message)!.push(listener);

    return id;
  }

  unsubscribe(id: string): void {
    for (const listeners of this.listeners.values()) {
      const index = listeners.findIndex(l => l.id === id);
      if (index !== -1) {
        listeners.splice(index, 1);
        return;
      }
    }
  }

  send(message: string, args?: any[]): void {
    this.messageQueue.push({ message, args });
    this.processQueue();
  }

  async sendAndWait(message: string, args?: any[]): Promise<void> {
    return new Promise<void>((resolve) => {
      const hasListeners = this.listeners.has(message);
      
      this.send(message, args);

      if (!hasListeners) {
        resolve();
        return;
      }

      this.pendingBroadcasts.set(message, new Promise<void>((res) => {
        const listener: BroadcastListener = {
          id: 'wait_resolver',
          message,
          handler: () => {},
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

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.messageQueue.length > 0) {
      const { message, args } = this.messageQueue.shift()!;
      await this.dispatch(message, args);
    }

    this.processing = false;
  }

  private async dispatch(message: string, args?: any[]): Promise<void> {
    const listeners = this.listeners.get(message);
    if (!listeners || listeners.length === 0) return;

    const promises: Promise<void>[] = [];

    for (const listener of listeners) {
      try {
        listener.handler(message, args);
        
        if (listener.waitForComplete && listener.resolve) {
          promises.push(new Promise(resolve => {
            setTimeout(resolve, 100);
          }));
        }
      } catch (err) {
        console.error(`Broadcast handler error for "${message}":`, err);
      }
    }

    await Promise.all(promises);
  }

  clear(): void {
    this.listeners.clear();
    this.messageQueue = [];
    this.pendingBroadcasts.clear();
  }

  getListenerCount(message?: string): number {
    if (message) {
      return this.listeners.get(message)?.length || 0;
    }
    let total = 0;
    for (const listeners of this.listeners.values()) {
      total += listeners.length;
    }
    return total;
  }

  hasListeners(message: string): boolean {
    const listeners = this.listeners.get(message);
    return listeners !== undefined && listeners.length > 0;
  }
}
