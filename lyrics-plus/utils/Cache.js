// Cache.js - Cache-Aside Pattern (L1 RAM + L2 IndexedDB)
// L1: Small LRU in RAM (~20 items) - instant access
// L2: IndexedDB via IDBCache - unlimited persistence

const CacheManager = {
    _l1Cache: new Map(),      // L1: RAM cache (small LRU)
    _l1MaxSize: 20,           // Only keep ~20 recent items in RAM
    _ttl: 365 * 24 * 60 * 60 * 1000, // 1 year TTL
    _persistKey: 'lyrics-plus:translation-cache',
    _migrated: false,
    _migrationPromise: null,
    _revision: 0,
    _l2Queue: Promise.resolve(),

    /**
     * Migrate localStorage to IndexedDB (one-time)
     * Called internally on first get/set
     */
    _migrate() {
        if (!this._migrationPromise) this._migrationPromise = this._runMigration();
        return this._migrationPromise;
    },

    async _runMigration() {
        if (this._migrated) return;
        this._migrated = true;

        try {
            const migratedFlag = localStorage.getItem('lyrics-plus:idb-migrated');
            if (migratedFlag === 'true') return;

            const persisted = localStorage.getItem(this._persistKey);
            if (persisted) {
                const data = JSON.parse(persisted);
                const count = await IDBCache.bulkImport(data);
                if (count > 0) {

                    localStorage.removeItem(this._persistKey);
                    localStorage.setItem('lyrics-plus:idb-migrated', 'true');
                }
            } else {
                localStorage.setItem('lyrics-plus:idb-migrated', 'true');
            }
        } catch (e) {
            console.warn('[Cache] Migration failed:', e);
        }
    },

    /**
     * Get item from cache (async - checks L1 then L2)
     * @param {string} key
     * @returns {Promise<any|null>}
     */
    async get(key) {
        // Input validation
        if (!key || typeof key !== 'string') return null;

        // Check L1 first (instant)
        const l1Item = this._l1Cache.get(key);
        if (l1Item) {
            if (Date.now() < l1Item.expiry) {
                l1Item.lastAccessed = Date.now();
                return l1Item.data;
            }
            this._l1Cache.delete(key);
        }

        // L1 miss - check L2 (IndexedDB)
        const revision = this._revision;
        await this._migrate();
        const data = await IDBCache.get(key);
        if (revision !== this._revision) return null;

        if (data !== null) {
            // Promote to L1 for fast subsequent access
            this._l1Set(key, data);
        }

        return data;
    },

    /**
     * Get item from L1 cache ONLY (synchronous)
     * Use this for hot paths where async is not acceptable
     * @param {string} key
     * @returns {any|null}
     */
    getSync(key) {
        if (!key || typeof key !== 'string') return null;
        
        const l1Item = this._l1Cache.get(key);
        if (l1Item && Date.now() < l1Item.expiry) {
            l1Item.lastAccessed = Date.now();
            return l1Item.data;
        }
        
        if (l1Item) this._l1Cache.delete(key); // Expired
        return null;
    },

    /**
     * Internal L1 set with LRU eviction
     */
    _l1Set(key, data) {
        this._l1Cache.delete(key);
        if (this._l1Cache.size >= this._l1MaxSize) {
            let oldestKey, oldestTime = Infinity;
            for (const [candidate, item] of this._l1Cache) {
                if (item.lastAccessed < oldestTime) { oldestKey = candidate; oldestTime = item.lastAccessed; }
            }
            this._l1Cache.delete(oldestKey);
        }

        this._l1Cache.set(key, {
            data,
            expiry: Date.now() + this._ttl,
            lastAccessed: Date.now()
        });
    },

    /**
     * Set item in cache
     * L1: Sync (immediate)
     * L2: Async (fire-and-forget, debounced)
     * @param {string} key
     * @param {any} data
     * @param {boolean} persist - Whether to persist to L2
     */
    set(key, data, persist = true) {
        // Input validation
        if (!key || typeof key !== 'string') return;

        // L1: Immediate
        this._l1Set(key, data);

        // L2: Fire-and-forget (async, debounced)
        if (persist) {
            this._scheduleL2Write(key, data);
        }
    },

    _pendingWrites: new Map(),
    _writeTimeout: null,

    _scheduleL2Write(key, data) {
        this._pendingWrites.set(key, data);

        // Debounce writes to batch them
        if (this._writeTimeout) clearTimeout(this._writeTimeout);
        this._writeTimeout = setTimeout(() => this._flushL2Writes(), 2000);
    },

    _enqueueL2(operation) {
        const result = this._l2Queue.then(operation);
        this._l2Queue = result.catch(() => {});
        return result;
    },

    _flushL2Writes() {
        this._writeTimeout = null;
        const batch = [...this._pendingWrites];
        this._pendingWrites.clear();
        return this._enqueueL2(async () => {
            await this._migrate();
            await IDBCache.setMany(batch, this._ttl);
        });
    },

    /**
     * Delete item from both L1 and L2
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async delete(key) {
        this._revision++;
        this._pendingWrites.delete(key);
        const l1Existed = this._l1Cache.delete(key);
        const l2Deleted = await this._enqueueL2(async () => { await this._migrate(); return IDBCache.delete(key); });
        return l1Existed || l2Deleted;
    },

    /**
     * Clear all cache (L1 and L2)
     * @returns {Promise<void>}
     */
    async clear() {
        this._revision++;
        clearTimeout(this._writeTimeout);
        this._writeTimeout = null;
        this._pendingWrites.clear();
        this._l1Cache.clear();
        await this._enqueueL2(async () => { await this._migrate(); return IDBCache.clear(); });

    },

    /**
     * Clear L1 cache only (synchronous)
     * Use for immediate cache invalidation without async
     */
    clearL1() {
        this._revision++;
        this._l1Cache.clear();
    },

    /**
     * Clear cache entries for a specific URI
     * @param {string} uri
     * @returns {Promise<number>}
     */
    async clearByUri(uri) {
        this._revision++;
        for (const key of this._pendingWrites.keys()) if (key.includes(uri)) this._pendingWrites.delete(key);
        let count = 0;

        // Clear from L1
        for (const [key] of this._l1Cache) {
            if (key.includes(uri)) {
                this._l1Cache.delete(key);
                count++;
            }
        }

        // L2: Clear from IndexedDB too
        try {
            const l2Count = await this._enqueueL2(async () => { await this._migrate(); return IDBCache.deleteByPattern(uri); });
            count += l2Count;
        } catch (e) {
            console.warn('[Cache] Failed to clear L2 entries for URI:', uri, e);
        }

        return count;
    },

    /**
     * Get cache statistics
     */
    get stats() {
        return {
            l1Size: this._l1Cache.size,
            l1MaxSize: this._l1MaxSize,
            ttlDays: this._ttl / (24 * 60 * 60 * 1000)
        };
    }
};
