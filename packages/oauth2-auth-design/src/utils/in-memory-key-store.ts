import { JwksKeyStore, JwksRotationTimestampStore } from './jwt-authority';

// In-memory key store for testing
export class InMemoryKeyStore implements JwksKeyStore, JwksRotationTimestampStore {
    private privateKey?: object;
    private publicKeys: { key: object; exp: number }[] = [];
    private lastRotation: number = 0;

    async storeKeyPair(_kid: string, privateKey: object, publicKey: object, ttl: number): Promise<void> {
        this.privateKey = privateKey;
        const exp = Date.now() + ttl * 1000;
        this.publicKeys.push({ key: publicKey, exp });
    }

    async getPrivateKey(): Promise<object | undefined> {
        return this.privateKey;
    }

    async getPublicKeys(): Promise<object[]> {
        const now = Date.now();
        this.publicKeys = this.publicKeys.filter(k => k.exp > now)
        return this.publicKeys.map(k => k.key);
    }

    async getLastRotationTimestamp(): Promise<number> {
        return this.lastRotation;
    }

    async setLastRotationTimestamp(msDate: number): Promise<void> {
        this.lastRotation = msDate;
    }
}

export function createInMemoryKeyStore(): InMemoryKeyStore {
    return new InMemoryKeyStore()
}