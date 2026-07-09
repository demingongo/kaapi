import { ClientSecretBasic, ClientSecretPost, createInMemoryReplayStore, DPoPTokenType, NoneAuthMethod } from '@saurbit/oauth2';
import db from './database';
import { decode, encode } from './encoder';
import logger from './logger';
import renderHtml from './render-html';
import {
    KaapiOIDCAuthorizationCodeFlowBuilder,
} from '@kaapi/oauth2-auth-design';
import { jwksAuthority } from '../plugins/jwks';

interface RefreshPayload {
    client_id?: string;
    scope?: string;
    sub?: string;
    type?: 'refresh';
}

const tokenType = new DPoPTokenType(jwksAuthority.verify.bind(jwksAuthority)) // DPoP support
    .setTokenLifetime(300) // default 300s
    .setReplayDetector(createInMemoryReplayStore()) // cache DPoP tokens
    .validateTokenRequest(() => ({ isValid: true })); // for testing without validating dpop

export default KaapiOIDCAuthorizationCodeFlowBuilder.create({
    usernameField: 'email',
    passwordField: 'password',
    parseAuthorizationEndpointData: async (req) => {
        const payload = req.payload as Record<string, unknown>;
        const email = typeof payload?.email === "string" ? payload.email : undefined;
        const password = typeof payload?.password === "string" ? payload.password : undefined;
        const consent = typeof payload?.consent === "string" && ["allow", "deny"].includes(payload.consent) ? (payload.consent as "allow" | "deny") : undefined;
        const sessionCookie = typeof req.state.session === "string" ? req.state.session : undefined;

        return {
            email,
            password,
            consent,
            sessionCookie,
        };
    },
    authorizationEndpoint: '/oauth2/v2/authorize',
    tokenEndpoint: '/oauth2/v2/token',
    onJwksRequest: async () => {
        return await jwksAuthority.getJwksEndpointResponse();
    },
})
    .setTokenType(tokenType) // optional, default BearerToken
    .setAccessTokenLifetime(3600) // 1h
    .addClientAuthenticationMethod(new ClientSecretBasic()) // client authentication methods
    .addClientAuthenticationMethod(new ClientSecretPost()) // client authentication methods
    .addClientAuthenticationMethod(new NoneAuthMethod()) // client authentication methods
    .tokenVerifier(async (_, { token }) => {
        const jwtAccessTokenPayload = await jwksAuthority.verify(token);
        // db query
        const user =
            jwtAccessTokenPayload?.type === 'user' && jwtAccessTokenPayload.sub
                ? await db.users.findById(`${jwtAccessTokenPayload.sub}`)
                : undefined;

        // not found
        if (!user) {
            return { isValid: false };
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
                    type: 'user',
                },
                scope: typeof jwtAccessTokenPayload.scope === 'string' ? jwtAccessTokenPayload.scope.split(' ') : [],
            },
        };
    })
    .getClientForAuthentication(async ({ clientId }) => {
        // db query
        const client = await db.clients.findById(clientId);

        // not found
        if (!client) {
            return undefined;
        }
        return {
            id: client.id,
            grants: ['authorization_code', 'refresh_token'],
            scopes: ['openid', 'profile', 'email', 'offline_access', 'read', 'write', 'admin', 'api.read'],
            redirectUris: [],
            metadata: client.details,
        };
    })
    .setLoginFormRenderer(async (_req, _h, result) => {
        if (result && 'success' in result) {
            !result.success && result.error.message
        }
        return await renderHtml('authorization-page', {
            context: {
                error: result && 'error' in result ? result.error.errorCode : undefined,
                errorMessage: result && 'error' in result ? result.error.message : undefined,
                usernameField: 'email',
                passwordField: 'password'
            }
        });
    })
    .setConsentFormRenderer(async (request, h, { continueResponse: { scope, context: { client }, user } }, { statusCode }) => {
        const html = await renderHtml('consent-page', { params: { userEmail: user.email, clientId: client.id, scope } });

        const response = h.response(html).code(statusCode).type("text/html");

        if (!request.state.session) {
            // create a session and set a cookie to track it
            const sessionId = crypto.randomUUID();
            sessionStorage[sessionId] = {
                userId: user.id,
                expiresAt: Date.now() + 300000, // 5 minutes
            };
            response.state('kaapisession', sessionId);
        }

        return response;
    })
    .authorizationRoute<object, { Payload: { email?: string; password?: string; step?: string; submit?: string } }>(
        (route) =>
            route
                .setPath('/oauth2/v2/authorize') // optional, default '/oauth2/authorize'
                .setUsernameField('email')
                .setPasswordField('password')
                .setGETResponseRenderer(async (context, params, req) => {
                    // db query
                    const client = await db.clients.findById(params.clientId);

                    // client not found
                    if (!client) {
                        return await renderHtml('authorization-page', {
                            context: { ...context, error: 'invalid_client' },
                            params,
                            req,
                        });
                    }

                    const session = req.state['kaapisession'] as { user?: string } | undefined;
                    logger.debug('session', session);
                    if (session?.user) {
                        const user = await db.users.findById(session.user);
                        if (user) {
                            return renderHtml('consent-page', { params });
                        }
                    }

                    return await renderHtml('authorization-page', { context, params, req });
                })
                .setPOSTErrorRenderer(async (context, params, req) => {
                    return await renderHtml('authorization-page', { context, params, req });
                })
                .generateCode(
                    async (
                        { clientId, codeChallenge, scope, nonce },
                        { payload: { email, password, step, submit }, state },
                        h
                    ) => {
                        // db query
                        const client = await db.clients.findById(clientId);

                        // client not found
                        if (!client) {
                            return null;
                        }

                        if (step === 'consent') {
                            if (submit === 'allow') {
                                // code generation
                                const session = state.kaapisession as { user?: string } | undefined;
                                logger.debug('session', session);
                                if (session?.user) {
                                    // Consider storing intermediate data instead of fully encoding it into the code string (unless encrypted).
                                    return {
                                        type: 'code',
                                        value: encode({ clientId, codeChallenge, scope, nonce, user: session.user }),
                                    };
                                }
                            }
                            return { type: 'deny' };
                        }

                        // invalid payload
                        if (!email || !password) return null;

                        // db query + password validation + code generation
                        const user = await db.users.findByCredentials(email, password);
                        if (user) {
                            h.state('kaapisession', { user: user.id });
                            return { type: 'continue' };
                        }

                        return null;
                    }
                )
                .finalizeAuthorization(async (ctx, params, _req, h) => {
                    const matcher = createMatchAuthCodeResult({
                        code: async () => h.redirect(`${ctx.fullRedirectUri}`),
                        continue: async () => renderHtml('consent-page', { params }),
                        deny: async () => h.redirect(`${ctx.fullRedirectUri}`), // use the prepared uri by the framwork
                    });

                    return matcher(ctx.authorizationResult);
                })
    )
    .tokenRoute((route) =>
        route
            .setPath('/oauth2/v2/token') // optional, default '/oauth2/token'
            .generateToken(
                async (
                    {
                        clientId,
                        clientSecret,
                        ttl,
                        tokenType,
                        createJwtAccessToken,
                        createIdToken,
                        code,
                        codeVerifier,
                        verifyCodeVerifier,
                    },
                    _req
                ) => {
                    const decodedCode = decode(code);
                    const scope = decodedCode.scope;
                    const codeChallenge = decodedCode.codeChallenge;
                    const userId = decodedCode.user;
                    const nonce = decodedCode.nonce;

                    // db query
                    const client = await db.clients.findById(clientId);
                    const user = await db.users.findById(userId);

                    // client or user not found
                    if (!client || !user) {
                        return null;
                    }

                    // secret or code verifier validation
                    if (clientSecret) {
                        if (client.secret != clientSecret) {
                            return { error: 'invalid_client' };
                        }
                    } else if (codeVerifier) {
                        if (!verifyCodeVerifier(codeVerifier, codeChallenge)) {
                            return {
                                error: OAuth2ErrorCode.INVALID_REQUEST,
                                error_description: 'Invalid code exchange',
                            };
                        }
                    } else {
                        return {
                            error: OAuth2ErrorCode.INVALID_REQUEST,
                            error_description: "Token Request was missing the 'client_secret' parameter.",
                        };
                    }

                    // no token ttl
                    if (!ttl) {
                        return { error: OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Missing ttl' };
                    }

                    try {
                        if (createJwtAccessToken) {
                            const { token: accessToken } = await createJwtAccessToken({
                                sub: user.id,
                                type: 'user',
                            });
                            const refreshToken =
                                (scope?.split(' ').includes('offline_access') || undefined) &&
                                (await createJwtAccessToken({
                                    sub: user.id,
                                    client_id: clientId,
                                    scope,
                                    exp: Date.now() / 1000 + 604_800, // 7 days

                                    type: 'refresh',
                                }));
                            return new OAuth2TokenResponse({ access_token: accessToken })
                                .setExpiresIn(ttl)
                                .setRefreshToken(refreshToken?.token)
                                .setScope(scope?.split(' '))
                                .setTokenType(tokenType)
                                .setIdToken(
                                    (scope?.split(' ').includes('openid') || undefined) &&
                                    (
                                        await createIdToken?.({
                                            sub: user.id,
                                            name: (scope?.split(' ').includes('profile') || undefined) && user.name,
                                            given_name:
                                                (scope?.split(' ').includes('profile') || undefined) &&
                                                user.given_name,
                                            email: (scope?.split(' ').includes('email') || undefined) && user.email,
                                            nonce,
                                        })
                                    )?.token
                                ); // add id_token if scope has 'openid'
                        }
                    } catch (err) {
                        logger.error(err);
                    }

                    return null;
                }
            )
    )
    .refreshTokenRoute((route) =>
        route
            .setPath('/oauth2/v2/token') // optional, default '/oauth2/token'
            .generateToken(
                async (
                    { clientId, refreshToken, scope, ttl, tokenType, createJwtAccessToken, createIdToken, verifyJwt },
                    _req
                ) => {
                    try {
                        // verify refresh token
                        const payload = await verifyJwt?.<RefreshPayload>(refreshToken);
                        if (
                            !payload ||
                            !(
                                payload.client_id &&
                                payload.client_id === clientId &&
                                payload.sub &&
                                payload.type === 'refresh'
                            )
                        ) {
                            return { error: OAuth2ErrorCode.INVALID_REQUEST };
                        }

                        // db query
                        const client = await db.clients.findById(clientId);
                        const user = await db.users.findById(payload.sub);

                        // client or user not found
                        if (!client || !user) {
                            return { error: OAuth2ErrorCode.INVALID_REQUEST };
                        }

                        if (!ttl) {
                            return { error: OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Missing ttl' };
                        }

                        const newScope = scope || payload.scope;

                        if (createJwtAccessToken) {
                            const { token: accessToken } = await createJwtAccessToken({
                                sub: user.id,
                                type: 'user',
                            });
                            const newRefreshToken =
                                (!newScope ||
                                    (newScope && newScope?.split(' ').includes('offline_access')) ||
                                    undefined) &&
                                (await createJwtAccessToken({
                                    sub: user.id,
                                    client_id: clientId,
                                    scope: newScope,
                                    exp: Date.now() / 1000 + 604_800, // 7 days

                                    type: 'refresh',
                                } as Required<RefreshPayload>));
                            return new OAuth2TokenResponse({ access_token: accessToken })
                                .setExpiresIn(ttl)
                                .setRefreshToken(newRefreshToken?.token)
                                .setScope(newScope?.split(' '))
                                .setTokenType(tokenType)
                                .setIdToken(
                                    (scope?.split(' ').includes('openid') || undefined) &&
                                    (
                                        await createIdToken?.({
                                            sub: user.id,
                                            name: (scope?.split(' ').includes('profile') || undefined) && user.name,
                                            given_name:
                                                (scope?.split(' ').includes('profile') || undefined) &&
                                                user.given_name,
                                            email: (scope?.split(' ').includes('email') || undefined) && user.email,
                                        })
                                    )?.token
                                ); // add id_token if the new scope has 'openid'
                        }
                    } catch (err) {
                        logger.error(err);
                    }

                    return null;
                }
            )
    )
    .setDescription(
        'This API uses OAuth 2 with the authorization code grant flow. [More info](https://oauth.net/2/grant-types/authorization-code/)'
    )
    .setScopes({
        openid: 'Required for OpenID Connect; enables ID token issuance.',
        profile: 'Access to basic profile information such as name and picture.',
        email: "Access to the user's email address and its verification status.",
        offline_access: 'Request a refresh token to access resources when the user is offline.',
        read: 'Read access to protected resources.',
        write: 'Write access to protected resources.',
        admin: 'Grants administrative or elevated privileges.',
        'api.read': 'Read access to a specific API or resource group.',
    })
    .build();