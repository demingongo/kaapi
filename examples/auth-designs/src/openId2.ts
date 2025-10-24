import Boom from '@hapi/boom'

import {
    OAuth2ACAuthorizationRoute,
    OAuth2RefreshTokenHandler,
    OAuth2RefreshTokenRoute,
    OAuth2ACTokenRoute,
    OIDCAuthorizationCode,
    JWKSRoute,
    OAuth2TokenResponse,
    //OAuth2AuthorizationCode,
    BearerToken,
    OAuth2ErrorCode,
    //ClientSecretPost,
    //ClientSecretBasic,
    //ClientSecretJwt,
    //PrivateKeyJwt, 
    //DPoPToken 
} from '@kaapi/oauth2-auth-design';

const tokenType = new BearerToken()

export const openIDDesign2 = new OIDCAuthorizationCode(
    {
        openidConfiguration: {
            // to announce the use of dpop in openid-configuration
            ...tokenType.configuration
        },
        jwksOptions: undefined,
        jwksRoute: new JWKSRoute('/openid/jwks'),
        /*
        userInfoRoute: new OpenIDUserInfoRoute('/openid/session', async () => {
            return {
                sub: '248289761001',
                name: 'Jane Doe',
                given_name: 'Jane',
                family_name: 'Doe',
                preferred_username: 'janed',
                email: 'janed@example.com',
                email_verified: true,
                picture: 'https://example.com/janed.jpg'
            }
        }),
        */
        authorizationRoute: OAuth2ACAuthorizationRoute.buildDefault<object, { Payload: { user: string, pass: string } }>()
            .setPath('/oauth2/ac/login')
            .setClientId('testabc')
            .setUsernameField('user')
            .setPasswordField('pass')
            .generateCode(async ({ clientId, codeChallenge, scope, nonce }, { payload: { user, pass } }) => {
                // validate and generate code
                if (user == 'janed@example.com' && pass == '1234') {
                    return { type: 'code', value: JSON.stringify({ clientId, codeChallenge, scope, nonce, user: '248289761001' }) }
                }

                return null
            }),
        tokenRoute: OAuth2ACTokenRoute.buildDefault()
            .setPath('/oauth2/ac/token')
            .generateToken(async ({ clientId, clientSecret, code, codeVerifier, redirectUri, ttl, createIdToken }, _req) => {

                console.log('code', code)
                console.log('codeVerifier', codeVerifier)
                console.log('redirectUri', redirectUri)
                console.log('clientId', clientId)
                console.log('clientSecret', clientSecret)
                console.log('ttl', ttl)

                if (!clientSecret && !codeVerifier) {
                    return { error: OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Token Request was missing the \'client_secret\' parameter.' }
                }
                try {
                    //#region @TODO: validation + token
                    const accessToken = 'generated_access_token'
                    const refreshToken = 'generated_refresh_token'
                    const scope: string[] = ['openid']
                    const idToken = await createIdToken?.({
                        sub: '248289761001',
                        name: 'Jane Doe',
                        given_name: 'Jane',
                        family_name: 'Doe',
                        preferred_username: 'janed',
                        email: 'janed@example.com',
                        email_verified: true,
                        picture: 'https://example.com/janed.jpg'
                    })
                    return new OAuth2TokenResponse({ access_token: accessToken })
                        .setExpiresIn(ttl)
                        .setRefreshToken(refreshToken)
                        .setScope(scope)
                        .setIdToken(
                            idToken?.token
                        )
                        .setTokenType(tokenType)
                    //#endregion @TODO: validation + token
                } catch (err) {
                    console.error(err)
                }

                return null
            }),
        refreshTokenRoute: new OAuth2RefreshTokenRoute(
            '/oauth2/ac/token',
            (async ({ clientId, clientSecret, refreshToken, scope, ttl }, _req, h) => {

                console.log('clientId', clientId)
                console.log('clientSecret', clientSecret)
                console.log('refreshToken', refreshToken)
                console.log('scope', scope)
                console.log('ttl', ttl)

                //#region @TODO: validation + refresh token

                //#endregion @TODO: validation + refresh token

                return h.response({ error: OAuth2ErrorCode.INVALID_GRANT }).code(400)
            }) as OAuth2RefreshTokenHandler,
        ),
        options: {
            async validate(req, { token }, h) {
                console.log('validate => req.app.oauth2.proofThumbprint:', req.app.oauth2?.dpopThumbprint)
                if (token) {
                    console.log('token=', token)
                    //#region @TODO: validation
                    if (token != 'generated_access_token') {
                        return {}
                    }

                    //#endregion @TODO: validation

                    // authorized to go further
                    return {
                        isValid: !!token,
                        credentials: {
                            user: {
                                sub: '248289761001',
                                name: 'Jane Doe',
                                given_name: 'Jane',
                            }
                        }
                    }
                }

                return h.unauthenticated(Boom.unauthorized('unauthorized', 'Bearer'))
            },
        }
    }
)
    .setDescription('This API uses OAuth 2 with the authentication code grant flow. [More info](https://oauth.net/2/grant-types/authorization-code/)')
    .setScopes({
        profile: 'Access to your profile information',
        email: 'Access to your email address',
        offline_access: 'Access to your data when you are not connected'
    })
    .setTokenType(tokenType)
    .setTokenTTL(36000)
    //.addClientAuthenticationMethod(new ClientSecretPost())
    //.addClientAuthenticationMethod(new ClientSecretBasic())
    //.addClientAuthenticationMethod(new ClientSecretJwt())
    //.addClientAuthenticationMethod(new PrivateKeyJwt())
    //.clientSecretBasicAuthenticationMethod()
    .clientSecretPostAuthenticationMethod() // to debug (used in SwaggerUI)
//.noneAuthenticationMethod() // or .withPkce() (default)
//.withoutPkce() // to remove 'none'