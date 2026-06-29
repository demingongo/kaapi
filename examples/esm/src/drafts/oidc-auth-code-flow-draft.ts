import { ReqRefDefaults } from '@kaapi/kaapi';
import db from './database';
import { encode } from './encoder';
import { jwksAuthority } from './jwks';
import {
    KaapiOIDCAuthorizationCodeFlow,
    KaapiOIDCAuthorizationCodeFlowBuilder,
    verifyCodeVerifier,
} from '@kaapi/oauth2-auth-design';
import {
    BearerTokenType,
    ClientSecretBasic,
    ClientSecretPost,
    JwtPayload,
    NoneAuthMethod
} from "@saurbit/oauth2"

interface RefreshPayload extends JwtPayload {
    aud?: string;
    scope?: string;
    sub?: string;
    type?: 'refresh';
}

const ALLOWED_SCOPES = {
    openid: 'Required for OpenID Connect; enables ID token issuance.',
    profile: 'Access to basic profile information such as name and picture.',
    email: "Access to the user's email address and its verification status.",
    offline_access: 'Request a refresh token to access resources when the user is offline.',
    read: 'Read access to protected resources.',
    write: 'Write access to protected resources.',
    admin: 'Grants administrative or elevated privileges.',
    'api.read': 'Read access to a specific API or resource group.',
}

const tokenType = new BearerTokenType();

