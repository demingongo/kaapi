import { SecuritySchemeObject } from '@novice1/api-doc-generator/lib/generators/openapi/definitions';
import { ChallengeAlgorithm, GrantType, OAuth2Util } from '@novice1/api-doc-generator';
import { OAuth2AuthorizationCode, OAuth2AuthorizationCodeArg } from './authorization-code';
import { KaapiTools, Lifecycle, ReqRef, Request, ReqRefDefaults, ResponseToolkit } from '@kaapi/kaapi';
import { JWKS, JWKSStore } from '../utils/jwks-store';
import { DefaultOAuth2ACAuthorizationRoute, OAuth2ACAuthorizationRoute } from './auth-code/authorization-route';
import { DefaultOAuth2ACTokenRoute, OAuth2ACTokenRoute } from './auth-code/token-route';
import { ClientAuthMethod, ClientSecretBasic, ClientSecretPost, NoneAuthMethod, TokenEndpointAuthMethod } from '../utils/client-auth-methods';
import { TokenType } from '../utils/token-types';
import { DefaultJWKSRoute, IJWKSRoute, JWKSRoute, OAuth2AuthOptions, OAuth2RefreshTokenHandler, OAuth2RefreshTokenRoute } from './common';

//#region OpenIDAuthUtil

export class OpenIDAuthUtil extends OAuth2Util {

    setHost(host: string): this {
        super.setHost(host)
        return this
    }

    toOpenAPI(): Record<string, SecuritySchemeObject> {
        const host = this.getHost()
        return {
            [this.securitySchemeName]: {
                type: 'openIdConnect',
                openIdConnectUrl: `${host || ''}/.well-known/openid-configuration`
            }
        }
    }
}

//#endregion OpenIDAuthUtil

//#region OpenIDUserInfoRoute

export type OpenIDUserInfoHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IOpenIDUserInfoRoute<
    Refs extends ReqRef = ReqRefDefaults
> {
    path: string,
    handler: OpenIDUserInfoHandler<Refs>
}

export class OpenIDUserInfoRoute<
    Refs extends ReqRef = ReqRefDefaults
> implements IOpenIDUserInfoRoute<Refs> {
    protected _path: string;
    protected _handler: OpenIDUserInfoHandler<Refs>

    get path() {
        return this._path
    }

    get handler() {
        return this._handler
    }

    constructor(
        path: string,
        handler: OpenIDUserInfoHandler<Refs>
    ) {
        this._path = path;
        this._handler = handler;
    }
}

//#endregion OpenIDUserInfoRoute

//#region OpenIDAuthDesign

export interface OpenIDAuthDesignArg extends OAuth2AuthorizationCodeArg {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwksRoute: IJWKSRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    userInfoRoute?: IOpenIDUserInfoRoute<any>

    /**
     * Override the configuration served at /.well-known/openid-configuration
     */
    openidConfiguration?: Record<string, unknown>
}

export class OpenIDAuthDesign extends OAuth2AuthorizationCode {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected jwksRoute: IJWKSRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected userInfoRoute?: IOpenIDUserInfoRoute<any>;

    protected openidConfiguration: Record<string, unknown> = {}

    constructor(
        params: OpenIDAuthDesignArg
    ) {
        const { strategyName, openidConfiguration, jwksRoute, userInfoRoute, ...props } = params

        super(props)

        this.withPkce()
        this.strategyName = strategyName || 'open-id-auth-design'
        this.jwksRoute = jwksRoute
        this.userInfoRoute = userInfoRoute

        if (openidConfiguration)
            this.openidConfiguration = openidConfiguration
    }

    getScopes(): Record<string, string> {
        let scopes: Record<string, string> = {
            openid: 'enable OpenID Connect'
        }
        if (this.scopes) {
            if ('openid' in this.scopes) {
                scopes = this.scopes
            } else {
                scopes = { ...this.scopes, ...scopes }
            }
        }
        return scopes
    }

