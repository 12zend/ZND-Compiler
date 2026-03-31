export class CloneManager {
    clones = new Map();
    cloneInfo = new Map();
    clonePool;
    maxClones = 300;
    cloneCounter = 0;
    constructor(spritePool) {
        this.clonePool = spritePool;
    }
    createClone(origin) {
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
    deleteClone(clone) {
        if (!clone.isClone)
            return;
        this.clonePool.release(clone);
        this.clones.delete(clone.id);
        this.cloneInfo.delete(clone.id);
    }
    getClone(cloneId) {
        return this.clones.get(cloneId);
    }
    getAllClones() {
        return Array.from(this.clones.values());
    }
    getClonesByOrigin(originId) {
        const result = [];
        for (const [id, clone] of this.clones) {
            const info = this.cloneInfo.get(id);
            if (info && info.originId === originId) {
                result.push(clone);
            }
        }
        return result;
    }
    getCloneCount() {
        return this.clones.size;
    }
    deleteAllClones() {
        for (const clone of this.clones.values()) {
            this.clonePool.release(clone);
        }
        this.clones.clear();
        this.cloneInfo.clear();
    }
    cleanupOldest() {
        let oldest = null;
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
    deleteClonesOf(originId) {
        const toDelete = this.getClonesByOrigin(originId);
        for (const clone of toDelete) {
            this.deleteClone(clone);
        }
    }
}
//# sourceMappingURL=CloneManager.js.map