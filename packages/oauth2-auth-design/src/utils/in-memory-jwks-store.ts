import { JWKSStore, JWKS } from './jwks-store'

/**
 * InMemoryJWKSStore class
 */
export class InMemoryJWKSStore implements JWKSStore {
    private jwks?: JWKS
    private expiresAt?: number
    private timeout?: NodeJS.Timeout

    async get(): Promise<JWKS | undefined> {
        if (this.expiresAt && Date.now() > this.expiresAt) {
            this.jwks = undefined
            this.expiresAt = undefined
        }
        return this.jwks
    }

    async set(jwks: JWKS, ttlSeconds?: number): Promise<void> {
        this.jwks = jwks
        if (this.timeout) {
            clearTimeout(this.timeout)
        }
        if (ttlSeconds) {
            this.expiresAt = Date.now() + ttlSeconds * 1000
            this.timeout = setTimeout(() => {
                this.jwks = undefined
                this.expiresAt = undefined
            }, ttlSeconds * 1000)
        } else {
            this.expiresAt = undefined
        }
    }
}

let inMemoryJWKSStore: InMemoryJWKSStore;

export function getInMemoryJWKSStore(): InMemoryJWKSStore {
    if (!inMemoryJWKSStore) {
        inMemoryJWKSStore = new InMemoryJWKSStore()
    }
    return inMemoryJWKSStore
}