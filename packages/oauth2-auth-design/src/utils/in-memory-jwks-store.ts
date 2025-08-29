import { JWKSStore, JWKS } from './jwks-store'

interface JWKCacheEntry {
    jwk: JWKS['keys'][number];
    meta?: {
        expiresAt: number;
        ttl: number;
        timeout: NodeJS.Timeout;
    }
}

export interface InMemoryJWKSStoreOptions {
    /**
     * The minimum remaining time (in seconds) on the most recent entry before the store considers adding more entries.
     */
    timeThreshold?: number
}

/**
 * InMemoryJWKSStore class
 */
export class InMemoryJWKSStore implements JWKSStore {
    private store = new Map<string, JWKCacheEntry>();

    private timeThreshold?: number

    /**
     * 
     * @param timeThreshold The minimum remaining time (in seconds) on the most recent entry before the store considers adding more entries.
     */
    constructor(options?: InMemoryJWKSStoreOptions) {
        this.timeThreshold = options?.timeThreshold
    }

    async get(): Promise<JWKS | undefined> {
        const keys = [...this.store.values()].map(entry => entry.jwk);
        return { keys }
    }

    async set(jwks: JWKS, ttlSeconds?: number): Promise<void> {
        for (const jwk of jwks.keys) {
            const key = `${jwk.kid}`;
            const existing = this.store.get(key);

            if (existing) continue;

            const entry: JWKCacheEntry = {
                jwk,
            };

            if (ttlSeconds) {
                entry.meta = {
                    expiresAt: Date.now() + ttlSeconds * 1000,
                    ttl: ttlSeconds * 1000,
                    timeout: setTimeout(() => {
                        this.clearEntry(key)
                    }, ttlSeconds * 1000)
                }

                this.store.set(key, entry);
            }
        }
    }

    async needsMoreEntries(): Promise<boolean> {
        if (!this.timeThreshold) return false

        let mostAheadMeta: JWKCacheEntry['meta'] | undefined;
        for (const entry of this.store.values()) {
            if (entry.meta) {
                if (!mostAheadMeta) {
                    mostAheadMeta = entry.meta
                } else if (entry.meta.expiresAt && entry.meta.expiresAt > mostAheadMeta.expiresAt) {
                    mostAheadMeta = entry.meta
                }
            }
        }
        // true if even most ahead meta is too old
        return !!(mostAheadMeta && ((this.timeThreshold * 1000) >= (mostAheadMeta.expiresAt - Date.now())))
    }

    private clearEntry(key: string) {
        const entry = this.store.get(key);
        if (entry?.meta?.timeout) {
            clearTimeout(entry.meta.timeout);
        }
        this.store.delete(key);
    }
}

/*
let inMemoryJWKSStore: InMemoryJWKSStore;


export function getInMemoryJWKSStore(timeThreshold?: number): InMemoryJWKSStore {
    if (!inMemoryJWKSStore) {
        inMemoryJWKSStore = new InMemoryJWKSStore(timeThreshold)
    }
    return inMemoryJWKSStore
}
*/

export function getInMemoryJWKSStore(options?: InMemoryJWKSStoreOptions): InMemoryJWKSStore {
    return new InMemoryJWKSStore(options)
}