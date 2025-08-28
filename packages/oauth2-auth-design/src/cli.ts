import { FileGenerator, FileGeneratorType, Question, QuestionType } from '@kaapi/cli/definitions'
import { camelCase, kebabCase } from '@kaapi/cli/utils'

export class OAuth2FileGenerator implements FileGenerator {

    get type(): FileGeneratorType {
        return 'auth-design'
    }

    get name(): 'oauth2-generator' {
        return 'oauth2-generator'
    }

    get description(): string {
        return 'Creates an auth design based on OAuth2 specifications.'
    }

    get options(): Record<string, string> {
        return {
            name: 'The name of the design'
        }
    }

    #values = {
        name: ''
    }

    init(options: Record<string, unknown>): void {
        if (typeof options['name'] == 'string') {
            this.#values.name = camelCase(options['name'])
        }
    }

    isValid(): boolean {
        return !!this.#values.name
    }

    getFileContent(): string {
        return `import Boom from '@hapi/boom'
import {
    OAuth2ACAuthorizationRoute,
    OAuth2RefreshTokenHandler,
    OAuth2RefreshTokenRoute,
    OAuth2ACTokenRoute,
    OpenIDAuthDesign,
    OpenIDJWKSRoute,
    OAuth2TokenResponse,
    BearerToken
} from '@kaapi/oauth2-auth-design';

const tokenType = new BearerToken()

export const ${this.#values.name} = new OpenIDAuthDesign(
    {
        strategyName: '${kebabCase(this.#values.name)}',
        openidConfiguration: {
            ...tokenType.configuration
        },
        jwksStore: undefined,
        jwksRoute: new OpenIDJWKSRoute('/openid/jwks'),
        authorizationRoute: OAuth2ACAuthorizationRoute.buildDefault<object, { Payload: { user: string, pass: string } }>()
            .setPath('/oauth2/authorize')
            .setEmailField('email')
            .setPasswordField('password')
            .generateCode(async ({ clientId, codeChallenge, scope, nonce }, { payload: { user, pass } }) => {
                // validate and generate code
                if (user == 'janed@example.com' && pass == '1234') {
                    return JSON.stringify({ clientId, codeChallenge, scope, nonce, user: '248289761001' })
                }

                return null
            }),
        tokenRoute: OAuth2ACTokenRoute.buildDefault()
            .setPath('/oauth2/token')
            .generateToken(async ({ clientId, clientSecret, code, codeVerifier, redirectUri, ttl, createIdToken }, _req) => {

                if (!clientSecret && !codeVerifier) {
                    return { error: 'invalid_request', error_description: 'Token Request was missing the \\'client_secret\\' parameter.' }
                }
                try {
                    //#region @TODO: validation + token
                    const accessToken = 'generated_access_token'
                    const refreshToken = 'generated_refresh_token'
                    const scope: string[] = ['openid']
                    return new OAuth2TokenResponse({ access_token: accessToken })
                        .setExpiresIn(ttl)
                        .setRefreshToken(refreshToken)
                        .setScope(scope)
                        .setIDToken(
                            await createIdToken?.({
                                sub: '248289761001',
                                name: 'Jane Doe',
                                given_name: 'Jane',
                                family_name: 'Doe',
                                preferred_username: 'janed',
                                email: 'janed@example.com',
                                email_verified: true,
                                picture: 'https://example.com/janed.jpg'
                            })
                        )
                        .setTokenType(tokenType)
                    //#endregion @TODO: validation + token
                } catch (err) {
                    console.error(err)
                }

                return null
            }),
        refreshTokenRoute: new OAuth2RefreshTokenRoute(
            '/oauth2/token',
            (async ({ clientId, clientSecret, refreshToken, scope, ttl }, _req, h) => {

                //#region @TODO: validation + refresh token

                //#endregion @TODO: validation + refresh token

                return h.response({ error: 'invalid_token' }).code(400)
            }) as OAuth2RefreshTokenHandler,
        ),
        options: {
            async validate(req, { token }, h) {
                if (token) {
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
    .clientSecretBasicAuthenticationMethod()
    .clientSecretPostAuthenticationMethod() // to debug (used in SwaggerUI)
    //.withoutPkce() // to remove 'none'
`
    }

    getQuestions(): Question[] {
        const r: Question[] = []

        if (!this.#values.name) {
            r.push({
                type: QuestionType.text,
                options: {
                    message: 'The name of the auth design?',
                    defaultValue: 'oauth2AuthDesign',
                    placeholder: 'oauth2AuthDesign'
                },
                setValue: (pluginName) => {
                    this.#values.name = camelCase(pluginName)
                }
            })
        }

        return r
    }

    getFilename(): string {
        return kebabCase(`${this.#values.name}`) + '.ts'
    }
}