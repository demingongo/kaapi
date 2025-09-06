// jwt.test.ts

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { JwtAuthority, JwksKeyStore } from '../src/jwt-authority'

const KEY_PASSWORD = Buffer.from('secret_env_password', 'hex')
const CIPHER_KEY = process.env.CIPHER_KEY ? Buffer.from(process.env.CIPHER_KEY, 'hex') : randomBytes(32)

class Store implements JwksKeyStore {
    privateKey: string = ''
    publicKeys: string[] = []

    storeKeyPair(kid: string, privateKey: object, publicKey: object, ttl: number): void | Promise<void> {

        console.log('kid', kid)
        console.log('ttl :', ttl)
        //console.log('privateKey :', privateKey)
        console.log('publicKey :', publicKey)

        const key = Buffer.concat([KEY_PASSWORD], 32)
        const iv = Buffer.concat([CIPHER_KEY], 16)
        const cipher = createCipheriv('aes-256-cbc', key, iv);

        const encrypted = cipher.update(JSON.stringify(privateKey), 'utf8', 'hex') + cipher.final('hex');

        this.privateKey = encrypted
        this.publicKeys.push(JSON.stringify(publicKey))
    }
    async getPrivateKey(): Promise<object | undefined> {
        const key = Buffer.concat([KEY_PASSWORD], 32)
        const iv = Buffer.concat([CIPHER_KEY], 16)
        const cipher = createDecipheriv(
            'aes-256-cbc',
            key,
            iv
        )
        return JSON.parse(cipher.update(this.privateKey, 'hex', 'utf-8') + cipher.final('utf-8'));
    }
    async getPublicKeys(): Promise<object[]> {
        return this.publicKeys.map(v => JSON.parse(v))
    }
}

describe('JWK Generator', () => {

    it('should generate', async () => {
        const store = new Store()
        const gen = new JwtAuthority(store)
        await gen.generateKeyPair()

        await gen.generateKeyPair()

        console.log('')
        console.log('getPrivateKey:', store.getPrivateKey())

        const { token } = await gen.sign({ cool: 'yes' })


        console.log('token ===> \n', token)

        await gen.generateKeyPair()

        console.log('')
        console.log('keys ===> \n', await gen.getPublicKeys())

        console.log('verify ===> \n', await gen.verify(token))
    });
});