import {
    KaapiTools,
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit,
    RouteOptions
} from '@kaapi/kaapi'
import { ClientAuthentication, GrantType, OAuth2Util } from '@novice1/api-doc-generator'
import {
    IOAuth2RefreshTokenRoute,
    OAuth2AuthOptions,
    AnyOAuth2ErrorCodeType,
    OAuth2RefreshTokenParams,
    OAuth2AuthDesign,
    OAuth2SingleAuthFlow,
    DefaultOAuth2RefreshTokenRoute,
    DefaultJWKSRoute,
    OAuth2AuthDesignBuilder,
    JWKSRoute,
    OAuth2RefreshTokenRoute,
    OAuth2AuthDesignOptions,
    OAuth2JwksOptions,
    OAuth2ErrorCode
} from './common'
import { createIdToken, createJwtAccessToken, verifyJwt } from '../utils/jwt-utils'
import {
    DefaultOAuth2ACAuthorizationRoute,
    IOAuth2ACAuthorizationRoute,
    OAuth2ACAuthorizationParams,
    OAuth2ACAuthorizationRoute
} from './auth-code/authorization-route'
import { DefaultOAuth2ACTokenRoute, IOAuth2ACTokenRoute, OAuth2ACTokenParams, OAuth2ACTokenRoute } from './auth-code/token-route'
import { TokenType, TokenTypeValidationResponse } from '../utils/token-types'
import { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils'
import { ClientAuthMethod, ClientSecretBasic, ClientSecretPost, NoneAuthMethod, TokenEndpointAuthMethod } from '../utils/client-auth-methods'
import { verifyCodeVerifier } from '../utils/verify-code-verifier'
import { JwksKeyStore } from '../utils/jwt-authority'

//#region OAuth2AuthorizationCode

export interface OAuth2AuthorizationCodeArg extends OAuth2AuthDesignOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authorizationRoute: IOAuth2ACAuthorizationRoute<any, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenRoute: IOAuth2ACTokenRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refreshTokenRoute?: IOAuth2RefreshTokenRoute<any>;
}

export class OAuth2AuthorizationCode extends OAuth2AuthDesign implements OAuth2SingleAuthFlow {

    get grantType(): GrantType.authorizationCode {
        return GrantType.authorizationCode
    }

    protected pkce: boolean = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected authorizationRoute: IOAuth2ACAuthorizationRoute<any, any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected tokenRoute: IOAuth2ACTokenRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected refreshTokenRoute?: IOAuth2RefreshTokenRoute<any>

    constructor(
        {
            authorizationRoute,
            tokenRoute,
            refreshTokenRoute,
            ...props
        }: OAuth2AuthorizationCodeArg
    ) {
        super({ ...props, strategyName: props.strategyName || 'oauth2-authorization-code' });

        this.authorizationRoute = authorizationRoute
        this.tokenRoute = tokenRoute
        this.refreshTokenRoute = refreshTokenRoute
    }

    withPkce(): this {
        this.pkce = true
        return super.noneAuthenticationMethod()
    }

    withoutPkce(): this {
        this.pkce = false
        this._clientAuthMethods.none = undefined
        return this
    }

    isWithPkce(): boolean {
        return this.pkce
    }

    noneAuthenticationMethod(): this {
        return this.withPkce()
    }

