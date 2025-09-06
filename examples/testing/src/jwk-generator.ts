import jose from 'node-jose'
import jwktopem from 'jwk-to-pem'
import { JWTPayload, jwtVerify } from 'jose'

export interface JWKSStore {
    setKeys(privateKey: string, publicKey: string, ttl: number): void | Promise<void>
    getPrivateKey(): Promise<string | undefined> | string | undefined
    getPublicKeys(): Promise<string[] | undefined> | string[] | undefined
}

export class JWKGenerator {

    #store: JWKSStore;
    /**
     * seconds
     */
    #ttl: number;

    /**
     * 
     * @param store 
     * @param ttl seconds
     */
    constructor(store: JWKSStore, ttl: number = 36000) {
        this.#store = store
        this.#ttl = ttl
    }

    private async _saveKeys(key: jose.JWK.Key) {
        const pub = key.toJSON()
        const priv = key.toJSON(true)

        await this.#store.setKeys(JSON.stringify(priv), JSON.stringify(pub), this.#ttl)
    }

    private async _generateKeyPair(keyStore: jose.JWK.KeyStore): Promise<jose.JWK.Key> {
        return await keyStore.generate('RSA', 2048, { alg: 'RS256', use: 'sig' })
    }

    private async _getPrivateKey(): Promise<jose.JWK.Key> {
        const privateJwk = await this.#store.getPrivateKey()
        if (privateJwk) {
            return await jose.JWK.asKey(JSON.parse(privateJwk));
        } else {
            const keyStore = jose.JWK.createKeyStore()
            const key = await this._generateKeyPair(keyStore)
            await this._saveKeys(key)
            return key
        }
    }

    private async _getPublicKeyStore(): Promise<jose.JWK.KeyStore> {
        const publicJwks = await this.#store.getPublicKeys()
        let keyStore: jose.JWK.KeyStore
        if (publicJwks?.length) {
            const keys = []
            for (const k of publicJwks) {
                keys.push(JSON.parse(k))
            }
            keyStore = await jose.JWK.asKeyStore(JSON.stringify({ keys }))
        } else {
            keyStore = jose.JWK.createKeyStore()
        }
        const arr = keyStore.all({ use: 'sig' })
        if (!arr.length) {
            const key = await this._generateKeyPair(keyStore)
            await this._saveKeys(key)
        }
        return keyStore
    }

    async getPublicKeys(): Promise<object> {
        const keyStore = await this._getPublicKeyStore()
        const json = keyStore.toJSON()
        if (json && 'keys' in json && Array.isArray(json.keys)) {
            json.keys.reverse()
        }
        return json
    }

    async getPublicKey(kid: string) {
        const keyStore = await this._getPublicKeyStore()
        return keyStore.get(kid).toJSON() as jwktopem.RSA
    }

    async generateKeyPair() {
        const keyStore = jose.JWK.createKeyStore();
        const key = await this._generateKeyPair(keyStore);
        await this._saveKeys(key)
    }

    async sign(payload: JWTPayload) {
        const key = await this._getPrivateKey()

        if (!key) throw new Error('sign: KEY STORE IS EMPTY')

        const result = await jose.JWS.createSign({ compact: true, fields: { typ: 'jwt' } }, key)
            .update(typeof payload === 'string' || payload instanceof Buffer ? payload : JSON.stringify(payload))
            .final()
        return `${result}`
    }

    async verify(token: string) {
        const [header] = token.split('.')
        const kid = JSON.parse(Buffer.from(header, 'base64url').toString())?.kid
        const { payload } = await jwtVerify(
            token,
            await this.getPublicKey(kid)
        )
        return payload
    }
}