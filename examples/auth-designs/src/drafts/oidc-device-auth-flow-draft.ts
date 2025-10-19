import {
    BearerToken,
    DeviceFlowOAuth2ErrorCode,
    NoneAuthMethod,
    OAuth2ErrorCode,
    OAuth2TokenResponse,
    OIDCDeviceAuthorizationBuilder
} from '@kaapi/oauth2-auth-design'

import logger from './logger'
import db from './database'
import { decode, encode } from './encoder';
import { generateCode, VERIFICATION_URI } from './utils';

interface RefreshPayload {
    client_id?: string
    scope?: string
    sub?: string
    type?: 'refresh'
}

const tokenType = new BearerToken();

export default OIDCDeviceAuthorizationBuilder
    .create({ logger })
    .setTokenType(tokenType)                                        // optional, default BearerToken
    .setTokenTTL(600)                                               // 10m
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
    .authorizationRoute(route =>
        route
            .setPath('/oauth2/devicecode') // optional, default '/oauth2/authorize'
            .generateCode(async ({ clientId, scope }, _request) => {
                // db query
                const client = await db.clients.findById(clientId)

                // client not found
                if (!client) {
                    return null
                }

                // generate codes
                const userCode = generateCode(6);
                const deviceCode = encode({ clientId, scope, code: generateCode(24) });

                const searchParams = new URLSearchParams();
                searchParams.append('user_code', userCode);

                // save in db
                await db.deviceTokens.insertOne({
                    id: deviceCode,
                    userCode,
                    expiresAt: Date.now() + 900_000
                });

                return {
                    device_code: deviceCode,
                    expires_in: 900, // 15min
                    interval: 5, // 5s
                    user_code: userCode,
                    verification_uri: VERIFICATION_URI,
                    verification_uri_complete: `${VERIFICATION_URI}?${searchParams.toString()}`
                };
            })
    )
    .tokenRoute(route =>
        route
            .setPath('/oauth2/token') // optional, default '/oauth2/token'
            .generateToken(async ({
                clientId,
                ttl,
                tokenType,
                createJwtAccessToken,
                createIdToken,
                deviceCode
            }, _req) => {

                const decodedCode = decode(deviceCode);
                const scope = decodedCode.scope;

                if (!ttl) {
                    return { error: DeviceFlowOAuth2ErrorCode.ACCESS_DENIED, error_description: 'Missing ttl' }
                }

                // db query
                const client = await db.clients.findById(clientId)
                const deviceToken = await db.deviceTokens.findById(deviceCode)

                // client not found
                if (!client) {
                    return { error: DeviceFlowOAuth2ErrorCode.ACCESS_DENIED, error_description: 'Bad \'clientId\' parameter.' };
                }
                // device token not found
                if (!deviceToken) {
                    return null;
                }
                // device token expired
                if (deviceToken.expiresAt <= Date.now()) {
                    db.deviceTokens.deleteOneWithId(deviceToken.id);
                    return { error: DeviceFlowOAuth2ErrorCode.EXPIRED_TOKEN };
                }
                // device token authorization pending
                if (!deviceToken.userId) {
                    return { error: DeviceFlowOAuth2ErrorCode.AUTHORIZATION_PENDING };
                }

                // db query
                const user = await db.users.findById(deviceToken.userId);
                if (!user) {
                    return null;
                }

                try {
                    if (createJwtAccessToken) {
                        const { token: accessToken } = await createJwtAccessToken({
                            sub: user.id,
                            type: 'user'
                        });
                        const refreshToken = (scope?.split(' ').includes('offline_access') || undefined) && await createJwtAccessToken({
                            sub: user.id,
                            client_id: client.id,
                            scope,
                            exp: Date.now() / 1000 + 604_800, // 7 days
                            type: 'refresh'
                        });
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
                                    email: (scope?.split(' ').includes('email') || undefined) && user.email
                                }))?.token
                            ) // add id_token if scope has 'openid'
                    }
                } catch (err) {
                    console.error(err)
                }

                return null
            }))
    .refreshTokenRoute(route =>
        route
            .setPath('/oauth2/token') // optional, default '/oauth2/token'
            .generateToken(async ({ clientId, refreshToken, scope, ttl, tokenType, createJwtAccessToken, createIdToken, verifyJwt }, _req) => {

                try {
                    // verify refresh token
                    const payload = await verifyJwt?.<RefreshPayload>(refreshToken)
                    if (!payload || !(payload.client_id && payload.client_id === clientId && payload.sub && payload.type === 'refresh')) {
                        return { error: DeviceFlowOAuth2ErrorCode.ACCESS_DENIED }
                    }

                    // db query
                    const client = await db.clients.findById(clientId)
                    const user = await db.users.findById(payload.sub)

                    // client or user not found
                    if (!client || !user) {
                        return { error: DeviceFlowOAuth2ErrorCode.ACCESS_DENIED }
                    }

                    if (!ttl) {
                        return { error: OAuth2ErrorCode.ACCESS_DENIED, error_description: 'Missing ttl' }
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
    .setDescription('This API uses OAuth 2 with the device authorization grant flow. [More info](https://www.oauth.com/oauth2-servers/device-flow/)')
    .setScopes({
        openid: 'Required for OpenID Connect; enables ID token issuance.',
        profile: 'Access to basic profile information such as name and picture.',
        email: 'Access to the user\'s email address and its verification status.',
        offline_access: 'Request a refresh token to access resources when the user is offline.'
    })
//.build() // Optionally build this as a standalone flow