import type { SpriteInstance } from './ExecutionEngine';
import { ObjectPool } from '../utils/datastruct';

export interface CloneInfo {
  originId: string;
  cloneId: string;
  createdAt: number;
}

export class CloneManager {
  private clones: Map<string, SpriteInstance> = new Map();
  private cloneInfo: Map<string, CloneInfo> = new Map();
  private clonePool: ObjectPool<SpriteInstance>;
  private maxClones: number = 300;
  private cloneCounter: number = 0;

  constructor(spritePool: ObjectPool<SpriteInstance>) {
    this.clonePool = spritePool;
  }

  createClone(origin: SpriteInstance): SpriteInstance | null {
    if (this.clones.size >= this.maxClones) {
      this.cleanupOldest();
    }

    const cloneId = `clone_${++this.cloneCounter}`;
    const clone = this.clonePool.acquire();

    clone.id = cloneId;
    clone.name = origin.name;
    clone.x = origin.x;
    clone.y = origin.y;
    clone.direction = origin.direction;
    clone.size = origin.size;
    clone.rotationStyle = origin.rotationStyle;
    clone.visible = origin.visible;
    clone.costumeIndex = origin.costumeIndex;
    clone.effects = { ...origin.effects };
    clone.isClone = true;
    clone.cloneOrigin = origin.id;

    for (const [key, value] of origin.variables) {
      clone.variables.set(key, value);
    }

    this.clones.set(cloneId, clone);
    this.cloneInfo.set(cloneId, {
      originId: origin.id,
      cloneId,
      createdAt: Date.now()
    });

    return clone;
  }

  deleteClone(clone: SpriteInstance): void {
    if (!clone.isClone) return;

    this.clonePool.release(clone);
    this.clones.delete(clone.id);
    this.cloneInfo.delete(clone.id);
  }

  getClone(cloneId: string): SpriteInstance | undefined {
    return this.clones.get(cloneId);
  }

  getAllClones(): SpriteInstance[] {
    return Array.from(this.clones.values());
  }

  getClonesByOrigin(originId: string): SpriteInstance[] {
    const result: SpriteInstance[] = [];
    for (const [id, clone] of this.clones) {
      const info = this.cloneInfo.get(id);
      if (info && info.originId === originId) {
        result.push(clone);
      }
    }
    return result;
  }

  getCloneCount(): number {
    return this.clones.size;
  }

  deleteAllClones(): void {
    for (const clone of this.clones.values()) {
      this.clonePool.release(clone);
    }
    this.clones.clear();
    this.cloneInfo.clear();
  }

  private cleanupOldest(): void {
    let oldest: { id: string; time: number } | null = null;

    for (const [id, info] of this.cloneInfo) {
      if (!oldest || info.createdAt < oldest.time) {
        oldest = { id, time: info.createdAt };
      }
    }

    if (oldest) {
      const clone = this.clones.get(oldest.id);
      if (clone) {
        this.deleteClone(clone);
      }
    }
  }

  deleteClonesOf(originId: string): void {
    const toDelete = this.getClonesByOrigin(originId);
    for (const clone of toDelete) {
      this.deleteClone(clone);
    }
  }
}