    integrateHook(t: KaapiTools): void {
        super.integrateHook(t)

        const docs = this.docs()
        const challengeAlgo = docs.getChallengeAlgorithm()
        const host = t.postman?.getHost()[0] || ''

        t.route({
            path: '/.well-known/openid-configuration',
            method: 'GET',
            options: {
                plugins: {
                    kaapi: {
                        docs: false
                    }
                }
            },
            handler: () => {
                const wellKnownOpenIDConfig: Record<string, string | string[] | undefined> = {
                    issuer: host,
                    authorization_endpoint: `${host}${this.authorizationRoute.path}`,
                    token_endpoint: `${host}${this.tokenRoute.path}`,
                    userinfo_endpoint: this.userInfoRoute ? `${host}${this.userInfoRoute.path}` : undefined,
                    jwks_uri: `${host}${this.jwksRoute.path}`,
                    claims_supported: [
                        'aud',
                        'exp',
                        'iat',
                        'iss',
                        'sub'
                    ],
                    grant_types_supported: [
                        'authorization_code'
                    ],
                    response_types_supported: [
                        'code',
                        'token',
                        'code token',
                        'code token id_token'
                    ],
                    scopes_supported: Object.keys(docs.getScopes()),
                    subject_types_supported: [
                        'public'
                    ],
                    id_token_signing_alg_values_supported: [
                        'RS256'
                    ],
                    code_challenge_methods_supported: challengeAlgo ? [
                        challengeAlgo
                    ] : [],
                    token_endpoint_auth_methods_supported: this.getTokenEndpointAuthMethods()
                }

                if (this.clientAuthMethods.client_secret_jwt?.algorithms?.length) {
                    wellKnownOpenIDConfig.token_endpoint_auth_signing_alg_values_supported = wellKnownOpenIDConfig.token_endpoint_auth_signing_alg_values_supported || []
                    wellKnownOpenIDConfig.token_endpoint_auth_signing_alg_values_supported = [
                        ...wellKnownOpenIDConfig.token_endpoint_auth_signing_alg_values_supported,
                        ...this.clientAuthMethods.client_secret_jwt.algorithms
                    ]
                }
                if (this.clientAuthMethods.private_key_jwt?.algorithms?.length) {
                    wellKnownOpenIDConfig.token_endpoint_auth_signing_alg_values_supported = wellKnownOpenIDConfig.token_endpoint_auth_signing_alg_values_supported || []
                    wellKnownOpenIDConfig.token_endpoint_auth_signing_alg_values_supported = [
                        ...wellKnownOpenIDConfig.token_endpoint_auth_signing_alg_values_supported,
                        ...this.clientAuthMethods.private_key_jwt.algorithms
                    ]
                }

                return { ...wellKnownOpenIDConfig, ...this.openidConfiguration }
            }
        })

        t.route({
            path: this.jwksRoute.path,
            method: 'GET',
            options: {
                plugins: {
                    kaapi: {
                        docs: false
                    }
                }
            },
            handler: async (req, h) => {

                const jwks = await this.jwksGenerator?.generateIfNeeded() as JWKS

                if (this.jwksRoute.handler) {
                    return this.jwksRoute.handler({
                        jwks
                    }, req, h)
                }

                return jwks
            }
        })

        if (this.userInfoRoute?.path) {
            t.route({
                path: this.userInfoRoute.path,
                method: 'GET',
                auth: true,
                options: {
                    auth: {
                        strategy: this.strategyName,
                        mode: 'required'
                    }
                },
                handler: this.userInfoRoute.handler.bind(this.userInfoRoute)
            })
        }
    }

    docs() {
        const docs = new OpenIDAuthUtil(this.strategyName)
            .setGrantType(this.isWithPkce() ? GrantType.authorizationCodeWithPkce : GrantType.authorizationCode)
            .setScopes(this.getScopes())
            .setAuthUrl(this.authorizationRoute.path)
            .setAccessTokenUrl(this.tokenRoute.path || '')
            .setChallengeAlgorithm(ChallengeAlgorithm.S256);

        if (this.refreshTokenRoute?.path) {
            docs.setRefreshUrl(this.refreshTokenRoute.path)
        }

        if (this.description) {
            docs.setDescription(this.description)
        }

        return docs
    }
}

//#endregion OpenIDAuthDesign

//#region Builder

export interface OpenIDAuthDesignBuilderArg extends OpenIDAuthDesignArg {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authorizationRoute: DefaultOAuth2ACAuthorizationRoute<any, any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenRoute: DefaultOAuth2ACTokenRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwksRoute: DefaultJWKSRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenType?: TokenType<any>
}

export class OpenIDAuthDesignBuilder {

