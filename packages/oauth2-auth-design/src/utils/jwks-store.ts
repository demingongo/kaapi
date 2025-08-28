/**
 * JWKS interface
 */
export interface JWKS {
    keys: Array<Record<string, unknown>>
}

/**
 * JWKSStore interface
 */
export interface JWKSStore {
    get(): Promise<JWKS | undefined>
    set(jwks: JWKS, ttlSeconds?: number): Promise<void>
    needsMoreEntries(): Promise<boolean> 
}