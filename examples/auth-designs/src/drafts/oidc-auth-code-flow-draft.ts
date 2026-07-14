import { ClientSecretBasic, ClientSecretPost, createInMemoryReplayStore, DPoPTokenType, JwtPayload, NoneAuthMethod } from '@saurbit/oauth2';
import db from './database';
import { decode, encode } from './encoder';
import renderHtml from './render-html';
import {
    KaapiOIDCAuthorizationCodeFlowBuilder,
    verifyCodeVerifier,
} from '@kaapi/oauth2-auth-design';
import { jwksAuthority } from '../plugins/jwks';
import Boom from '@hapi/boom';

interface RefreshPayload extends JwtPayload {
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
    securitySchemeName: 'oauth2_auth_code_flow',
    usernameField: 'email',
    passwordField: 'password',
    parseAuthorizationEndpointData: async (req) => {
        const payload = req.payload as Record<string, unknown>;
        const email = typeof payload?.email === "string" ? payload.email : undefined;
        const password = typeof payload?.password === "string" ? payload.password : undefined;
        const consent = payload?.step === 'consent' && typeof payload?.submit === "string" && ["allow", "deny"].includes(payload.submit) ? (payload.submit as "allow" | "deny") : undefined;
        const sessionCookie = req.state.kaapisession && typeof req.state.kaapisession === "object" ? req.state.kaapisession : undefined;

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
            // set a cookie to track session
            response.state('kaapisession', { user: user.id });
        }

