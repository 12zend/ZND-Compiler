export type BroadcastHandler = (message: string, args?: any[]) => void;
export declare class BroadcastSystem {
    private listeners;
    private pendingBroadcasts;
    private messageQueue;
    private processing;
    subscribe(message: string, handler: BroadcastHandler, waitForComplete?: boolean): string;
    unsubscribe(id: string): void;
    send(message: string, args?: any[]): void;
    sendAndWait(message: string, args?: any[]): Promise<void>;
    private processQueue;
    private dispatch;
    clear(): void;
    getListenerCount(message?: string): number;
    hasListeners(message: string): boolean;
}
//# sourceMappingURL=BroadcastSystem.d.ts.map