import { expect } from 'chai'
import { JwtAuthority, JwksRotator, JwksKeyStore, JwksRotationTimestampStore } from './jwt-authority' // adjust path
import { JWTPayload } from 'jose'
import { createLogger } from '@kaapi/kaapi';

// In-memory key store for testing
class InMemoryKeyStore implements JwksKeyStore, JwksRotationTimestampStore {
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
        return this.publicKeys.filter(k => k.exp > now).map(k => k.key);
    }

    async getLastRotationTimestamp(): Promise<number> {
        return this.lastRotation;
    }

    async setLastRotationTimestamp(msDate: number): Promise<void> {
        this.lastRotation = msDate;
    }
}

describe('JwtAuthority', () => {
    let keyStore: InMemoryKeyStore;
    let jwt: JwtAuthority;

    beforeEach(() => {
        keyStore = new InMemoryKeyStore();
        jwt = new JwtAuthority(keyStore);
    });

    it('should sign and verify a JWT', async () => {
        const payload: JWTPayload = { sub: 'user-123', role: 'admin' };
        const { token, kid } = await jwt.sign(payload);
        expect(token).to.be.a('string');
        expect(kid).to.be.a('string');

        const verified = await jwt.verify(token);
        expect(verified.sub).to.equal('user-123');
        expect(verified.role).to.equal('admin');
    });

    it('should return current kid', async () => {
        await jwt.generateKeyPair();
        const kid = await jwt.getCurrentKid();
        expect(kid).to.be.a('string');
    });

    it('should return public keys for JWKS endpoint', async () => {
        await jwt.generateKeyPair();
        const keys = await jwt.getJwksEndpointResponse();
        expect(keys).to.have.property('keys');
        expect(keys.keys.length).to.be.greaterThan(0);
    });

    it('should throw on invalid token', async () => {
        try {
            await jwt.verify('eyJ4Ijo1LCJ5Ijo2fQ==');
            expect.fail('Expected error was not thrown');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            expect(err.message).to.include('Invalid or missing "kid"');
        }
    });
});

describe('JwksRotator', () => {
    let keyStore: InMemoryKeyStore;
    let jwt: JwtAuthority;
    let rotator: JwksRotator;

    beforeEach(() => {
        keyStore = new InMemoryKeyStore();
        jwt = new JwtAuthority(keyStore);
        rotator = new JwksRotator({
            keyGenerator: jwt,
            rotatorKeyStore: keyStore,
            rotationIntervalMs: 1000 * 60 * 60 * 24, // 1 day
            logger: createLogger()
        });
    });

    it('should rotate keys when due', async () => {
        await rotator.checkAndRotateKeys();
        const kid = await jwt.getCurrentKid();
        expect(kid).to.be.a('string');
    });

    it('should not rotate keys if recently rotated', async () => {
        await rotator.checkAndRotateKeys();
        const firstKid = await jwt.getCurrentKid();

        await rotator.checkAndRotateKeys(); // Should skip rotation
        const secondKid = await jwt.getCurrentKid();

        expect(firstKid).to.equal(secondKid);
    });
});
