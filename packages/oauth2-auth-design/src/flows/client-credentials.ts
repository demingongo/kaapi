import {
    KaapiTools,
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit,
    RouteOptions
} from '@kaapi/kaapi'
import { GrantType, OAuth2Util } from '@novice1/api-doc-generator'
import {
    DefaultJWKSRoute,
    JWKSRoute,
    OAuth2AuthDesign,
    OAuth2AuthDesignBuilder,
    OAuth2AuthOptions,
    AnyOAuth2ErrorCodeType,
    OAuth2AuthDesignOptions,
    OAuth2SingleAuthFlow,
    OAuth2JwksOptions,
    OAuth2ErrorCode
} from './common'
import { ClientAuthMethod, ClientSecretBasic, ClientSecretPost, TokenEndpointAuthMethod } from '../utils/client-auth-methods'
import { DefaultOAuth2ClientCredentialsTokenRoute, IOAuth2ClientCredentialsTokenRoute, OAuth2ClientCredentialsTokenParams, OAuth2ClientCredentialsTokenRoute } from './client-creds/token-route'
import { TokenType, TokenTypeValidationResponse } from '../utils/token-types'
import { JwksKeyStore } from '../utils/jwt-authority'
import { createIdToken, createJwtAccessToken } from '../utils/jwt-utils'


//#region OAuth2ClientCredentials

export interface OAuth2ClientCredentialsArg extends OAuth2AuthDesignOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenRoute: IOAuth2ClientCredentialsTokenRoute<any>;
}

export class OAuth2ClientCredentials extends OAuth2AuthDesign implements OAuth2SingleAuthFlow {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected tokenRoute: IOAuth2ClientCredentialsTokenRoute<any>

    get grantType(): GrantType.clientCredentials {
        return GrantType.clientCredentials
    }

    constructor(
        {
            tokenRoute,
            ...props
        }: OAuth2ClientCredentialsArg
    ) {
        super({ ...props, strategyName: props.strategyName || 'oauth2-client-credentials' })

        this.tokenRoute = tokenRoute
    }

    /**
     * NOT IMPLEMENTEND FOR CLIENT CREDENTIALS FLOW
     */
    noneAuthenticationMethod(): this {
        return this
    }

    addClientAuthenticationMethod(value: 'client_secret_basic' | 'client_secret_post' | 'none' | ClientAuthMethod): this {
        if (typeof value === 'string') {
            if (value == 'none') {
                return this
            }
        } else if (value.method == 'none') {
            return this
        }
        return super.addClientAuthenticationMethod(value)
    }