    protected async handleAuthorization<Refs extends ReqRef = ReqRefDefaults>(
        _t: KaapiTools,
        request: Request<Refs>,
        h: ResponseToolkit<Refs>
    ) {
        const sr: {
            handle: Lifecycle.Method<ReqRefDefaults>
        } = {
            handle: async (req, h) => {
                // validating query
                if (
                    req.query.client_id && typeof req.query.client_id === 'string' &&
                    req.query.response_type === 'code' &&
                    req.query.redirect_uri && typeof req.query.redirect_uri === 'string'
                ) {
                    const params: OAuth2ACAuthorizationParams = {
                        clientId: req.query.client_id,
                        redirectUri: req.query.redirect_uri,
                        responseType: req.query.response_type
                    }
                    if (req.query.scope && typeof req.query.scope === 'string') {
                        params.scope = req.query.scope
                    }
                    if (req.query.state && typeof req.query.state === 'string') {
                        params.state = req.query.state
                    }
                    if (req.query.code_challenge && typeof req.query.code_challenge === 'string') {
                        params.codeChallenge = req.query.code_challenge
                    }
                    if (req.query.nonce && typeof req.query.nonce === 'string') {
                        params.nonce = req.query.nonce
                    }

                    if (req.method.toLowerCase() === 'get') {
                        return this.authorizationRoute.handler(params, req, h)
                    } else {
                        return this.authorizationRoute.postHandler(params, req, h)
                    }
                } else {
                    let errorDescription = ''
                    if (!(req.query.client_id && typeof req.query.client_id === 'string')) {
                        errorDescription = 'Request was missing the \'client_id\' parameter.'
                    } else if (!(req.query.response_type === 'code')) {
                        errorDescription = `Request does not support the 'response_type' '${req.query.response_type}'.`
                    } else if (!(req.query.redirect_uri && typeof req.query.redirect_uri === 'string')) {
                        errorDescription = 'Request was missing the \'redirect_uri\' parameter.'
                    }

                    return h.response({ error: OAuth2ErrorCode.INVALID_REQUEST, error_description: errorDescription }).code(400)
                }
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return sr.handle(request as Request<any>, h as ResponseToolkit<any>)
    }

    registerAuthorizationEndpoint(t: KaapiTools): void {
        t
            .route({
                options: {
                    plugins: {
                        kaapi: {
                            docs: false
                        }
                    }
                },
                path: this.authorizationRoute.path,
                method: ['GET', 'POST'],
                handler: async (req, h) => {
                    return await this.handleAuthorization(t, req, h)
                }
            });
    }

    async handleToken<Refs extends ReqRef = ReqRefDefaults>(
        t: KaapiTools,
        request: Request<Refs>,
        h: ResponseToolkit<Refs>
    ) {
        const hasOpenIDScope = () => typeof this.getScopes()?.['openid'] != 'undefined'

        const tokenTypeInstance = this._tokenType

        const supported = this.getTokenEndpointAuthMethods();
        const authMethodsInstances = this.clientAuthMethods;
        const jwtAuthority = this.getJwtAuthority();

        const sr: {
            handle: Lifecycle.Method<{
                Payload: { code_verifier?: unknown, code?: unknown, grant_type?: unknown, redirect_uri?: unknown }
            }>
        } = {
            handle: async (req, h) => {
                // Grant validation
                const supportedGrants = ['authorization_code']
                if (this.tokenRoute.path == this.refreshTokenRoute?.path) {
                    supportedGrants.push('refresh_token')
                }
                if (!(typeof req.payload.grant_type === 'string' && supportedGrants.includes(req.payload.grant_type))) {
                    return h.response({ error: OAuth2ErrorCode.UNSUPPORTED_GRANT_TYPE, error_description: `Request does not support the 'grant_type' '${req.payload.grant_type}'.` }).code(400)
                }

                // Client authentication is present?
                const {
                    clientId,
                    clientSecret,
                    error,
                    errorDescription
                } = await this._extractClientParams(req as unknown as Request<ReqRefDefaults>, authMethodsInstances, supported);

                if (error) {
                    return h.response({ error: error, error_description: errorDescription || undefined }).code(400)
                }

                if (!clientId) {
                    return h
                        .response({
                            error: OAuth2ErrorCode.INVALID_REQUEST,
                            error_description: `Supported token endpoint authentication methods: ${supported.join(', ')}`
                        }).code(400)
                }

                if (
                    clientId &&
                    req.payload.code && typeof req.payload.code === 'string' &&
                    req.payload.grant_type === 'authorization_code'
                ) {

                    const params: OAuth2ACTokenParams = {
                        clientId,
                        grantType: req.payload.grant_type,
                        tokenType: tokenTypeInstance.prefix,
                        code: req.payload.code,
                        verifyCodeVerifier,

                        ttl: this.tokenTTL,
                        createJwtAccessToken: jwtAuthority ? (async (payload) => {
                            return await createJwtAccessToken(jwtAuthority, {
                                aud: t.postman?.getHostValue() || '',
                                iss: t.postman?.getHostValue() || '',
                                sub: clientId,
                                ...payload
                            }, this.tokenTTL)
                        }) : undefined,
                        createIdToken: jwtAuthority && hasOpenIDScope() ? (async (payload) => {
                            return await createIdToken(jwtAuthority, {
                                aud: clientId,
                                iss: t.postman?.getHostValue() || '',
                                ...payload
                            }, this.tokenTTL)
                        }) : undefined
                    }
                    if (clientSecret) {
                        params.clientSecret = clientSecret
                    }
                    if (req.payload.code_verifier && typeof req.payload.code_verifier === 'string') {
                        params.codeVerifier = req.payload.code_verifier
                    }
                    if (req.payload.redirect_uri && typeof req.payload.redirect_uri === 'string') {
                        params.redirectUri = req.payload.redirect_uri
                    }

                    const ttR: TokenTypeValidationResponse = tokenTypeInstance.isValidTokenRequest ? (await tokenTypeInstance.isValidTokenRequest(req)) : { isValid: true }
                    if (!ttR.isValid) {
                        return h.response({ error: OAuth2ErrorCode.INVALID_REQUEST, error_description: ttR.message || '' }).code(400)
                    }

                    return this.tokenRoute.handler(params, req, h)
                } else {
                    let error: AnyOAuth2ErrorCodeType = OAuth2ErrorCode.UNAUTHORIZED_CLIENT;
                    let errorDescription = ''
                    if (!clientId) {
                        error = OAuth2ErrorCode.INVALID_REQUEST
                        errorDescription = 'Request was missing the \'client_id\' parameter.'
                    } else if (!(req.payload.code && typeof req.payload.code === 'string')) {
                        error = OAuth2ErrorCode.INVALID_REQUEST
                        errorDescription = 'Request was missing the \'code\' parameter.'
                    }
                    return h.response({ error, error_description: errorDescription }).code(400)
                }
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return sr.handle(request as Request<any>, h as ResponseToolkit<any>)
    }

    async handleRefreshToken<Refs extends ReqRef = ReqRefDefaults>(
        t: KaapiTools,
        request: Request<Refs>,
        h: ResponseToolkit<Refs>
    ) {
        const supported = this.getTokenEndpointAuthMethods();
        const authMethodsInstances = this.clientAuthMethods;
        const jwtAuthority = this.getJwtAuthority();
        const tokenTypePrefix = this.tokenType;

        const hasOpenIDScope = () => typeof this.getScopes()?.['openid'] != 'undefined';

        const sr: {
            handle: Lifecycle.Method<{
                Payload: { grant_type?: unknown, refresh_token?: unknown, scope?: unknown }
            }>
        } = {
            handle: async (req, h) => {
                // Grant validation
                const supportedGrants = ['refresh_token']
                if (!(typeof req.payload.grant_type === 'string' && supportedGrants.includes(req.payload.grant_type))) {
                    return h.response({ error: OAuth2ErrorCode.UNSUPPORTED_GRANT_TYPE, error_description: `Request does not support the 'grant_type' '${req.payload.grant_type}'.` }).code(400)
                }

                // Client authentication is present?
                const {
                    clientId,
                    clientSecret,
                    error,
                    errorDescription
                } = await this._extractClientParams(req as unknown as Request<ReqRefDefaults>, authMethodsInstances, supported);

                if (error) {
                    return h.response({ error: error, error_description: errorDescription || undefined }).code(400)
                }

                if (!clientId) {
                    return h
                        .response({
                            error: OAuth2ErrorCode.INVALID_REQUEST,
                            error_description: `Supported token endpoint authentication methods: ${supported.join(', ')}`
                        }).code(400)
                }

                const hasRefreshToken = req.payload.refresh_token && typeof req.payload.refresh_token === 'string'
                const isRefreshTokenGrantType = req.payload.grant_type === 'refresh_token'
                if (
                    clientId &&
                    hasRefreshToken &&
                    isRefreshTokenGrantType
                ) {
                    const scope = req.payload.scope && typeof req.payload.scope === 'string' ? req.payload.scope : undefined
                    const params: OAuth2RefreshTokenParams = {
                        clientId,
                        clientSecret,
                        grantType: `${req.payload.grant_type}`,
                        tokenType: tokenTypePrefix,
                        refreshToken: `${req.payload.refresh_token}`,
                        ttl: this.tokenTTL,
                        createJwtAccessToken: jwtAuthority ? (async (payload) => {
                            return await createJwtAccessToken(jwtAuthority, {
                                aud: t.postman?.getHostValue() || '',
                                iss: t.postman?.getHostValue() || '',
                                sub: clientId,
                                scope,
                                ...payload
                            }, this.tokenTTL)
                        }) : undefined,
                        createIdToken: jwtAuthority && hasOpenIDScope() ? (async (payload) => {
                            return await createIdToken(jwtAuthority, {
                                aud: clientId,
                                iss: t.postman?.getHostValue() || '',
                                ...payload
                            }, this.tokenTTL)
                        }) : undefined,
                        verifyJwt: jwtAuthority ? (async (token) => {
                            return await verifyJwt(jwtAuthority, token)
                        }) : undefined
                    }

                    if (scope) {
                        params.scope = scope
                    }

                    return this.refreshTokenRoute?.handler(params, req, h)
                } else {
                    let error: AnyOAuth2ErrorCodeType = OAuth2ErrorCode.UNAUTHORIZED_CLIENT;
                    let errorDescription = ''
                    if (!clientId) {
                        error = OAuth2ErrorCode.INVALID_REQUEST
                        errorDescription = 'Request was missing the \'client_id\' parameter.'
                    } else if (!(req.payload.refresh_token && typeof req.payload.refresh_token === 'string')) {
                        error = OAuth2ErrorCode.INVALID_REQUEST
                        errorDescription = 'Request was missing the \'refresh_token\' parameter.'
                    }
                    return h.response({ error, error_description: errorDescription }).code(400)
                }
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return sr.handle(request as Request<any>, h as ResponseToolkit<any>)
    }

    docs(): BaseAuthUtil | undefined {
        const docs = new OAuth2Util(this.strategyName)
            .setGrantType(this.isWithPkce() ? GrantType.authorizationCodeWithPkce : GrantType.authorizationCode)
            .setScopes(this.getScopes() || {})
            .setAuthUrl(this.authorizationRoute.path)
            .setAccessTokenUrl(this.tokenRoute.path || '');

        const supported = this.getTokenEndpointAuthMethods()

        if (supported.includes('client_secret_post')) {
            docs.setClientAuthentication(ClientAuthentication.body)
        } else if (
            supported.includes('client_secret_basic')
        ) {
            docs.setClientAuthentication(ClientAuthentication.header)
        }

        if (this.refreshTokenRoute?.path) {
            docs.setRefreshUrl(this.refreshTokenRoute.path)
        }

        if (this.description) {
            docs.setDescription(this.description)
        }

        return docs
    }

    integrateHook(t: KaapiTools) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const routesOptions: RouteOptions<any> = {
            plugins: {
                kaapi: {
                    docs: false
                }
            }
        };

        // authorization
        this.registerAuthorizationEndpoint(t)

        // token
        t
            .route({
                options: routesOptions,
                path: this.tokenRoute.path,
                method: 'POST',
                handler: async (req, h) => {
                    if (req.payload.grant_type === this.grantType) {
                        return await this.handleToken(t, req, h)
                    } else if (
                        req.payload.grant_type === 'refresh_token' &&
                        this.refreshTokenRoute?.path == this.tokenRoute.path
                    ) {
                        const result = await this.handleRefreshToken(t, req, h)

                        if (result === h.continue) {
                            return h.response({ error: OAuth2ErrorCode.INVALID_GRANT, error_description: 'Token was not validated by any handler.' }).code(400)
                        }

                        return result
                    }
                    return h.response({ error: OAuth2ErrorCode.UNSUPPORTED_GRANT_TYPE, error_description: `Request does not support the 'grant_type' '${req.payload.grant_type}'.` }).code(400)
                }
            })

        // refreshToken
        if (this.refreshTokenRoute?.path && this.refreshTokenRoute.path != this.tokenRoute.path) {
            t.route<{
                Payload: { grant_type?: unknown, refresh_token?: unknown, scope?: unknown }
            }>({
                options: routesOptions,
                path: this.refreshTokenRoute.path,
                method: 'POST',
                handler: async (req, h) => {
                    const result = await this.handleRefreshToken(t, req, h)

                    if (result === h.continue) {
                        return h.response({ error: OAuth2ErrorCode.INVALID_GRANT, error_description: 'Token was not validated by any handler.' }).code(400)
                    }

                    return result
                }
            })
        }

        // jwks
        this.createJwksEndpoint(t)
    }

}

export type OIDCAuthorizationCodeArg = OAuth2AuthorizationCodeArg & {
    /**
     * Override the configuration served at the discovery endpoint
     */
    openidConfiguration?: Record<string, unknown>
}

export class OIDCAuthorizationCode extends OAuth2AuthorizationCode implements OAuth2SingleAuthFlow {
    protected openidConfiguration: Record<string, unknown> = {}

    constructor(params: OIDCAuthorizationCodeArg) {
        super(params);

        if (params.openidConfiguration)
            this.openidConfiguration = params.openidConfiguration
    }

    getDiscoveryConfiguration(t: KaapiTools) {
        const supported = this.getTokenEndpointAuthMethods();
        const host = t.postman?.getHostValue() || '';
        const scopes = this.getScopes() || {};

        const wellKnownOpenIDConfig: Record<string, string | string[] | undefined> = {
            issuer: host,
            authorization_endpoint: `${host}${this.authorizationRoute.path}`,
            token_endpoint: `${host}${this.tokenRoute.path}`,
            userinfo_endpoint: undefined,
            jwks_uri: this.jwksRoute?.path ? `${host}${this.jwksRoute.path}` : undefined,
            registration_endpoint: undefined,
            claims_supported: [
                'aud',
                'exp',
                'iat',
                'iss',
                'sub'
            ],
            grant_types_supported: [
                GrantType.authorizationCode
            ],
            response_types_supported: ['code'],
            scopes_supported: Object.keys(scopes),
            subject_types_supported: [
                'public'
            ],
            id_token_signing_alg_values_supported: [
                'RS256'
            ],
            token_endpoint_auth_methods_supported: supported
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

        const result = { ...wellKnownOpenIDConfig, ...this.openidConfiguration }

        // Format unhandled endpoints
        if (typeof result.userinfo_endpoint === 'string' && (/^\/(?!\/)/.test(result.userinfo_endpoint))) {
            result.userinfo_endpoint = `${host}${result.userinfo_endpoint}`
        }
        if (typeof result.registration_endpoint === 'string' && (/^\/(?!\/)/.test(result.registration_endpoint))) {
            result.registration_endpoint = `${host}${result.registration_endpoint}`
        }

        return result
    }


    integrateHook(t: KaapiTools): void {
        super.integrateHook(t);

        const discoveryConfiguration = this.getDiscoveryConfiguration(t);

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
                return discoveryConfiguration
            }
        })
    }

}

//#endregion OAuth2AuthorizationCode

//#region Builder

export interface OAuth2AuthorizationCodeBuilderArg extends OAuth2AuthorizationCodeArg {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authorizationRoute: DefaultOAuth2ACAuthorizationRoute<any, any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenRoute: DefaultOAuth2ACTokenRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refreshTokenRoute?: DefaultOAuth2RefreshTokenRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwksRoute?: DefaultJWKSRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenType?: TokenType<any>
}

export class OAuth2AuthorizationCodeBuilder implements OAuth2AuthDesignBuilder {

    protected params: OAuth2AuthorizationCodeBuilderArg
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected tokenType?: TokenType<any>
    protected tokenTTL?: number
    protected description?: string
    protected scopes?: Record<string, string>
    protected clientAuthMethods: Record<TokenEndpointAuthMethod, ClientAuthMethod | undefined> = {
        client_secret_basic: undefined,
        client_secret_post: undefined,
        client_secret_jwt: undefined,
        private_key_jwt: undefined,
        none: undefined
    }

    constructor(params: OAuth2AuthorizationCodeBuilderArg) {
        this.params = params
    }

    static create(params?: Partial<OAuth2AuthorizationCodeBuilderArg>): OAuth2AuthorizationCodeBuilder {
        const paramsComplete: OAuth2AuthorizationCodeBuilderArg = {
            authorizationRoute: params && params.authorizationRoute || OAuth2ACAuthorizationRoute.buildDefault(),
            tokenRoute: params && params.tokenRoute || OAuth2ACTokenRoute.buildDefault(),
            ...(params || {})
        };
        return new OAuth2AuthorizationCodeBuilder(paramsComplete)
    }

    build(): OAuth2AuthorizationCode {
        const result = new OAuth2AuthorizationCode(this.params)

        result.setTokenTTL(this.tokenTTL)

        if (typeof this.description !== 'undefined') {
            result.setDescription(this.description)
        }
        if (typeof this.scopes !== 'undefined') {
            result.setScopes(this.scopes)
        }
        if (typeof this.tokenType !== 'undefined') {
            result.setTokenType(this.tokenType)
        }
        for (const method of Object.values(this.clientAuthMethods)) {
            if (method) {
                result.addClientAuthenticationMethod(method)
            }
        }
        return result
    }

    setTokenTTL(ttlSeconds?: number): this {
        this.tokenTTL = ttlSeconds
        return this
    }

    setDescription(description: string): this {
        this.description = description;
        return this;
    }

    setScopes(scopes: Record<string, string>): this {
        this.scopes = scopes;
        return this;
    }

    setTokenType<Refs extends ReqRef = ReqRefDefaults>(value: TokenType<Refs>): this {
        this.tokenType = value
        return this
    }

    addClientAuthenticationMethod(value: 'client_secret_basic' | 'client_secret_post' | 'none' | ClientAuthMethod): this {
        if (value == 'client_secret_basic') {
            this.clientAuthMethods.client_secret_basic = new ClientSecretBasic()
        } else if (value == 'client_secret_post') {
            this.clientAuthMethods.client_secret_post = new ClientSecretPost()
        } else if (value == 'none') {
            this.clientAuthMethods.none = new NoneAuthMethod()
        } else {
            this.clientAuthMethods[value.method] = value
        }
        return this
    }

    strategyName(name: string): this {
        this.params.strategyName = name
        return this
    }

    setJwksKeyStore(keyStore: JwksKeyStore): this {
        this.params.jwksOptions = this.params.jwksOptions || {}
        this.params.jwksOptions.keyStore = keyStore
        return this
    }

    /**
     * 
     * @param ttl seconds
     */
    setPublicKeyExpiry(ttl: number): this {
        this.params.jwksOptions = this.params.jwksOptions || {}
        this.params.jwksOptions.ttl = ttl
        return this
    }

    setJwksRotatorOptions(jwksRotatorOptions: OAuth2JwksOptions['rotation']): this {
        this.params.jwksOptions = this.params.jwksOptions || {}
        this.params.jwksOptions.rotation = jwksRotatorOptions
        return this
    }

    validate<Refs extends ReqRef = ReqRefDefaults>(handler: OAuth2AuthOptions<Refs>['validate']): this {
        this.params.options = { ...(this.params.options || {}), validate: handler }
        return this
    }

    /**
     * Auto-verifies the access token JWT using the configured JWKS before running user validation.
     */
    useAccessTokenJwks(active: boolean): this {
        this.params.options = { ...(this.params.options || {}), useAccessTokenJwks: active }
        return this
    }

    jwksRoute<Refs extends ReqRef = ReqRefDefaults>(handler: (route: DefaultJWKSRoute<Refs>) => void): this {
        this.params.jwksRoute = this.params.jwksRoute || JWKSRoute.buildDefault();
        handler(this.params.jwksRoute)
        return this
    }

    authorizationRoute<
        GetRefs extends ReqRef = ReqRefDefaults,
        PostRefs extends ReqRef = ReqRefDefaults,
    >(handler: (route: DefaultOAuth2ACAuthorizationRoute<GetRefs, PostRefs>) => void): this {
        handler(this.params.authorizationRoute)
        return this
    }

    tokenRoute<Refs extends ReqRef = ReqRefDefaults>(handler: (route: DefaultOAuth2ACTokenRoute<Refs>) => void): this {
        handler(this.params.tokenRoute)
        return this
    }

    refreshTokenRoute<Refs extends ReqRef = ReqRefDefaults>(handler: (route: DefaultOAuth2RefreshTokenRoute<Refs>) => void): this {
        this.params.refreshTokenRoute = this.params.refreshTokenRoute || OAuth2RefreshTokenRoute.buildDefault();
        handler(this.params.refreshTokenRoute)
        return this
    }
}

//#endregion Builder

//#region OIDC builder

export type OIDCAuthorizationCodeBuilderArg = OAuth2AuthorizationCodeBuilderArg & {
    /**
     * Override the configuration served at the discovery endpoint
     */
    openidConfiguration?: Record<string, unknown>
}

export class OIDCAuthorizationCodeBuilder extends OAuth2AuthorizationCodeBuilder {

    protected openidConfiguration: Record<string, unknown> = {}

    constructor(params: OIDCAuthorizationCodeBuilderArg) {
        super(params);
    }

    static create(params?: Partial<OIDCAuthorizationCodeBuilderArg>): OIDCAuthorizationCodeBuilder {
        const paramsComplete: OIDCAuthorizationCodeBuilderArg = {
            authorizationRoute: params && params.authorizationRoute || OAuth2ACAuthorizationRoute.buildDefault(),
            tokenRoute: params && params.tokenRoute || OAuth2ACTokenRoute.buildDefault(),
            ...(params || {})
        };
        return new OIDCAuthorizationCodeBuilder(paramsComplete)
    }

    additionalConfiguration(openidConfiguration: Record<string, unknown>): this {
        this.openidConfiguration = openidConfiguration
        return this
    }

    build(): OIDCAuthorizationCode {

        if (!this.params.jwksRoute) {
            this.params.jwksRoute = JWKSRoute.buildDefault()
        }

        const result = new OIDCAuthorizationCode({ ...this.params, openidConfiguration: this.openidConfiguration })

        result.setTokenTTL(this.tokenTTL)

        if (typeof this.description !== 'undefined') {
            result.setDescription(this.description)
        }
        result.setScopes({
            openid: 'enable OpenID Connect',
            ...(this.scopes || {})
        });
        if (typeof this.tokenType !== 'undefined') {
            result.setTokenType(this.tokenType)
        }
        for (const method of Object.values(this.clientAuthMethods)) {
            if (method) {
                result.addClientAuthenticationMethod(method)
            }
        }
        return result;
    }
}

//#endregion OIDC builder