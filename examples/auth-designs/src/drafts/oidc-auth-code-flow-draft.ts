import {
    ClientSecretBasic,
    ClientSecretPost,
    createInMemoryReplayStore,
    createMatchAuthCodeResult,
    DPoPToken,
    NoneAuthMethod,
    OAuth2ErrorCode,
    OAuth2TokenResponse,
    OIDCAuthorizationCodeBuilder
} from '@kaapi/oauth2-auth-design'

import logger from './logger'
import db from './database'
import renderHtml from './render-html'

function fakeEncode(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeDecode(str: string): any {
  return JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
}

interface RefreshPayload {
    client_id?: string
    scope?: string
    sub?: string
    type?: 'refresh'
}

const tokenType = new DPoPToken()                       // DPoP support
    .setTTL(300)                                        // default 300s
    .setReplayDetector(createInMemoryReplayStore())     // cache DPoP tokens
    .validateTokenRequest(() => ({ isValid: true }))    // for testing without validating dpop

export default OIDCAuthorizationCodeBuilder
    .create({ logger })
    .setTokenType(tokenType)                                        // optional, default BearerToken
    .setTokenTTL(3600)                                              // 1h
    .addClientAuthenticationMethod(new ClientSecretPost())          // client authentication methods
    .addClientAuthenticationMethod(new ClientSecretBasic())         // client authentication methods
    .addClientAuthenticationMethod(new NoneAuthMethod())            // client authentication methods
    .useAccessTokenJwks(true)                                       // activates JWT access token verification with JWKS
    .validate(async (_, { jwtAccessTokenPayload }) => {
        // db query
        const user = jwtAccessTokenPayload?.type === 'user' &&
            jwtAccessTokenPayload.sub
            ? await db.users.findById(`${jwtAccessTokenPayload.sub}`)
            : undefined;

        // not found
        if (!user) {
            return { isValid: false }
        }

        // authorized
        return {
            isValid: true,
            credentials: {
                user: {
                    sub: user.id,
                    name: user.name,
                    given_name: user.given_name,
                    email: user.email,
                    type: 'user'
                }
            }
        }
    })
    .authorizationRoute<object, { Payload: { email?: string, password?: string, step?: string, submit?: string } }>(route =>
        route
            .setPath('/oauth2/v2/authorize') // optional, default '/oauth2/authorize'
            .setEmailField('email')
            .setPasswordField('password')
            .setGETResponseRenderer(async (context, params, req) => {
                // db query
                const client = await db.clients.findById(params.clientId)

                // client not found
                if (!client) {
                    return await renderHtml('authorization-page', { context: { ...context, error: 'invalid_client' }, params, req })
                }

                const session = req.state['kaapisession']
                logger.debug('session', session)
                if (session?.user) {
                    const user = await db.users.findById(session.user)
                    if (user) {
                        return renderHtml('consent-page', { params })
                    }
                }

                return await renderHtml('authorization-page', { context, params, req })
            })
            .setPOSTResponseRenderer(async (context, params, req) => {
                return await renderHtml('authorization-page', { context, params, req })
            })
            .generateCode(async ({ clientId, codeChallenge, scope, nonce }, { payload: { email, password, step, submit }, state }, h) => {
                // db query
                const client = await db.clients.findById(clientId)

                // client not found
                if (!client) {
                    return null
                }

                if (step === 'consent') {
                    if (submit === 'allow') {
                        // code generation
                        const session = state.kaapisession
                        logger.debug('session', session)
                        if (session?.user) {
                            // Consider storing intermediate data instead of fully encoding it into the code string (unless encrypted).
                            return {
                                type: 'code',
                                value: fakeEncode({ clientId, codeChallenge, scope, nonce, user: session.user })
                            }
                        }
                    }
                    return { type: 'deny' }
                }

                // invalid payload
                if (!email || !password) return null

                // db query + password validation + code generation
                const user = await db.users.findByCredentials(email, password)
                if (user) {
                    h.state('kaapisession', { user: user.id })
                    return { type: 'continue' }
                }

                return null
            })
            .finalizeAuthorization(async (ctx, params, _req, h) => {
                const matcher = createMatchAuthCodeResult({
                    code: async () => h.redirect(`${ctx.fullRedirectUri}`),
                    continue: async () => renderHtml('consent-page', { params }),
                    deny: async () => h.redirect(`${ctx.fullRedirectUri}`), // use the prepared uri by the framwork
                })

                return matcher(ctx.authorizationResult)
            }))
    .tokenRoute(route =>
        route
            .setPath('/oauth2/v2/token') // optional, default '/oauth2/token'
            .generateToken(async ({
                clientId,
                clientSecret,
                ttl,
                tokenType,
                createJwtAccessToken,
                createIdToken,
                code,
                codeVerifier,
                verifyCodeVerifier
            }, _req) => {

                const decodedCode = fakeDecode(code);
                const scope = decodedCode.scope;
                const codeChallenge = decodedCode.codeChallenge;
                const userId = decodedCode.user;
                const nonce = decodedCode.nonce;

                // db query
                const client = await db.clients.findById(clientId)
                const user = await db.users.findById(userId)

                // client or user not found
                if (!client || !user) {
                    return null
                }

                // secret or code verifier validation
                if (clientSecret) {
                    if (client.secret != clientSecret) {
                        return { error: 'invalid_client' }
                    }
                } else if (codeVerifier) {
                    if (!verifyCodeVerifier(codeVerifier, codeChallenge)) {
                        return { error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Invalid code exchange' }
                    }
                } else {
                    return { error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Token Request was missing the \'client_secret\' parameter.' }
                }

                // no token ttl
                if (!ttl) {
                    return { error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Missing ttl' }
                }

                try {
                    if (createJwtAccessToken) {
                        const { token: accessToken } = await createJwtAccessToken({
                            sub: user.id,
                            type: 'user'
                        })
                        const refreshToken = (scope?.split(' ').includes('offline_access') || undefined) && await createJwtAccessToken({
                            sub: user.id,
                            client_id: clientId,
                            scope,
                            exp: Date.now() / 1000 + 604_800, // 7 days

                            type: 'refresh'
                        })
                        return new OAuth2TokenResponse({ access_token: accessToken })
                            .setExpiresIn(ttl)
                            .setRefreshToken(refreshToken?.token)
                            .setScope(scope?.split(' '))
                            .setTokenType(tokenType)
                            .setIdToken(
                                (scope?.split(' ').includes('openid') || undefined) && (await createIdToken?.({
                                    sub: user.id,
                                    name: (scope?.split(' ').includes('profile') || undefined) && user.name,
                                    given_name: (scope?.split(' ').includes('profile') || undefined) && user.given_name,
                                    email: (scope?.split(' ').includes('email') || undefined) && user.email,
                                    nonce
                                }))?.token
                            ) // add id_token if scope has 'openid'
                    }
                } catch (err) {
                    logger.error(err)
                }

                return null
            }))
    .refreshTokenRoute(route =>
        route
            .setPath('/oauth2/v2/token') // optional, default '/oauth2/token'
            .generateToken(async ({ clientId, refreshToken, scope, ttl, tokenType, createJwtAccessToken, createIdToken, verifyJwt }, _req) => {

                try {
                    // verify refresh token
                    const payload = await verifyJwt?.<RefreshPayload>(refreshToken)
                    if (!payload || !(payload.client_id && payload.client_id === clientId && payload.sub && payload.type === 'refresh')) {
                        return { error:  OAuth2ErrorCode.INVALID_REQUEST }
                    }

                    // db query
                    const client = await db.clients.findById(clientId)
                    const user = await db.users.findById(payload.sub)

                    // client or user not found
                    if (!client || !user) {
                        return { error:  OAuth2ErrorCode.INVALID_REQUEST }
                    }

                    if (!ttl) {
                        return { error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Missing ttl' }
                    }

                    const newScope = scope || payload.scope

                    if (createJwtAccessToken) {
                        const { token: accessToken } = await createJwtAccessToken({
                            sub: user.id,
                            type: 'user'
                        })
                        const newRefreshToken = (!newScope || (newScope && newScope?.split(' ').includes('offline_access')) || undefined) &&
                            await createJwtAccessToken({
                                sub: user.id,
                                client_id: clientId,
                                scope: newScope,
                                exp: Date.now() / 1000 + 604_800, // 7 days

                                type: 'refresh'
                            } as Required<RefreshPayload>)
                        return new OAuth2TokenResponse({ access_token: accessToken })
                            .setExpiresIn(ttl)
                            .setRefreshToken(newRefreshToken?.token)
                            .setScope(newScope?.split(' '))
                            .setTokenType(tokenType)
                            .setIdToken(
                                (scope?.split(' ').includes('openid') || undefined) && (await createIdToken?.({
                                    sub: user.id,
                                    name: (scope?.split(' ').includes('profile') || undefined) && user.name,
                                    given_name: (scope?.split(' ').includes('profile') || undefined) && user.given_name,
                                    email: (scope?.split(' ').includes('email') || undefined) && user.email,
                                }))?.token
                            ) // add id_token if the new scope has 'openid'
                    }
                } catch (err) {
                    logger.error(err)
                }

                return null
            }))
    .setDescription('This API uses OAuth 2 with the authorization code grant flow. [More info](https://oauth.net/2/grant-types/authorization-code/)')
    .setScopes({
        openid: 'Required for OpenID Connect; enables ID token issuance.',
        profile: 'Access to basic profile information such as name and picture.',
        email: 'Access to the user\'s email address and its verification status.',
        offline_access: 'Request a refresh token to access resources when the user is offline.',
        read: 'Read access to protected resources.',
        write: 'Write access to protected resources.',
        admin: 'Grants administrative or elevated privileges.',
        'api:read': 'Read access to a specific API or resource group.'
    })