    #params: OpenIDAuthDesignBuilderArg

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #tokenType?: TokenType<any>
    #tokenTTL?: number
    #description?: string
    #scopes?: Record<string, string>
    #clientAuthMethods: Record<TokenEndpointAuthMethod, ClientAuthMethod | undefined> = {
        client_secret_basic: undefined,
        client_secret_post: undefined,
        client_secret_jwt: undefined,
        private_key_jwt: undefined,
        none: undefined
    }
    #pkce: boolean = true

    constructor(params: OpenIDAuthDesignBuilderArg) {
        this.#params = params
    }

    static create(params?: Partial<OpenIDAuthDesignBuilderArg>): OpenIDAuthDesignBuilder {
        const paramsComplete: OpenIDAuthDesignBuilderArg = {
            authorizationRoute: params && params.authorizationRoute || OAuth2ACAuthorizationRoute.buildDefault(),
            tokenRoute: params && params.tokenRoute || OAuth2ACTokenRoute.buildDefault(),
            jwksRoute: params && params.jwksRoute || JWKSRoute.buildDefault(),
            ...(params || {})
        };
        return new OpenIDAuthDesignBuilder(paramsComplete)
    }

    build(): OpenIDAuthDesign {
        const result = new OpenIDAuthDesign(this.#params)

        result.setTokenTTL(this.#tokenTTL)

        if (typeof this.#description !== 'undefined') {
            result.setDescription(this.#description)
        }
        if (typeof this.#scopes !== 'undefined') {
            result.setScopes(this.#scopes)
        }
        if (typeof this.#tokenType !== 'undefined') {
            result.setTokenType(this.#tokenType)
        }
        for (const method of Object.values(this.#clientAuthMethods)) {
            if (method) {
                result.addClientAuthenticationMethod(method)
            }
        }
        if (!this.#pkce) {
            result.withoutPkce()
        } else {
            result.withPkce()
        }
        return result
    }

    setTokenTTL(ttlSeconds?: number): this {
        this.#tokenTTL = ttlSeconds
        return this
    }

    setDescription(description: string): this {
        this.#description = description;
        return this;
    }

    setScopes(scopes: Record<string, string>): this {
        this.#scopes = scopes;
        return this;
    }

    setTokenType<Refs extends ReqRef = ReqRefDefaults>(value: TokenType<Refs>): this {
        this.#tokenType = value
        return this
    }

    addClientAuthenticationMethod(value: 'client_secret_basic' | 'client_secret_post' | 'none' | ClientAuthMethod): this {
        if (value == 'client_secret_basic') {
            this.#clientAuthMethods.client_secret_basic = new ClientSecretBasic()
        } else if (value == 'client_secret_post') {
            this.#clientAuthMethods.client_secret_post = new ClientSecretPost()
        } else if (value == 'none') {
            this.#clientAuthMethods.none = new NoneAuthMethod()
        } else {
            this.#clientAuthMethods[value.method] = value
        }
        return this
    }

    withPkce(): this {
        this.#pkce = false
        return this
    }

    withoutPkce(): this {
        this.#pkce = false
        return this
    }

    additionalConfiguration(openidConfiguration: Record<string, unknown>): this {
        this.#params.openidConfiguration = openidConfiguration
        return this
    }

    strategyName(name: string): this {
        this.#params.strategyName = name
        return this
    }

    setJwksStore(store: JWKSStore): this {
        this.#params.jwksStore = store
        return this
    }

    validate<Refs extends ReqRef = ReqRefDefaults>(handler: OAuth2AuthOptions<Refs>['validate']): this {
        this.#params.options = { validate: handler }
        return this
    }

    authorizationRoute<GetRefs extends ReqRef = ReqRefDefaults, PostRefs extends ReqRef = ReqRefDefaults>
        (handler: (route: DefaultOAuth2ACAuthorizationRoute<GetRefs, PostRefs>) => void): this {
        handler(this.#params.authorizationRoute)
        return this
    }

    jwksRoute<Refs extends ReqRef = ReqRefDefaults>(handler: (route: DefaultJWKSRoute<Refs>) => void): this {
        handler(this.#params.jwksRoute)
        return this
    }

    tokenRoute<Refs extends ReqRef = ReqRefDefaults>(handler: (route: DefaultOAuth2ACTokenRoute<Refs>) => void): this {
        handler(this.#params.tokenRoute)
        return this
    }

    refreshTokenRoute<Refs extends ReqRef = ReqRefDefaults>
        (
            path: string,
            handler: OAuth2RefreshTokenHandler<Refs>
        ): this {
        this.#params.refreshTokenRoute = new OAuth2RefreshTokenRoute(path, handler)
        return this
    }
}

//#endregion Builder