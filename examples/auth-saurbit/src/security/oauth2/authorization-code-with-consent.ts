import { AuthorizationCodeReqData } from "@saurbit/oauth2";
import { REGISTERED_USERS, VALID_CLIENTS } from "../../data/users";
import { jwksAuthority } from "../jwks";
import Boom from "@hapi/boom";
import { KaapiAuthorizationCodeFlowBuilder } from "@kaapi/oauth2-auth-design";
import { ReqRefDefaults } from "@kaapi/kaapi";

declare module "@saurbit/oauth2" {
    interface AuthorizationCodeUser {
        id: string;
        email: string;
        username: string;
        consentStatus?: "allow" | "deny" | undefined;

        /**
         * A utility for setting a cookie to track the user's session and consent decision. 
         * This is used to persist the user's consent decision across multiple requests during the authorization code flow, 
         * allowing the user to be prompted for consent only once per session. 
         * In a real implementation, you would want to use a proper session management solution instead of this simple cookie setter.
         */
        sessionCookieSetter?: {
            set(value: string): void;
        };
    }
}

interface ParsedData extends AuthorizationCodeReqData {
    username?: string;
    password?: string;
    consent?: "allow" | "deny";
    sessionCookie?: string;

    /**
     * A utility for setting a cookie to track the user's session and consent decision. 
     * This is used to persist the user's consent decision across multiple requests during the authorization code flow, 
     * allowing the user to be prompted for consent only once per session. 
     * In a real implementation, you would want to use a proper session management solution instead of this simple cookie setter.
     */
    sessionCookieSetter?: {
        set(value: string): void;
    };
}

// Simple in-memory session storage for demonstration (not for production use)
const sessionStorage: Record<
    string,
    {
        userId: string;
        expiresAt: number;
    }
> = {};

const codeStorage: Record<
    string,
    {
        clientId: string;
        scope: string[];
        userId: string;
        expiresAt: number;
        codeChallenge?: string;
        nonce?: string;
    }
> = {};

// in-memory refresh token storage, mapping refresh tokens to client, user, scope, and expiration
const refreshTokenStorage: Record<
    string,
    {
        clientId: string;
        userId: string;
        scope: string[];
        expiresAt: number;
    }
> = {};

