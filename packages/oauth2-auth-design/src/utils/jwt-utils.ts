import { JWTPayload } from 'jose'
import { JwtAuthority } from './jwt-authority'

export interface OAuth2JwtPayload extends JWTPayload {
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

export async function createIdToken(
    authority: JwtAuthority,
    payload: OAuth2JwtPayload,
    ttl?: number
): Promise<{
    token: string;
    kid: string;
}> {
    const now = Math.floor(Date.now() / 1000)

    return await authority.sign({
        ...(payload),
        exp: typeof ttl === 'number' ? now + ttl : payload?.exp,
        iat: now
    })
}

export async function createJwtAccessToken(
    authority: JwtAuthority,
    payload: JWTPayload,
    ttl?: number
): Promise<{
    token: string;
    kid: string;
}> {
    const now = Math.floor(Date.now() / 1000)

    return await authority.sign({
        ...(payload),
        exp: payload?.exp || (typeof ttl === 'number' ? now + ttl : payload?.exp),
        iat: now
    })
}

export async function verifyJwt<P extends object = object>(
    authority: JwtAuthority,
    token: string
) {
    return await authority.verify<P & JWTPayload>(token)
}