const flow: KaapiOIDCAuthorizationCodeFlow<ReqRefDefaults, {
    email: string | undefined;
    password: string | undefined;
    consent: "allow" | "deny" | undefined;
    sessionCookie: string | undefined;
}, ReqRefDefaults> = KaapiOIDCAuthorizationCodeFlowBuilder.create({
    parseAuthorizationEndpointData: async (req) => {
        const payload = req.payload as Record<string, unknown>;
        const email = typeof payload?.email === "string" ? payload.email : undefined;
        const password = typeof payload?.password === "string" ? payload.password : undefined;
        const consent = payload.step === 'consent' && typeof payload?.submit === "string" && ["allow", "deny"].includes(payload.submit) ? (payload.submit as "allow" | "deny") : undefined;
        const sessionCookie = typeof req.state.kaapisession === "string" ? req.state.kaapisession : undefined;

        return {
            email,
            password,
            consent,
            sessionCookie,
        };
    }
})
    .setAuthorizationEndpoint('/oauth2/v2/authorize')
    .setTokenEndpoint('/oauth2/v2/token')
    .setUsernameField('email')
    .setPasswordField('password')
    .setTokenType(tokenType) // optional, default BearerToken
    .setAccessTokenLifetime(3600) // 1h
    .addClientAuthenticationMethod(new ClientSecretBasic()) // client authentication methods
    .addClientAuthenticationMethod(new ClientSecretPost()) // client authentication methods
    .addClientAuthenticationMethod(new NoneAuthMethod()) // client authentication methods
    .getClient(async (requestInfo) => {
        if (requestInfo.grantType === 'authorization_code') {
            const decodedCode = await db.authCodes.findById(requestInfo.code);
            if (!decodedCode || requestInfo.clientId != decodedCode.clientId) {
                return;
            }

            // remove code from db
            await db.authCodes.deleteOneWithId(requestInfo.code);

            if (decodedCode.expiresAt <= Date.now()) {
                return;
            }

            const scope = decodedCode.scope;
            const codeChallenge = decodedCode.codeChallenge;
            const userId = decodedCode.user;
            const nonce = decodedCode.nonce;

            // db query
            const client = await db.clients.findById(requestInfo.clientId);
            const user = await db.users.findById(userId);

            // client or user not found
            if (!client || !user) {
                return;
            }

            // secret or code verifier validation
            if (requestInfo.clientSecret) {
                if (client.secret != requestInfo.clientSecret) {
                    return;
                }
            } else if (requestInfo.codeVerifier) {
                if (!codeChallenge || !verifyCodeVerifier(requestInfo.codeVerifier, codeChallenge)) {
                    return;
                }
            } else {
                return;
            }

            return {
                id: client.id,
                grants: ['authorization_code'],
                redirectUris: [],
                scopes: Object.keys(ALLOWED_SCOPES),
                metadata: {
                    name: client.name,
                    details: client.details,
                    userId: user.id,
                    userName: user.name,
                    userGivenName: user.given_name,
                    userEmail: user.email,
                    scope: scope,
                    nonce: nonce
                },
            };
        }

        if (requestInfo.grantType === 'refresh_token') {
            const payload = await jwksAuthority.verify<RefreshPayload>(requestInfo.refreshToken);
            if (!payload || payload.type !== 'refresh' || payload.aud !== requestInfo.clientId || !payload.sub) {
                return;
            }
            // db query
            const client = await db.clients.findById(requestInfo.clientId);
            const user = await db.users.findById(payload.sub);

            // client or user not found
            if (!client || !user) {
                return;
            }

            return {
                id: client.id,
                grants: ['authorization_code'],
                redirectUris: [],
                scopes: Object.keys(ALLOWED_SCOPES),
                metadata: {
                    name: client.name,
                    details: client.details,
                    userId: user.id,
                    userName: user.name,
                    userGivenName: user.given_name,
                    userEmail: user.email,
                    scope: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
                },
            };
        }

        return undefined;
    })
    .generateAccessToken(async (grantContext) => {
        const accessScope = Array.isArray(grantContext.client.metadata?.scope)
            ? grantContext.client.metadata.scope
            : [];

        const registeredClaims = {
            exp: Math.floor(Date.now() / 1000) + grantContext.accessTokenLifetime,
            iat: Math.floor(Date.now() / 1000),
            nbf: Math.floor(Date.now() / 1000),
            iss: grantContext.origin,
            aud: grantContext.client.id,
            jti: crypto.randomUUID(),
            sub: `${grantContext.client.metadata?.userId}`,
        };

        const { token: accessToken } = await jwksAuthority.sign({
            scope: accessScope.join(" "),
            type: 'user',
            ...registeredClaims,
        });

        const { token: idToken } = await jwksAuthority.sign({
            name: accessScope.includes("profile") ? `${grantContext.client.metadata?.userName}` : undefined,
            given_name: accessScope.includes("profile") ? `${grantContext.client.metadata?.userGivenName}` : undefined,
            email: accessScope.includes("email") ? `${grantContext.client.metadata?.userEmail}` : undefined,
            nonce: grantContext.client.metadata?.nonce,
            ...registeredClaims,
        });

        const refreshToken = await (async () => {
            if (accessScope.includes("offline_access")) {
                return (await jwksAuthority.sign({
                    scope: accessScope.join(" "),
                    type: 'refresh',
                    ...registeredClaims,
                    exp: Date.now() / 1000 + 604_800, // 7 days
                })).token;
            }
            return undefined;
        })();

        return {
            accessToken,
            idToken,
            refreshToken,
            scope: accessScope
        };
    })
    .generateAccessTokenFromRefreshToken(async (grantContext) => {
        const accessScope = Array.isArray(grantContext.client.metadata?.scope)
            ? grantContext.client.metadata.scope
            : [];

        const registeredClaims = {
            exp: Math.floor(Date.now() / 1000) + grantContext.accessTokenLifetime,
            iat: Math.floor(Date.now() / 1000),
            nbf: Math.floor(Date.now() / 1000),
            iss: grantContext.origin,
            aud: grantContext.client.id,
            jti: crypto.randomUUID(),
            sub: `${grantContext.client.metadata?.userId}`,
        };

        const { token: accessToken } = await jwksAuthority.sign({
            scope: accessScope.join(" "),
            type: 'user',
            ...registeredClaims,
        });

        const { token: idToken } = await jwksAuthority.sign({
            name: accessScope.includes("profile") ? `${grantContext.client.metadata?.userName}` : undefined,
            given_name: accessScope.includes("profile") ? `${grantContext.client.metadata?.userGivenName}` : undefined,
            email: accessScope.includes("email") ? `${grantContext.client.metadata?.userEmail}` : undefined,
            ...registeredClaims,
        });

        const refreshToken = await (async () => {
            if (accessScope.includes("offline_access")) {
                return (await jwksAuthority.sign({
                    scope: accessScope.join(" "),
                    type: 'refresh',
                    ...registeredClaims,
                    exp: Date.now() / 1000 + 604_800, // 7 days
                })).token;
            }
            return undefined;
        })();

        return {
            accessToken,
            idToken,
            refreshToken,
            scope: accessScope
        };
    })
    .tokenVerifier(async (_, { token }) => {
        const jwtAccessTokenPayload = await jwksAuthority.verify(token);

        // db query
        const user =
            jwtAccessTokenPayload?.type === 'user' && jwtAccessTokenPayload?.sub
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
                scope: typeof jwtAccessTokenPayload?.scope === 'string' ? jwtAccessTokenPayload.scope.split(' ') : [],
            },
        };
    })
    .getClientForAuthentication(async (data) => {
        // db query
        const client = await db.clients.findById(data.clientId);
        if (!client) return;

        // filter client's allowed scoped
        const requestedScopes = data.scope ? data.scope : [];
        const grantedScopes = requestedScopes.length
            ? requestedScopes.filter((s) => Object.keys(ALLOWED_SCOPES).includes(s))
            : Object.keys(ALLOWED_SCOPES);
        if (grantedScopes.length === 0) return undefined;

        return {
            id: client.id,
            grants: ["authorization_code"],
            redirectUris: [],
            scopes: Object.keys(ALLOWED_SCOPES),
            metadata: {
                name: client.name,
                details: client.details,
            }
        };
    })
    .getUserForAuthentication(async (_ctxt, parsedData) => {
        if (parsedData.sessionCookie) {
            const session = parsedData.sessionCookie as { user?: string } | undefined;
            if (session?.user) {
                const user = await db.users.findById(session.user);
                if (user) {
                    return {
                        type: "authenticated",
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            given_name: user.given_name,
                            consentStatus: parsedData.consent,
                        },
                    };
                }
            }
        }

        if (!parsedData.email || !parsedData.password) {
            return;
        }

        const user = await db.users.findByCredentials(parsedData.email, parsedData.password);
        if (!user) return undefined;
        return {
            type: "authenticated",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                given_name: user.given_name,
            },
        };
    })
    .generateAuthorizationCode(async (grantContext, user) => {
        if (!user.id) {
            return undefined;
        }

        if (user.consentStatus === "deny") {
            return {
                type: "deny",
                message: "The user has denied consent for this application.",
            };
        }

        if (user.consentStatus === "allow") {
            const code = encode({
                clientId: grantContext.client.id,
                scope: grantContext.scope.join(" "),
                nonce: grantContext.nonce,
                user: user.id,
                expiresAt: Date.now() + 10_000,
                createdAt: Date.now(),
            });
            // store code and intermediate data
            await db.authCodes.insertOne({
                id: code,
                clientId: grantContext.client.id,
                codeChallenge: grantContext.codeChallenge,
                scope: grantContext.scope.join(" "),
                nonce: grantContext.nonce,
                user: user.id as string,
                expiresAt: Date.now() + 10_000,
            });
            return { type: "code", code };
        }

        return { type: "continue" };
    })
    .setLoginFormRenderer(async (_request, h, _result, { passwordField, usernameField, statusCode, errorMessage }) => {
        return h.view('authorization-page', {
            usernameField,
            passwordField,
            error: _result && 'type' in _result && _result.type === 'error' ? _result.error : undefined,
            errorMessage
        })
            .code(statusCode)
            .unstate('kaapisession');
    })
    .setConsentFormRenderer(async (request, h, { continueResponse: { scope: _scope, context: { client }, user } }, { statusCode }) => {
        const response = h.view('consent-page', { clientName: client.metadata?.name }).code(statusCode);

        if (!request.state.kaapisession) {
            response.state('kaapisession', { user: user.id });
        }

        return response;
    })
    .onPreHandler({
        method: async (request, h) => {
            if (request.method != "get") {
                return h.continue;
            }

            const session = request.state.kaapisession && typeof request.state.kaapisession === "object" ? request.state.kaapisession as { user: string } : undefined;
            if (session) {
                try {
                    const user = await db.users.findById(session.user);

                    if (user) {
                        const processedAuthorization = await flow.kaapi().processAuthorization(request);
                        // Render consent page if we have a valid session
                        if (processedAuthorization.type === "continue") {
                            return h.view('consent-page', { clientName: processedAuthorization.continueResponse.context.client.metadata?.name }).code(200).takeover();
                        }

                        // If the session is invalid, clear the session cookie and show the login form
                        if (processedAuthorization.type === "unauthenticated") {
                            return h.view('authorization-page', {
                                usernameField: flow.getUsernameField(),
                                passwordField: flow.getPasswordField(),
                            })
                                .code(200)
                                .unstate('kaapisession')
                                .takeover();
                        }

                        // For any other errors, show the error message
                        if (processedAuthorization.type === "error") {
                            return h.response({ error: "invalid_request" }).code(400).takeover();
                        }
                    }
                } catch (error) {
                    console.error(error);
                }
            }
            return h.continue;
        },
    })
    .setDescription(
        'This API uses OAuth 2 with the authorization code grant flow. [More info](https://oauth.net/2/grant-types/authorization-code/)'
    )
    .setScopes(ALLOWED_SCOPES)
    .onDiscoveryRequest(async (request) => {
        return flow.kaapi().getDiscoveryConfiguration(request, {});
    })
    .onJwksRequest(async () => {
        return await jwksAuthority.getJwksEndpointResponse();
    })
    .build();


export default flow;