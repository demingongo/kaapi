import jose from 'node-jose'
import jwktopem from 'jwk-to-pem'
import { JWTPayload, jwtVerify, JWTHeaderParameters } from 'jose'
import { ILogger } from '@kaapi/kaapi'

export interface JwksKeyStore {
    /**
     * Stores the current active private key and its corresponding public key.
     * The public key will be kept for the duration of the TTL for JWKS purposes.
     */
    storeKeyPair(kid: string, privateKey: object, publicKey: object, ttl: number): void | Promise<void>
    /**
     * Retrieves the current private key used for signing.
     */
    getPrivateKey(): Promise<object | undefined>
    /**
     * Retrieves all valid public keys that have not expired.
     * These are used for exposing in JWKS.
     */
    getPublicKeys(): Promise<object[]>
}

export interface KeyGenerator {
    generateKeyPair(): Promise<void>
}

/**
 * - Generates JWK key pairs
 * - Signs JWTs
 * - Verifies JWTs
 * - Exposes public keys (for JWKS endpoint)
 */
export class JwtAuthority implements KeyGenerator {

    #store: JwksKeyStore;
    /**
     * seconds
     */
    #ttl: number;

    /**
     * 
     * @param store 
     * @param ttl seconds
     */
    constructor(store: JwksKeyStore, ttl: number = 36000) {
        this.#store = store
        this.#ttl = ttl
    }

    async #saveKeys(key: jose.JWK.Key) {
        const pub = key.toJSON()
        const priv = key.toJSON(true)

        await this.#store.storeKeyPair(('kid' in pub && `${pub.kid}`) || '', priv, pub, this.#ttl)
    }

    async #generateKeyPair(keyStore: jose.JWK.KeyStore): Promise<jose.JWK.Key> {
        return await keyStore.generate('RSA', 2048, { alg: 'RS256', use: 'sig' })
    }

    async #getPrivateKey(): Promise<jose.JWK.Key> {
        const privateJwk = await this.#store.getPrivateKey()
        if (privateJwk) {
            return await jose.JWK.asKey(privateJwk);
        } else {
            const keyStore = jose.JWK.createKeyStore()
            const key = await this.#generateKeyPair(keyStore)
            await this.#saveKeys(key)
            return key
        }
    }

    async #getPublicKeyStore(): Promise<jose.JWK.KeyStore> {
        const publicJwks = await this.#store.getPublicKeys()
        let keyStore: jose.JWK.KeyStore
        if (publicJwks?.length) {
            const keys = []
            for (const k of publicJwks) {
                keys.push(k)
            }
            keyStore = await jose.JWK.asKeyStore(JSON.stringify({ keys }))
        } else {
            keyStore = jose.JWK.createKeyStore()
        }
        const arr = keyStore.all({ use: 'sig' })
        if (!arr.length) {
            const key = await this.#generateKeyPair(keyStore)
            await this.#saveKeys(key)
        }
        return keyStore
    }

    async getPublicKeys(): Promise<{ keys: jose.JWK.RawKey[] }> {
        const keyStore = await this.#getPublicKeyStore()
        const json = keyStore.toJSON() as ({ keys: jose.JWK.RawKey[] })
        if (json && 'keys' in json && Array.isArray(json.keys)) {
            json.keys = [...json.keys].reverse()
        }
        return json
    }

    /**
     * Get current kid for observability/debugging
     */
    async getCurrentKid(): Promise<string | undefined> {
        const key = await this.#getPrivateKey()
        return key?.kid
    }

    /**
     * Helper for JWKS endpoint
     */
    getJwksEndpointResponse(): Promise<{ keys: jose.JWK.RawKey[] }> {
        return this.getPublicKeys()
    }

    async getPublicKey(kid: string): Promise<jwktopem.RSA | undefined> {
        const keyStore = await this.#getPublicKeyStore()
        const key = keyStore.get(kid)
        return key ? (key.toJSON() as jwktopem.RSA) : undefined
    }

    async generateKeyPair(): Promise<void> {
        const keyStore = jose.JWK.createKeyStore();
        const key = await this.#generateKeyPair(keyStore);
        await this.#saveKeys(key)
    }

    async sign(payload: JWTPayload): Promise<{ token: string; kid: string; }> {
        const key = await this.#getPrivateKey()

        if (!key) throw new Error('sign: KEY STORE IS EMPTY')

        const result = await jose.JWS.createSign({ compact: true, fields: { typ: 'jwt', alg: 'RS256' } }, key)
            .update(typeof payload === 'string' || payload instanceof Buffer ? payload : JSON.stringify(payload))
            .final()

        const kid: string = key.kid
        return { token: `${result}`, kid }
    }

    async verify<P extends JWTPayload = JWTPayload>(token: string): Promise<P> {
        const [header] = token.split('.')
        const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString()) as JWTHeaderParameters
        const kid = parsedHeader.kid

        if (!kid || typeof kid !== 'string') throw new Error('Invalid or missing "kid" in JWT header');

        const key = await this.getPublicKey(kid)

        if (!key) throw new Error(`Key with kid "${kid}" not found`)

        const { payload, protectedHeader } = await jwtVerify<P>(token, key)

        if (protectedHeader.alg !== 'RS256') {
            throw new Error(`Unexpected algorithm: ${protectedHeader.alg}`)
        }

        return payload
    }
}

export interface JwksRotationTimestampStore {
    getLastRotationTimestamp(): Promise<number>
    setLastRotationTimestamp(rotationTimestamp: number): Promise<void>
}

export interface JwksRotatorOptions {
    keyGenerator: KeyGenerator;
    rotatorKeyStore: JwksRotationTimestampStore;
    rotationIntervalMs: number; // e.g., 180 days
    logger?: ILogger;
}

export class JwksRotator {
    private readonly keyGenerator: KeyGenerator;
    private readonly rotatorKeyStore: JwksRotationTimestampStore ;
    private readonly rotationIntervalMs: number;
    private readonly logger: JwksRotatorOptions['logger']

    constructor({ keyGenerator, rotationIntervalMs, rotatorKeyStore, logger }: JwksRotatorOptions) {
        this.keyGenerator = keyGenerator;
        this.rotationIntervalMs = rotationIntervalMs;
        this.rotatorKeyStore = rotatorKeyStore;
        this.logger = logger
    }

    /**
     * Checks if rotation is due, and performs rotation if necessary.
     * Should be called at service startup or on a schedule (e.g. every hour).
     */
    public async checkAndRotateKeys(): Promise<void> {
        const now = Date.now();
        const lastRotation = await this.rotatorKeyStore.getLastRotationTimestamp();

        if (isNaN(lastRotation) || now - lastRotation >= this.rotationIntervalMs) {
            this.logger?.info('[JWKS] Rotating signing keys...');
            await this.rotateKeys();
            await this.rotatorKeyStore.setLastRotationTimestamp(now);
        } else {
            const nextIn = this.rotationIntervalMs - (now - lastRotation);
            this.logger?.info(`[JWKS] Key rotation not needed. Next rotation in ${Math.round(nextIn / 1000 / 60)} minutes`);
        }
    }

    private async rotateKeys(): Promise<void> {
        await this.keyGenerator.generateKeyPair();
    }
}