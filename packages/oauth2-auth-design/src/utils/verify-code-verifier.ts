import { createHash } from 'crypto';

/**
 * Verifies the code_verifier against a previously saved code_challenge.
 *
 * Implements the PKCE (RFC 7636) S256 verification: hashes `codeVerifier` with
 * SHA-256, encodes the result as Base64url, and compares it to `codeChallenge`.
 *
 * @param codeVerifier - The plain-text code verifier sent by the client at the token endpoint.
 * @param codeChallenge - The Base64url-encoded SHA-256 hash of the code verifier, previously
 *   stored during the authorization request.
 * @returns `true` if the verifier matches the challenge; `false` otherwise.
 */
export function verifyCodeVerifier(codeVerifier: string, codeChallenge: string) {
    const base64 = createHash('sha256').update(codeVerifier).digest('base64');

    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return base64url === codeChallenge;
}
