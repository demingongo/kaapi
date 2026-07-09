import { BearerTokenType, JwtPayload, NoneAuthMethod } from '@saurbit/oauth2';
import { jwksAuthority } from '../plugins/jwks';
import db from './database';
import { decode, encode } from './encoder';
import { generateCode, VERIFICATION_URI } from './utils';
import {
    KaapiOIDCDeviceAuthorizationFlowBuilder,
} from '@kaapi/oauth2-auth-design';

interface RefreshPayload extends JwtPayload {
    client_id?: string;
    scope?: string;
    sub?: string;
    type?: 'refresh';
}

const tokenType = new BearerTokenType();

const getClient = async (clientId: string) => {
    // db query
    const client = await db.clients.findById(clientId);

    // client not found
    if (client) {
        return {
            grants: ['device_code'],
            id: client.id,
            redirectUris: [],
            scopes: ['openid', 'profile', 'email', 'offline_access'],
            redirect_uris: client.redirect_uris,
            metadata: {
                name: client.name,
            }
        };
    }

    return;
}

export default KaapiOIDCDeviceAuthorizationFlowBuilder.create({
    onJwksRequest: async () => {
        return await jwksAuthority.getJwksEndpointResponse();
    }
})
    .setTokenType(tokenType) // optional, default BearerToken
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
    .setAuthorizationEndpoint('/oauth2/devicecode')
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
            return;
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
            username: `${client.metadata?.username}`,
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
        const payload = await jwksAuthority.verify<RefreshPayload>(refreshToken);
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
            username: `${client.metadata?.username}`,
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
