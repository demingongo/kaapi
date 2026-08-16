/*import { BearerTokenType, JwtPayload, NoneAuthMethod } from '@saurbit/oauth2';
import db from './database';
import { decode, encode } from './encoder';
import { generateCode, VERIFICATION_URI } from './utils';
import {
    KaapiOIDCDeviceAuthorizationFlowBuilder,
} from '@kaapi/oauth2-auth-design';
import { KaapiServerRoute } from '@kaapi/kaapi';
import Joi from 'joi';

//#region (To be replaced with persistent storage) Storage for clients, users, codes, refresh tokens.

interface RefreshPayload extends JwtPayload {
    client_id?: string;
    scope?: string;
    sub?: string;
    type?: 'refresh';
}

interface CodeData {
    clientId: string;
    scope: string[];
    userId: string;
    expiresAt: number;
    codeChallenge?: string | undefined;
    nonce?: string | undefined;
    [key: string]: unknown;
}

interface RefreshTokenData {
    clientId: string;
    userId: string;
    scope: string[];
    expiresAt: number;
    [key: string]: unknown;
}

interface ClientData {
    client_id: string;
    client_secret: string;
    allowed_scopes: string[];
    grant_types: string[];
    redirect_uris: string[];
    [key: string]: unknown;
}

interface UserData {
    id: string;
    username: string;
    password: string;
    email: string;
    [key: string]: unknown;
}

const VALID_CLIENTS: ClientData[] = [
    {
        id: 'service-api-client',
        secret: 's3cr3tK3y123!',
        allowed_scopes: ['openid', 'profile', 'email', 'offline_access'],
        grant_types: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
        redirectUris: [],
    },
];

const REGISTERED_USERS: UserData[] = [{ id: 'user-1234', username: 'user', password: 'crossterm', email: 'user@email.com' }];

const codeStorage: Map<
    string,
    CodeData
> = new Map();

const refreshTokenStorage: Map<
    string,
    RefreshTokenData
> = new Map();

async function getClient(clientId: string): Promise<ClientData | undefined> {
    return VALID_CLIENTS.find((c) => c.client_id === clientId);
}

async function storeCode(code: string, data: CodeData) {
    codeStorage.set(code, data);
}

async function getCodeData(code: string): Promise<CodeData | undefined> {
    return codeStorage.get(code);
}

async function deleteCode(code: string): Promise<void> {
    codeStorage.delete(code);
}

async function storeRefreshToken(token: string, data: RefreshTokenData) {
    refreshTokenStorage.set(token, data);
}

async function getRefreshTokenData(token: string): Promise<RefreshTokenData | undefined> {
    return refreshTokenStorage.get(token);
}

async function deleteRefreshToken(token: string): Promise<void> {
    refreshTokenStorage.delete(token);
}

//#endregion

//#region (To be replaced with persistent storage) JWKS Authority and Rotator

const jwksStore = createInMemoryKeyStore();

// Signs JWTs and exposes the public JWKS endpoint
export const jwksAuthority = new JoseJwksAuthority(jwksStore, 8.64e6); // 100-day key lifetime

// Rotates keys every 91 days and cleans up expired ones
export const jwksRotator = new JwksRotator({
    keyGenerator: jwksAuthority,
    rotationTimestampStore: jwksStore,
    rotationIntervalMs: 7.884e9, // 91 days
});

//#endregion


export default KaapiOIDCDeviceAuthorizationFlowBuilder.create({
    securitySchemeName: 'oauth2_device_authorization_flow',
    onJwksRequest: async () => {
        return await jwksAuthority.getJwksEndpointResponse();
    }
})
    .setTokenType(new BearerTokenType()) // optional, default BearerToken
    .setAccessTokenLifetime(600) // 10m
    .setVerificationEndpoint(VERIFICATION_URI)
    .setDeviceCodeLifetime(900) // 15m
    .setPollingInterval(5) // 5s
    .addClientAuthenticationMethod(new NoneAuthMethod()) // client authentication methods
    .tokenVerifier(async (_req, { token }) => {
        try {
            const payload = await jwksAuthority.verify(token);
            if (payload) {
                // db query
                const user = payload?.type === 'user' && payload.sub
                    ? await db.users.findById(`${payload.sub}`)
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
                    },
                };
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
    .setAuthorizationEndpoint('/oauth2/device_authorization')
    .getClientForAuthentication(async ({ clientId }) => await getClient(clientId))
    .generateDeviceCode(async ({ client, scope }) => {
        // generate codes
        const userCode = generateCode(6);
        const deviceCode = encode({ clientId: client.id, scope, code: generateCode(24) });

        // save in db
        await db.deviceTokens.insertOne({
            id: deviceCode,
            userCode,
            expiresAt: Date.now() + 900_000,
        });

        return {
            deviceCode: deviceCode,
            userCode: userCode,
        };
    })
    .setTokenEndpoint('/oauth2/token')
    .getClient(async ({ clientId }) => await getClient(clientId))
    .generateAccessToken(async ({ client, deviceCode, accessTokenLifetime, origin }) => {
        const decodedCode = decode(deviceCode);

        // db query
        const deviceToken = await db.deviceTokens.findById(deviceCode);

        // device token not found
        if (!deviceToken) {
            return { type: 'error', error: 'authorization_pending' };
        }

        // device token expired
        if (deviceToken.expiresAt <= Date.now()) {
            db.deviceTokens.deleteOneWithId(deviceToken.id);
            return {
                type: 'error',
                error: 'expired_token',
                errorDescription: 'The device code has expired. Please initiate a new device authorization request.',
            }
        }
        // device token authorization pending
        if (!deviceToken.userId) {
            return {
                type: 'error',
                error: 'authorization_pending',
                errorDescription: 'The device code has not been authorized yet. Please complete the device authorization process.',
            }
        }

        // db query
        const user = await db.users.findById(deviceToken.userId);
        if (!user) {
            return;
        }

        const accessScope = Array.isArray(decodedCode.scope) ? decodedCode.scope : [];
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
    .generateAccessTokenFromRefreshToken(async ({ accessTokenLifetime, client, origin, refreshToken, scope }) => {
        const payload = await jwksAuthority.verify<RefreshTokenData>(refreshToken);
        if (
            !payload ||
            !(
                payload.client_id &&
                payload.client_id === client.id &&
                payload.sub &&
                payload.type === 'refresh'
            )
        ) {
            return;
        }

        // db query
        const user = await db.users.findById(payload.sub);
        if (!user) {
            return;
        }

        const accessScope = scope || payload.scope?.split(' ') || [];

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
        'This API uses OAuth 2 with the device authorization grant flow. [More info](https://www.oauth.com/oauth2-servers/device-flow/)'
    )
    .setScopes({
        openid: 'Required for OpenID Connect; enables ID token issuance.',
        profile: 'Access to basic profile information such as name and picture.',
        email: "Access to the user's email address and its verification status.",
        offline_access: 'Request a refresh token to access resources when the user is offline.',
    }).build();

export const deviceVerificationRoute: KaapiServerRoute<{ Query: { user_code: string } }> = {
    method: 'GET',
    path: '/oauth2/v2/activate',
    options: {
        validate: {
            query: Joi.object({
                user_code: Joi.string(),
            }),
        },
    },
    handler: async (request, h) => {
        const userCode = request.query.user_code;

        const entry = await db.deviceTokens.findByUserCode(userCode);
        if (!entry) return h.response('Invalid user_code').code(404);

        const decoded = decode<{ clientId: string; scope: string[] }>(entry.id);

        // link the user to the device code in the database 
        // (in a real application, you would also verify the user's identity and ensure they are authorized to link the device)
        await db.deviceTokens.updateOneWithId(entry.id, { userId: '248289761001' });

        return h.response(
            `Device verified successfully for client: ${decoded.clientId}, scopes: ${decoded.scope.join(' ')}`
        );
    }
}
*/