        return response;
    })
    .getUserForAuthentication(async (_ctxt, parsedData) => {
        if (parsedData.sessionCookie) {
            const session = parsedData.sessionCookie;
            if (session && 'user' in session) {
                const user = await db.users.findById(`${session.user}`);
                if (user) {
                    return {
                        type: "authenticated",
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            given_name: user.given_name,
                            consentStatus: parsedData.consent, // carry the consent decision  forward
                        },
                    };
                }
            }
        }

        const user = await db.users.findByCredentials(`${parsedData.email}`, `${parsedData.password}`);
        if (!user) return undefined;
        return {
            type: "authenticated",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                given_name: user.given_name
            },
        };
    })
    .generateAuthorizationCode(({ client, codeChallenge, nonce, scope }, user) => {
        if (!user.id) {
            return undefined;
        }

        if (user.consentStatus === "deny") {
            return { type: "deny" };
        }

        if (user.consentStatus === "allow") {
            const code = encode({ clientId: client.id, codeChallenge, scope, nonce, user: user.id })
            return { type: "code", code };
        }

        return { type: "continue" };
    })
    .getClient(async (info) => {
        // db query
        const client = await db.clients.findById(info.clientId);
        if (!client) return undefined;
        if (info.grantType === 'authorization_code') {
            const { code, clientSecret, codeVerifier } = info
            const decodedCode = decode(code);
            const scope = decodedCode.scope;
            const codeChallenge = decodedCode.codeChallenge;
            const userId = decodedCode.user;
            const nonce = decodedCode.nonce;
            // db query
            const user = await db.users.findById(userId);
            // client or user not found
            if (!client || !user) {
                return;
            }
            // secret or code verifier validation
            if (clientSecret) {
                if (client.secret != clientSecret) {
                    return;
                }
            } else if (codeVerifier) {
                if (!verifyCodeVerifier(codeVerifier, codeChallenge)) {
                    return;
                }
            } else {
                return;
            }
            return {
                grants: ['authorization_code', 'refresh_token'],
                id: client.id,
                scopes: ['openid', 'profile', 'email', 'offline_access', 'read', 'write', 'admin', 'api.read'],
                redirectUris: [],
                metadata: {
                    accessScope: scope,
                    nonce,
                    userId,
                    name: user.name,
                    email: user.email,
                    given_name: user.given_name
                }
            }
        } else if (info.grantType === 'refresh_token') {
            // todo
            const refreshTokenData = await jwksAuthority.verify<RefreshPayload>(info.refreshToken);

            const createBoomError = (errorCode: string, errorDescription: string) => {
                const errorResponse = Boom.badRequest(errorCode);
                errorResponse.output.payload.error = errorCode;
                errorResponse.output.payload.error_description = errorDescription;
                return errorResponse;
            };

            // validate the refresh token and its association with the client
            if (!refreshTokenData) throw createBoomError("invalid_grant", "Invalid refresh token");

            if (refreshTokenData.client_id !== info.clientId)
                throw createBoomError("invalid_grant", "Invalid client for refresh token");


            const user = await db.users.findById(`${refreshTokenData.sub}`);
            if (!user) return undefined;

            const olderScope = refreshTokenData.scope ? refreshTokenData.scope.split(' ') : [];

            // narrow the scope if the client requests a subset
            const requestedScope = Array.isArray(info.scope) ? info.scope : [];
            const accessScope = requestedScope.length
                ? olderScope.filter((s) => requestedScope.includes(s))
                : olderScope;

            return {
                grants: ['authorization_code', 'refresh_token'],
                id: client.id,
                scopes: ['openid', 'profile', 'email', 'offline_access', 'read', 'write', 'admin', 'api.read'],
                redirectUris: [],
                metadata: {
                    accessScope: accessScope,
                    userId: refreshTokenData.sub,
                    name: user.name,
                    email: user.email,
                    given_name: user.given_name
                }
            };
        }
        return;
    })
    .generateAccessToken(async ({ client, accessTokenLifetime, origin }) => {

        // db query
        const user = await db.users.findById(`${client.metadata?.userId}`);
        if (!user) {
            return;
        }

        const accessScope = Array.isArray(client.metadata?.accessScope) ? client.metadata.accessScope : [];
        const registeredClaims = {
            exp: Math.floor(Date.now() / 1000) + accessTokenLifetime,
            iat: Math.floor(Date.now() / 1000),
            nbf: Math.floor(Date.now() / 1000),
            iss: origin,
            aud: client.id,
            jti: crypto.randomUUID(),
            sub: `${user.id}`,
        };

        const { token: accessToken } = await jwksAuthority.sign({
            scope: accessScope.join(" "),
            ...registeredClaims,
        });

        const { token: idToken } = await jwksAuthority.sign({
            name: accessScope.includes("profile") ? `${user.name}` : undefined,
            given_name: accessScope.includes("profile") ? `${user.given_name}` : undefined,
            email: accessScope.includes("email") ? `${user.email}` : undefined,
            ...registeredClaims,
        });

        // generate the refresh token if the "offline_access" scope was requested,
        // and store it in the refresh token storage with an expiration time
        const { token: refreshToken } = await (async () => {
            if (accessScope.includes("offline_access")) {
                return await jwksAuthority.sign({
                    scope: accessScope.join(" "),
                    ...registeredClaims,
                    client_id: registeredClaims.aud,
                    exp: Date.now() / 1000 + 604_800, // 7 days
                    type: 'refresh',
                })
            }
            return { token: undefined };
        })();

        return {
            accessToken,
            scope: accessScope,
            idToken,
            refreshToken,
        };
    })
    .generateAccessTokenFromRefreshToken(async ({ accessTokenLifetime, client, origin, scope }) => {
        // db query
        const user = await db.users.findById(`${client.metadata?.userId}`);
        if (!user) {
            return;
        }

        const accessScope = scope || (Array.isArray(client.metadata?.accessScope) ? client.metadata.accessScope : []);

        const registeredClaims = {
            exp: Math.floor(Date.now() / 1000) + accessTokenLifetime,
            iat: Math.floor(Date.now() / 1000),
            nbf: Math.floor(Date.now() / 1000),
            iss: origin,
            aud: client.id,
            jti: crypto.randomUUID(),
            sub: `${user.id}`,
        };

        const { token: accessToken } = await jwksAuthority.sign({
            scope: accessScope.join(" "),
            ...registeredClaims,
        });

        const { token: idToken } = await jwksAuthority.sign({
            name: accessScope.includes("profile") ? `${user.name}` : undefined,
            given_name: accessScope.includes("profile") ? `${user.given_name}` : undefined,
            email: accessScope.includes("email") ? `${user.email}` : undefined,
            ...registeredClaims,
        });

        // generate the refresh token if the "offline_access" scope was requested,
        // and store it in the refresh token storage with an expiration time
        const { token: newRefreshToken } = await (async () => {
            if (accessScope.includes("offline_access")) {
                return await jwksAuthority.sign({
                    scope: accessScope.join(" "),
                    ...registeredClaims,
                    client_id: registeredClaims.aud,
                    exp: Date.now() / 1000 + 604_800, // 7 days
                    type: 'refresh',
                })
            }
            return { token: undefined };
        })();

        return {
            accessToken,
            scope: accessScope,
            idToken,
            refreshToken: newRefreshToken,
        };
    })
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