export const authorizationCodeWithConsentFlow = new KaapiAuthorizationCodeFlowBuilder<ReqRefDefaults, ParsedData>({
    securitySchemeName: "authorization_code_with_consent",
    parseAuthorizationEndpointData: async (req) => {
        const payload = req.payload as Record<string, unknown>;
        const username = typeof payload?.username === "string" ? payload.username : undefined;
        const password = typeof payload?.password === "string" ? payload.password : undefined;
        const consent = typeof payload?.consent === "string" && ["allow", "deny"].includes(payload.consent) ? (payload.consent as "allow" | "deny") : undefined;
        const sessionCookie = typeof req.state.session === "string" ? req.state.session : undefined;

        return {
            username,
            password,
            consent,
            sessionCookie,
            sessionCookieSetter: {
                set(value: string) {
                    req.raw.res.setHeader('Set-Cookie', `session=${value}; Path=/; HttpOnly; SameSite=Strict`);
                }
            },
        };
    }
})
    .setScopes({
        offline_access: "Request refresh token for offline access",
        profile: "Access to basic profile information such as name and picture.",
        email: "Access to the user's email address and its verification status.",
        "health:read": "Access to health check endpoint.",
    })
    .setDescription("Example OpenID Connect Authorization Code Flow")
    .setTokenEndpoint("/oauth2/v1.1/token")
    .setAuthorizationEndpoint("/oauth2/v1.1/authorize")
    .noneAuthenticationMethod()
    .setAccessTokenLifetime(3600)
    .getClientForAuthentication((data) => {
        const client = VALID_CLIENTS.find((c) => c.client_id === data.clientId && !c.internal);
        if (!client) return undefined;

        // filter client's allowed scoped
        const requestedScopes = data.scope ? data.scope : [];
        const grantedScopes = requestedScopes.length
            ? requestedScopes.filter((s) => client.allowed_scopes.includes(s))
            : client.allowed_scopes;
        if (grantedScopes.length === 0) return undefined;

        return {
            id: client.client_id,
            grants:
                client.meta && "grant_types" in client.meta ? (client.meta.grant_types as string[]) : ["authorization_code"],
            redirectUris: client.meta && "redirect_uris" in client.meta ? (client.meta.redirect_uris as string[]) : [],
            scopes: client.allowed_scopes,
        };
    })
    .getUserForAuthentication((_ctxt, parsedData) => {
        if (parsedData.sessionCookie) {
            const session = sessionStorage[parsedData.sessionCookie];
            if (session) {
                if (session.expiresAt <= Date.now()) {
                    // Session expired, clean up
                    delete sessionStorage[parsedData.sessionCookie];
                } else if (session.expiresAt > Date.now()) {
                    const user = REGISTERED_USERS.find((u) => u.id === session.userId);
                    if (user) {
                        return {
                            type: "authenticated",
                            user: {
                                id: user.id,
                                email: user.email,
                                username: user.username,
                                consentStatus: parsedData.consent, // carry the consent decision  forward
                                sessionCookieSetter: parsedData.sessionCookieSetter, // carry the sessionCookieSetter forward
                            },
                        };
                    }
                }
            }
        }

        const user = REGISTERED_USERS.find((u) => u.username === parsedData.username && u.password === parsedData.password);
        if (!user) return undefined;
        return {
            type: "authenticated",
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                sessionCookieSetter: parsedData.sessionCookieSetter, // carry the sessionCookieSetter forward
            },
        };
    })
    .generateAuthorizationCode((grantContext, user) => {
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
            const code = crypto.randomUUID();
            codeStorage[code] = {
                clientId: grantContext.client.id,
                scope: grantContext.scope,
                userId: `${user.id}`,
                expiresAt: Date.now() + 60000,
                codeChallenge: grantContext.codeChallenge,
                // nonce: grantContext.nonce,
            };
            return { type: "code", code };
        }

        if (user.sessionCookieSetter && !user.consentStatus) {
            // create a session and set a cookie to track it
            const sessionId = crypto.randomUUID();
            sessionStorage[sessionId] = {
                userId: user.id,
                expiresAt: Date.now() + 300000, // 5 minutes
            };
            user.sessionCookieSetter?.set(sessionId); // set cookie with same expiration as session
        }

        return { type: "continue" };
    })
    .getClient(async (tokenRequest) => {
        const client = VALID_CLIENTS.find((c) => c.client_id === tokenRequest.clientId && !c.internal);
        if (!client) return undefined;
        if (tokenRequest.grantType === "authorization_code" && tokenRequest.code) {
            const codeData = codeStorage[tokenRequest.code];
            if (!codeData) return undefined;
            if (codeData.clientId !== tokenRequest.clientId) return undefined;
            if (codeData.expiresAt < Date.now()) {
                delete codeStorage[tokenRequest.code];
                return undefined;
            }

            if (tokenRequest.codeVerifier && codeData.codeChallenge) {
                // Public client — verify PKCE code_verifier against the stored code_challenge
                const data = new TextEncoder().encode(tokenRequest.codeVerifier);
                const hashBuffer = await crypto.subtle.digest("SHA-256", data);
                const hashArray = new Uint8Array(hashBuffer);
                const base64url = btoa(String.fromCharCode(...hashArray))
                    .replace(/\+/g, "-")
                    .replace(/\//g, "_")
                    .replace(/=+$/, "");
                if (base64url !== codeData.codeChallenge) return undefined;
            } else {
                return undefined;
            }

            const user = REGISTERED_USERS.find((u) => u.id === codeData.userId);
            if (!user) return undefined;

            return {
                id: client.client_id,
                grants:
                    client.meta && "grant_types" in client.meta ? (client.meta.grant_types as string[]) : ["authorization_code"],
                redirectUris: client.meta && "redirect_uris" in client.meta ? (client.meta.redirect_uris as string[]) : [],
                scopes: client.allowed_scopes,
                metadata: {
                    accessScope: codeData.scope,
                    userId: codeData.userId,
                    username: user.username,
                    userEmail: user.email,
                    userFullName: user.fullName,
                    nonce: codeData.nonce,
                },
            };
        }

        // handle the refresh token grant type
        if (tokenRequest.grantType === "refresh_token" && tokenRequest.clientId === client.client_id) {
            const refreshTokenData = refreshTokenStorage[tokenRequest.refreshToken];

            const createBoomError = (errorCode: string, errorDescription: string) => {
                const errorResponse = Boom.badRequest(errorCode);
                errorResponse.output.payload.error = errorCode;
                errorResponse.output.payload.error_description = errorDescription;
                return errorResponse;
            };

            // validate the refresh token and its association with the client
            if (!refreshTokenData) throw createBoomError("invalid_grant", "Invalid refresh token");

            if (refreshTokenData.clientId !== tokenRequest.clientId)
                throw createBoomError("invalid_grant", "Invalid client for refresh token");

            // for security, remove the used refresh token to prevent reuse (rotate on each use)
            delete refreshTokenStorage[tokenRequest.refreshToken];

            // check if the refresh token has expired
            if (refreshTokenData.expiresAt < Date.now()) {
                throw createBoomError("invalid_grant", "Refresh token has expired");
            }

            const user = REGISTERED_USERS.find((u) => u.id === refreshTokenData.userId);
            if (!user) return undefined;

            // narrow the scope if the client requests a subset
            const requestedScope = Array.isArray(tokenRequest.scope) ? tokenRequest.scope : [];
            const accessScope = requestedScope.length
                ? refreshTokenData.scope.filter((s) => requestedScope.includes(s))
                : refreshTokenData.scope;

            return {
                id: client.client_id,
                grants:
                    client.meta && "grant_types" in client.meta ? (client.meta.grant_types as string[]) : ["authorization_code"],
                redirectUris: client.meta && "redirect_uris" in client.meta ? (client.meta.redirect_uris as string[]) : [],
                scopes: client.allowed_scopes,
                metadata: {
                    accessScope,
                    userId: refreshTokenData.userId,
                    username: user.username,
                    userEmail: user.email,
                    userFullName: user.fullName,
                },
            };
        }
        return undefined;
    })
    .generateAccessToken(async (grantContext) => {
        const accessScope = Array.isArray(grantContext.client.metadata?.accessScope)
            ? grantContext.client.metadata.accessScope
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
            ...registeredClaims,
        });

        const { token: idToken } = await jwksAuthority.sign({
            username: `${grantContext.client.metadata?.username}`,
            name: accessScope.includes("profile") ? `${grantContext.client.metadata?.userFullName}` : undefined,
            email: accessScope.includes("email") ? `${grantContext.client.metadata?.userEmail}` : undefined,
            nonce: grantContext.client.metadata?.nonce ? `${grantContext.client.metadata?.nonce}` : undefined,
            ...registeredClaims,
        });

        // generate the refresh token if the "offline_access" scope was requested,
        // and store it in the refresh token storage with an expiration time
        const refreshToken = (() => {
            if (accessScope.includes("offline_access")) {
                return crypto.randomUUID();
            }
            return undefined;
        })();

        if (refreshToken) {
            refreshTokenStorage[refreshToken] = {
                clientId: grantContext.client.id,
                userId: `${grantContext.client.metadata?.userId}`,
                scope: accessScope,
                expiresAt: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
            };
        }

        return {
            accessToken,
            scope: accessScope,
            idToken,
            refreshToken,
        };
    })
    .generateAccessTokenFromRefreshToken(async (grantContext) => {
        const accessScope = Array.isArray(grantContext.client.metadata?.accessScope)
            ? grantContext.client.metadata.accessScope
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
            ...registeredClaims,
        });

        const { token: idToken } = await jwksAuthority.sign({
            username: `${grantContext.client.metadata?.username}`,
            name: accessScope.includes("profile") ? `${grantContext.client.metadata?.userFullName}` : undefined,
            email: accessScope.includes("email") ? `${grantContext.client.metadata?.userEmail}` : undefined,
            ...registeredClaims,
        });

        // rotate: issue a new refresh token to replace the one consumed in getClient
        const refreshToken = (() => {
            if (accessScope.includes("offline_access")) {
                return crypto.randomUUID();
            }
            return undefined;
        })();

        if (refreshToken) {
            refreshTokenStorage[refreshToken] = {
                clientId: grantContext.client.id,
                userId: `${grantContext.client.metadata?.userId}`,
                scope: accessScope,
                expiresAt: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
            };
        }

        return {
            accessToken,
            scope: accessScope,
            idToken,
            refreshToken,
        };
    })
    .tokenVerifier(async (_req, { token }) => {
        try {
            const payload = await jwksAuthority.verify(token);
            if (payload && typeof payload.scope === "string") {
                const user = REGISTERED_USERS.find((u) => u.id === payload.sub);
                if (user) {
                    return {
                        isValid: true,
                        credentials: {
                            user: {
                                id: user.id,
                                email: user.email,
                                username: user.username,
                            },
                            scope: payload.scope.split(" "),
                        },
                    };
                }
            }
        } catch (error) {
            console.error(
                {
                    error: error instanceof Error ? { name: error.name, message: error.message } : error,
                },
                "Token verification error:"
            );
        }
        return { isValid: false };
    })
    .build();
