import { JwtPayload, verify } from 'jsonwebtoken'
import jose from 'node-jose'
import jwktopem from 'jwk-to-pem'
import { JWKSStore } from './jwks-store'

/**
 * JWKSGenerator class
 */
export class JWKSGenerator {

    #store: JWKSStore

    #ttlSeconds?: number

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

    async generateIfEmpty(): Promise<void> {
        await this._generateIfEmpty()
    }

    /**
     * Generate a new key pair
     */
    async generate(): Promise<void> {
        const keyStore = await this._retrieveKeyStore()
        await keyStore.generate('RSA', 2048, { alg: 'RS256', use: 'sig' })
        await this._saveKeyStore(keyStore)
    }

    async sign(payload: string | Buffer | JwtPayload) {
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