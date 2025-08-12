import { JwtPayload, verify } from 'jsonwebtoken'
import jose from 'node-jose'
import jwktopem from 'jwk-to-pem'
import { JWKSStore } from './jwks-store'

export { JwtPayload } from 'jsonwebtoken'

export interface OAuth2JwtPayload extends JwtPayload {
    /**
     * Identifier of the Identity Provider (IdP), usually a URL
     */
    iss: string
    /**
     * Identifier for the authenticated user (unique per iss)
     */
    sub: string
    /**
     * Client ID of the relying party (the app that receives the token)
     */
    aud: string | string[]
    /**
     *  Must be present if a nonce was included in the original request (used to prevent replay attacks)
     */
    nonce?: string
    /**
     * Time when the user actually authenticated. Required if the max_age parameter was used in the auth request
     */
    auth_time?: number
}

export async function createIDToken(
    generator: JWKSGenerator,
    payload: OAuth2JwtPayload
): Promise<string> {
    
    const ttlSeconds = generator.ttl
    const now = Math.floor(Date.now() / 1000)
                                           
    return await generator.sign({
        ...( payload ),
        exp: typeof ttlSeconds === 'number' ? now + ttlSeconds : payload?.exp,
        iat: now
    })
}

/**
 * JWKSGenerator class
 */
export class JWKSGenerator {

    #store: JWKSStore

    #ttlSeconds?: number

    /**
     * ttl in seconds
     */
    get ttl(): number | undefined {
        return this.#ttlSeconds
    }

    /**
     * ttl in seconds
     */
    set ttl(ttlSeconds: number | undefined) {
        if (['number', 'undefined'].includes(typeof ttlSeconds))
            this.#ttlSeconds = ttlSeconds
    }

    constructor(store: JWKSStore, ttlSeconds?: number) {
        this.#store = store
        this.#ttlSeconds = ttlSeconds
    }

    private async _retrieveKeyStore(): Promise<jose.JWK.KeyStore> {
        const ks = await this.#store.get()
        if (ks?.keys?.length) {
            return await jose.JWK.asKeyStore(JSON.stringify(ks))
        } else {
            return jose.JWK.createKeyStore()
        }
    }

    private async _saveKeyStore(keyStore: jose.JWK.KeyStore): Promise<void> {
        const json = keyStore.toJSON(true)

        if (json && 'keys' in json && Array.isArray(json.keys)) {
            await this.#store.set({ keys: json.keys }, this.#ttlSeconds)
        }
    }

    private async _generateIfEmpty(): Promise<jose.JWK.KeyStore> {
        const keyStore = await this._retrieveKeyStore()
        const arr = keyStore.all({ use: 'sig' })
        if (!arr.length) {
            await keyStore.generate('RSA', 2048, { alg: 'RS256', use: 'sig' })
            await this._saveKeyStore(keyStore)
        }
        return keyStore
    }

    async generateIfEmpty(): Promise<object> {
        const keyStore = await this._generateIfEmpty()
        const json = keyStore.toJSON()
        if (json && 'keys' in json && Array.isArray(json.keys)) {
            json.keys.reverse()
        }
        return json
    }

    /**
     * Generate a new key pair
     */
    async generate(): Promise<void> {
        const keyStore = await this._retrieveKeyStore()
        await keyStore.generate('RSA', 2048, { alg: 'RS256', use: 'sig' })
        await this._saveKeyStore(keyStore)
    }

    async sign(payload: JwtPayload) {
        const keyStore = await this._generateIfEmpty()
        const key = keyStore.all({ use: 'sig' })
            .pop()

        if (!key) throw new Error('sign: KEY STORE IS EMPTY')

        const result = await jose.JWS.createSign({ compact: true, fields: { typ: 'jwt' } }, key)
            .update(typeof payload === 'string' || payload instanceof Buffer ? payload : JSON.stringify(payload))
            .final()
        return `${result}`
    }

    /**
     * Get public keys
     */
    async get(): Promise<object> {
        const keyStore = await this._retrieveKeyStore()
        const json = keyStore.toJSON()
        if (json && 'keys' in json && Array.isArray(json.keys)) {
            json.keys.reverse()
        }
        return json
    }

    async getPublicKey(kid: string) {
        const keyStore = await this._retrieveKeyStore()
        return keyStore.get(kid).toJSON() as jwktopem.RSA
    }

    async getPublicKeyAsPem(kid: string) {
        const key = await this.getPublicKey(kid)
        return jwktopem(key)
    }

    async verify(token: string) {
        const [header] = token.split('.')
        const kid = JSON.parse(Buffer.from(header, 'base64url').toString())?.kid
        const publicKey = await this.getPublicKeyAsPem(kid)
        return verify(token, publicKey)
    }
}