    async handleToken<Refs extends ReqRef = ReqRefDefaults>(
        t: KaapiTools,
        request: Request<Refs>,
        h: ResponseToolkit<Refs>
    ) {

        const supported = this.getTokenEndpointAuthMethods();
        const authMethodsInstances = this.clientAuthMethods;
        const jwtAuthority = this.getJwtAuthority();

        const hasOpenIDScope = () => typeof this.getScopes()?.['openid'] != 'undefined';

        const tokenTypeInstance = this._tokenType;

        const sr: {
            handle: Lifecycle.Method<{
                Payload: {
                    grant_type?: unknown;
                    redirect_uri?: unknown;
                    scope?: unknown;
                };
            }, Lifecycle.ReturnValue<{
                Payload: {
                    grant_type?: unknown;
                    redirect_uri?: unknown;
                    scope?: unknown;
                };
            }>>
        } = {
            handle: async (req, h) => {
                // Grant validation
                const supportedGrants = ['client_credentials']
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

                if (!clientId || !clientSecret) {
                    return h
                        .response({
                            error:  OAuth2ErrorCode.INVALID_REQUEST,
                            error_description: `Supported token endpoint authentication methods: ${supported.join(', ')}`
                        }).code(400)
                }

                // validating body
                if (
                    req.payload.grant_type === 'client_credentials'
                ) {
                    let clientId: string,
                        clientSecret: string,
                        tmpClientId: string | undefined,
                        tmpClientSecret: string | undefined;

                    const authHeaderValue = req.raw.req.headers.authorization
                    if (authHeaderValue) {
                        // remove 'Basic ' and convert the base64 to string
                        const value = Buffer.from(authHeaderValue.substring(5), 'base64').toString();
                        // split client_id and client_secret from string
                        [tmpClientId, tmpClientSecret] = value.split(':')
                    }

                    if (tmpClientId) {
                        clientId = tmpClientId
                    } else {
                        return h.response({ error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Request was missing the \'client_id\' parameter.' }).code(400)
                    }
                    if (tmpClientSecret) {
                        clientSecret = tmpClientSecret
                    } else {
                        return h.response({ error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Request was missing the \'client_secret\' parameter.' }).code(400)
                    }
                    const scope = req.payload.scope && typeof req.payload.scope === 'string' ? req.payload.scope : undefined
                    const params: OAuth2ClientCredentialsTokenParams = {
                        clientId: clientId,
                        clientSecret: clientSecret,
                        grantType: req.payload.grant_type,
                        tokenType: tokenTypeInstance.prefix,
                        ttl: this.tokenTTL,
                        createJwtAccessToken: jwtAuthority ? (async (payload) => {
                            return await createJwtAccessToken(jwtAuthority, {
                                aud: t.postman?.getHost()[0] || '',
                                iss: t.postman?.getHost()[0] || '',
                                sub: clientId,
                                scope,
                                ...payload
                            }, this.tokenTTL)
                        }) : undefined,
                        createIdToken: jwtAuthority && hasOpenIDScope() ? (async (payload) => {
                            return await createIdToken(jwtAuthority, {
                                aud: clientId,
                                iss: t.postman?.getHost()[0] || '',
                                ...payload
                            }, this.tokenTTL)
                        }) : undefined
                    }
                    if (scope) {
                        params.scope = scope
                    }

                    const ttR: TokenTypeValidationResponse = tokenTypeInstance.isValidTokenRequest ? (await tokenTypeInstance.isValidTokenRequest(req)) : { isValid: true }
                    if (!ttR.isValid) {
                        return h.response({ error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: ttR.message || '' }).code(400)
                    }

                    return this.tokenRoute.handler(params, req, h)
                } else {
                    let error: AnyOAuth2ErrorCodeType =  OAuth2ErrorCode.UNAUTHORIZED_CLIENT;
                    let errorDescription = ''
                    if (!clientId) {
                        error =  OAuth2ErrorCode.INVALID_REQUEST
                        errorDescription = 'Request was missing the \'client_id\' parameter.'
                    } else if (!clientSecret) {
                        error =  OAuth2ErrorCode.INVALID_REQUEST
                        errorDescription = 'Request was missing the \'client_secret\' parameter.'
                    }
                    return h.response({ error, error_description: errorDescription }).code(400)
                }

            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return sr.handle(request as Request<any>, h as ResponseToolkit<any>)
    }

    /**
     * Returns the schema used for the documentation
     */
    docs() {
        const docs = new OAuth2Util(this.strategyName)
            .setGrantType(GrantType.clientCredentials)
            .setScopes(this.getScopes() || {})
            .setAccessTokenUrl(this.tokenRoute.path || '');

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
        }

        // token
        t
            .route({
                options: routesOptions,
                path: this.tokenRoute.path,
                method: 'POST',
                handler: async (req, h) => {
                    if (req.payload.grant_type === this.grantType) {
                        return await this.handleToken(t, req, h)
                    }
                    return h.response({ error: OAuth2ErrorCode.UNSUPPORTED_GRANT_TYPE, error_description: `Request does not support the 'grant_type' '${req.payload.grant_type}'.` }).code(400)
                }
            })

        // jwks
        this.createJwksEndpoint(t)
    }

}

export type OIDCClientCredentialsArg = OAuth2ClientCredentialsArg & {
    /**
     * Override the configuration served at the discovery endpoint
     */
    openidConfiguration?: Record<string, unknown>
}

export class OIDCClientCredentials extends OAuth2ClientCredentials implements OAuth2SingleAuthFlow {
    protected openidConfiguration: Record<string, unknown> = {}

