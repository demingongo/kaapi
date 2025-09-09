import { createHash } from 'crypto'

/**
 * Verifies the code_verifier against a previously saved code_challenge.
 */
export function verifyCodeVerifier(codeVerifier: string, codeChallenge: string) {
    const base64 = createHash('sha256')
        .update(codeVerifier)
        .digest('base64');

    const base64url = base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    return base64url === codeChallenge;
}