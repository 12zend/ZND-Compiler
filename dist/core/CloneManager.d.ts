import type { SpriteInstance } from './ExecutionEngine';
import { ObjectPool } from '../utils/datastruct';
export interface CloneInfo {
    originId: string;
    cloneId: string;
    createdAt: number;
}
export declare class CloneManager {
    private clones;
    private cloneInfo;
    private clonePool;
    private maxClones;
    private cloneCounter;
    constructor(spritePool: ObjectPool<SpriteInstance>);
    createClone(origin: SpriteInstance): SpriteInstance | null;
    deleteClone(clone: SpriteInstance): void;
    getClone(cloneId: string): SpriteInstance | undefined;
    getAllClones(): SpriteInstance[];
    getClonesByOrigin(originId: string): SpriteInstance[];
    getCloneCount(): number;
    deleteAllClones(): void;
    private cleanupOldest;
    deleteClonesOf(originId: string): void;
}
//# sourceMappingURL=CloneManager.d.ts.map