    constructor(params: OIDCClientCredentialsArg) {
        super(params);

        if (params.openidConfiguration)
            this.openidConfiguration = params.openidConfiguration
    }

    getDiscoveryConfiguration(t: KaapiTools) {
        const supported = this.getTokenEndpointAuthMethods();
        const host = t.postman?.getHost()[0] || '';
        const scopes = this.getScopes() || {};

        const wellKnownOpenIDConfig: Record<string, string | string[] | undefined> = {
            issuer: host,
            token_endpoint: `${host}${this.tokenRoute.path}`,
            jwks_uri: this.jwksRoute?.path ? `${host}${this.jwksRoute.path}` : undefined,
            claims_supported: [
                'aud',
                'exp',
                'iat',
                'iss',
                'sub'
            ],
            grant_types_supported: [
                'client_credentials'
            ],
            response_types_supported: [
                'token'
            ],
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

        return { ...wellKnownOpenIDConfig, ...this.openidConfiguration }
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

//#endregion OAuth2ClientCredentials

//#region Builder

export interface OAuth2ClientCredentialsBuilderArg extends OAuth2ClientCredentialsArg {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenRoute: DefaultOAuth2ClientCredentialsTokenRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwksRoute?: DefaultJWKSRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenType?: TokenType<any>
}

export class OAuth2ClientCredentialsBuilder implements OAuth2AuthDesignBuilder {

    protected params: OAuth2ClientCredentialsBuilderArg
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

    constructor(params: OAuth2ClientCredentialsBuilderArg) {
        this.params = params
    }

    static create(params?: Partial<OAuth2ClientCredentialsBuilderArg>): OAuth2ClientCredentialsBuilder {
        const paramsComplete: OAuth2ClientCredentialsBuilderArg = {
            tokenRoute: params && params.tokenRoute || OAuth2ClientCredentialsTokenRoute.buildDefault(),
            ...(params || {})
        };
        return new OAuth2ClientCredentialsBuilder(paramsComplete)
    }

    build(): OAuth2ClientCredentials {
        const result = new OAuth2ClientCredentials(this.params)

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

    addClientAuthenticationMethod(value: 'client_secret_basic' | 'client_secret_post' | ClientAuthMethod): this {
        if (value == 'client_secret_basic') {
            this.clientAuthMethods.client_secret_basic = new ClientSecretBasic()
        } else if (value == 'client_secret_post') {
            this.clientAuthMethods.client_secret_post = new ClientSecretPost()
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

    tokenRoute<Refs extends ReqRef = ReqRefDefaults>(handler: (route: DefaultOAuth2ClientCredentialsTokenRoute<Refs>) => void): this {
        handler(this.params.tokenRoute)
        return this
    }
}

//#endregion Builder

//#region OIDC builder

export type OIDCClientCredentialsBuilderArg = OAuth2ClientCredentialsBuilderArg & {
    /**
     * Override the configuration served at the discovery endpoint
     */
    openidConfiguration?: Record<string, unknown>
}

export class OIDCClientCredentialsBuilder extends OAuth2ClientCredentialsBuilder {

    protected openidConfiguration: Record<string, unknown> = {}

    constructor(params: OIDCClientCredentialsBuilderArg) {
        super(params);
    }

    static create(params?: Partial<OIDCClientCredentialsBuilderArg>): OIDCClientCredentialsBuilder {
        const paramsComplete: OIDCClientCredentialsBuilderArg = {
            tokenRoute: params && params.tokenRoute || OAuth2ClientCredentialsTokenRoute.buildDefault(),
            ...(params || {})
        };
        return new OIDCClientCredentialsBuilder(paramsComplete)
    }

    additionalConfiguration(openidConfiguration: Record<string, unknown>): this {
        this.openidConfiguration = openidConfiguration
        return this
    }

    build(): OIDCClientCredentials {

        if (!this.params.jwksRoute) {
            this.params.jwksRoute = JWKSRoute.buildDefault()
        }

        const result = new OIDCClientCredentials({ ...this.params, openidConfiguration: this.openidConfiguration })

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