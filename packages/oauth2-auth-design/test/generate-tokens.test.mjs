import { expect } from 'chai';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

describe('generate tokens', function () {
    it('should generate a DPoP token', async () => {
        // Step 1: Generate EC key pair (P-256)
        const { publicKey, privateKey } = await generateKeyPair('ES256');

        // Step 2: Export public JWK
        const publicJwk = await exportJWK(publicKey);
        publicJwk.alg = 'ES256';
        publicJwk.use = 'sig';

        // Step 3: Build DPoP payload
        const htm = 'GET';
        const htu = 'http://localhost:3000/';
        const jti = crypto.randomUUID();
        const iat = Math.floor(Date.now() / 1000); // seconds

        // Step 4: Create and sign DPoP JWT
        const dpop = await new SignJWT({
            htm,
            htu,
            jti,
            iat,
        })
            .setProtectedHeader({
                alg: 'ES256',
                typ: 'dpop+jwt',
                jwk: publicJwk,
            })
            .sign(privateKey);

        // Output the token and key
        console.log('🔐 DPoP Token:\n', dpop);
        console.log('\n📦 Public JWK:\n', JSON.stringify(publicJwk, null, 2));

        expect(dpop).to.be.a('string');
    });
});
