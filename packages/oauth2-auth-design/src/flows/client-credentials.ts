import {
    KaapiTools,
    ReqRef,
    ReqRefDefaults,
    Request,
    RouteOptions
} from '@kaapi/kaapi'
import { GrantType, OAuth2Util } from '@novice1/api-doc-generator'
import Boom from '@hapi/boom'
import Hoek from '@hapi/hoek'
import {
    DefaultJWKSRoute,
    IJWKSRoute,
    IOAuth2RefreshTokenRoute,
    JWKSRoute,
    OAuth2AuthDesign,
    OAuth2AuthOptions,
    OAuth2Error,
    OAuth2RefreshTokenHandler,
    OAuth2RefreshTokenParams,
    OAuth2RefreshTokenRoute
} from './common'
import { ClientAuthMethod, ClientSecretBasic, ClientSecretPost, TokenEndpointAuthMethod } from '../utils/client-auth-methods'
import { DefaultOAuth2ClientCredentialsTokenRoute, IOAuth2ClientCredentialsTokenRoute, OAuth2ClientCredentialsTokenParams, OAuth2ClientCredentialsTokenRoute } from './client-creds/token-route'
import { TokenType } from '../utils/token-types'
import { JWKS, JWKSStore } from '../utils/jwks-store'
import { createIdToken, createJwtAccessToken, JWKSGenerator } from '../utils/jwks-generator'
import { getInMemoryJWKSStore } from '../utils/in-memory-jwks-store'
import { JWTPayload } from 'jose'

//#region OAuth2ClientCredentials

export interface OAuth2ClientCredentialsArg {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenRoute: IOAuth2ClientCredentialsTokenRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refreshTokenRoute?: OAuth2RefreshTokenRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwksRoute?: IJWKSRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: OAuth2AuthOptions<any>;
    strategyName?: string;
    jwksStore?: JWKSStore;
}

export class OAuth2ClientCredentials extends OAuth2AuthDesign {

    protected strategyName: string
    protected description?: string
    protected scopes?: Record<string, string>
    protected options: OAuth2AuthOptions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected tokenRoute: IOAuth2ClientCredentialsTokenRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected refreshTokenRoute?: IOAuth2RefreshTokenRoute<any>

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected jwksRoute?: IJWKSRoute<any>;
    protected jwksStore?: JWKSStore;
    protected jwksGenerator?: JWKSGenerator | undefined;
    protected tokenTTL?: number;

    constructor(
        {
            tokenRoute,
            refreshTokenRoute,
            options,
            strategyName,
            jwksStore,
            jwksRoute
        }: OAuth2ClientCredentialsArg
    ) {
        super()

        this.jwksStore = jwksStore

        this.tokenRoute = tokenRoute
        this.refreshTokenRoute = refreshTokenRoute
        this.jwksRoute = jwksRoute

        this.strategyName = strategyName || 'oauth2-client-credentials'
        this.options = options ? { ...options } : {}
    }

    setTokenTTL(ttlSeconds?: number): this {
        this.tokenTTL = ttlSeconds
        return this
    }

    getTokenTTL(): number | undefined {
        return this.tokenTTL
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

    setDescription(description: string): this {
        this.description = description;
        return this;
    }

    /**
     * 
     * @param scopes The scopes of the access request.
     * A map between the scope name and a short description for it. The map MAY be empty.
     * @returns 
     */
    setScopes(scopes: Record<string, string>): this {
        this.scopes = scopes;
        return this;
    }

    getScopes(): Record<string, string> | undefined {
        return this.scopes
    }

    getStrategyName(): string {
        return this.strategyName;
    }

    getDescription(): string | undefined {
        return this.description;
    }

    private _getJwksGenerator() {
        if(this.jwksGenerator) return this.jwksGenerator;
        if (this.jwksRoute || this.jwksStore || this.options.useAccessTokenJwks){
            this.jwksGenerator = new JWKSGenerator(this.jwksStore || getInMemoryJWKSStore(), this.tokenTTL)
        }
        return this.jwksGenerator
    }

    /**
     * Returns the schema used for the documentation
     */
    docs() {
        const docs = new OAuth2Util(this.strategyName)
            .setGrantType(GrantType.clientCredentials)
            .setScopes(this.getScopes() || {})
            .setAccessTokenUrl(this.tokenRoute.path || '');

        if (this.refreshTokenRoute?.path) {
            docs.setRefreshUrl(this.refreshTokenRoute.path)
        }

        if (this.description) {
            docs.setDescription(this.description)
        }

        return docs
    }

    /**
     * Where authentication schemes and strategies are registered.
     */
    integrateStrategy(t: KaapiTools) {
        const tokenTypePrefix = this.tokenType;
        const tokenTypeInstance = this._tokenType;
        const getJwksGenerator = () => this._getJwksGenerator();

        t.scheme(this.strategyName, (_server, options) => {

            return {
                async authenticate(request, h) {

                    const settings: OAuth2AuthOptions = Hoek.applyToDefaults({}, options || {});

                    const authorization = request.raw.req.headers.authorization;

                    const authSplit = authorization ? authorization.split(/\s+/) : ['', ''];

                    const tokenType = authSplit[0]
                    let token = authSplit[1]
                    let jwtAccessTokenPayload: JWTPayload | undefined;

                    if (tokenType.toLowerCase() !== tokenTypePrefix.toLowerCase()) {
                        token = ''
                        return Boom.unauthorized(null, tokenTypePrefix)
                    }

                    if (!(await tokenTypeInstance.isValid(request, token)).isValid) {
                        return Boom.unauthorized(null, tokenTypePrefix)
                    }

                    const jwksGenerator = getJwksGenerator()

                    if (jwksGenerator && settings.useAccessTokenJwks) {
                        try {
                            jwtAccessTokenPayload = await jwksGenerator.verify(token)
                        } catch(err) {
                            t.log.error(err)
                            return Boom.unauthorized(null, tokenTypePrefix)
                        }
                    }

                    if (settings.validate) {
                        try {
                            const result = await settings.validate?.(request, { token, jwtAccessTokenPayload }, h)

                            if (result && 'isAuth' in result) {
                                return result
                            }

                            if (result && 'isBoom' in result) {
                                return result
                            }

                            if (result) {
                                const { isValid, credentials, artifacts, message } = result;

                                if (isValid && credentials) {
                                    return h.authenticated({ credentials, artifacts })
                                }

                                if (message) {
                                    return h.unauthenticated(Boom.unauthorized(message, tokenTypePrefix), {
                                        credentials: credentials || {},
                                        artifacts
                                    })
                                }
                            }
                        } catch (err) {
                            return Boom.internal(err instanceof Error ? err : `${err}`)
                        }
                    }

                    return Boom.unauthorized(null, tokenTypePrefix)
                },
            }
        })
        t.strategy(this.strategyName, this.strategyName, this.options)
    }

    integrateHook(t: KaapiTools) {

        const supported = this.getTokenEndpointAuthMethods();
        const authMethodsInstances = this.clientAuthMethods;
        const jwksGenerator = this._getJwksGenerator();

        const hasOpenIDScope = () => typeof this.getScopes()?.['openid'] != 'undefined';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const routesOptions: RouteOptions<any> = {
            plugins: {
                kaapi: {
                    docs: false
                }
            }
        }

        t
            .route<{
                Payload: { grant_type?: unknown, redirect_uri?: unknown, refresh_token?: unknown, scope?: unknown }
            }>({
                options: routesOptions,
                path: this.tokenRoute.path,
                method: 'POST',
                handler: async (req, h) => {
                    // Grant validation
                    const supportedGrants = ['client_credentials']
                    if (this.tokenRoute.path == this.refreshTokenRoute?.path) {
                        supportedGrants.push('refresh_token')
                    }
                    if (!(typeof req.payload.grant_type === 'string' && supportedGrants.includes(req.payload.grant_type))) {
                        return h.response({ error: 'unsupported_grant_type', error_description: `Request does not support the 'grant_type' '${req.payload.grant_type}'.` }).code(400)
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
                                error: 'invalid_request',
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
                            return h.response({ error: 'invalid_request', error_description: 'Request was missing the \'client_id\' parameter.' }).code(400)
                        }
                        if (tmpClientSecret) {
                            clientSecret = tmpClientSecret
                        } else {
                            return h.response({ error: 'invalid_request', error_description: 'Request was missing the \'client_secret\' parameter.' }).code(400)
                        }
                        const scope = req.payload.scope && typeof req.payload.scope === 'string' ? req.payload.scope : undefined
                        const params: OAuth2ClientCredentialsTokenParams = {
                            clientId: clientId,
                            clientSecret: clientSecret,
                            grantType: req.payload.grant_type,
                            ttl: jwksGenerator?.ttl || this.tokenTTL,
                            createJwtAccessToken: jwksGenerator ? (async (payload) => {
                                return await createJwtAccessToken(jwksGenerator, {
                                    aud: t.postman?.getHost()[0] || '',
                                    iss: t.postman?.getHost()[0] || '',
                                    sub: clientId,
                                    scope,
                                    ...payload
                                })
                            }) : undefined,
                            createIdToken: jwksGenerator && hasOpenIDScope() ? (async (payload) => {
                                return await createIdToken(jwksGenerator, {
                                    aud: clientId,
                                    iss: t.postman?.getHost()[0] || '',
                                    ...payload
                                })
                            }) : undefined
                        }
                        if (scope) {
                            params.scope = scope
                        }

                        return this.tokenRoute.handler(params, req, h)
                    } else if (
                        this.tokenRoute.path == this.refreshTokenRoute?.path &&
                        req.payload.grant_type === 'refresh_token'
                    ) {
                        const hasRefreshToken = req.payload.refresh_token && typeof req.payload.refresh_token === 'string'
                        if (
                            clientId &&
                            hasRefreshToken
                        ) {
                            const scope = req.payload.scope && typeof req.payload.scope === 'string' ? req.payload.scope : undefined
                            const params: OAuth2RefreshTokenParams = {
                                clientId,
                                grantType: req.payload.grant_type,
                                refreshToken: `${req.payload.refresh_token}`,
                                ttl: jwksGenerator?.ttl || this.tokenTTL,
                                createJwtAccessToken: jwksGenerator ? (async (payload) => {
                                    return await createJwtAccessToken(jwksGenerator, {
                                        aud: t.postman?.getHost()[0] || '',
                                        iss: t.postman?.getHost()[0] || '',
                                        sub: clientId,
                                        scope,
                                        ...payload
                                    })
                                }) : undefined,
                                createIdToken: jwksGenerator && hasOpenIDScope() ? (async (payload) => {
                                    return await createIdToken(jwksGenerator, {
                                        aud: clientId,
                                        iss: t.postman?.getHost()[0] || '',
                                        ...payload
                                    })
                                }) : undefined
                            }

                            if (clientSecret) {
                                params.clientSecret = clientSecret
                            }

                            if (scope) {
                                params.scope = scope
                            }

                            return this.refreshTokenRoute.handler(params, req, h)
                        } else {
                            let error: OAuth2Error = 'unauthorized_client';
                            let errorDescription = ''
                            if (!clientId) {
                                error = 'invalid_request'
                                errorDescription = 'Request was missing the \'client_id\' parameter.'
                            } else if (!clientSecret) {
                                error = 'invalid_request'
                                errorDescription = 'Request was missing the \'client_secret\' parameter.'
                            } else if (!(req.payload.refresh_token && typeof req.payload.refresh_token === 'string')) {
                                error = 'invalid_request'
                                errorDescription = 'Request was missing the \'refresh_token\' parameter.'
                            }

                            return h.response({ error, error_description: errorDescription }).code(400)
                        }
                    } else {
                        let error: OAuth2Error = 'unauthorized_client';
                        let errorDescription = ''
                        if (!clientId) {
                            error = 'invalid_request'
                            errorDescription = 'Request was missing the \'client_id\' parameter.'
                        } else if (!clientSecret) {
                            error = 'invalid_request'
                            errorDescription = 'Request was missing the \'client_secret\' parameter.'
                        }
                        return h.response({ error, error_description: errorDescription }).code(400)
                    }

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
                    // Grant validation
                    const supportedGrants = ['refresh_token']
                    if (!(typeof req.payload.grant_type === 'string' && supportedGrants.includes(req.payload.grant_type))) {
                        return h.response({ error: 'unsupported_grant_type', error_description: `Request does not support the 'grant_type' '${req.payload.grant_type}'.` }).code(400)
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
                                error: 'invalid_request',
                                error_description: `Supported token endpoint authentication methods: ${supported.join(', ')}`
                            }).code(400)
                    }
                    // validating body
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
                            refreshToken: `${req.payload.refresh_token}`,
                            ttl: jwksGenerator?.ttl || this.tokenTTL,
                            createJwtAccessToken: jwksGenerator ? (async (payload) => {
                                return await createJwtAccessToken(jwksGenerator, {
                                    aud: t.postman?.getHost()[0] || '',
                                    iss: t.postman?.getHost()[0] || '',
                                    sub: clientId,
                                    scope,
                                    ...payload
                                })
                            }) : undefined,
                            createIdToken: jwksGenerator && hasOpenIDScope() ? (async (payload) => {
                                return await createIdToken(jwksGenerator, {
                                    aud: clientId,
                                    iss: t.postman?.getHost()[0] || '',
                                    ...payload
                                })
                            }) : undefined
                        }

                        if (scope) {
                            params.scope = scope
                        }

                        return this.refreshTokenRoute?.handler(params, req, h)
                    } else {
                        let error: OAuth2Error = 'unauthorized_client';
                        let errorDescription = ''
                        if (!clientId) {
                            error = 'invalid_request'
                            errorDescription = 'Request was missing the \'client_id\' parameter.'
                        } else if (!clientSecret) {
                            error = 'invalid_request'
                            errorDescription = 'Request was missing the \'client_secret\' parameter.'
                        } else if (!(req.payload.refresh_token && typeof req.payload.refresh_token === 'string')) {
                            error = 'invalid_request'
                            errorDescription = 'Request was missing the \'refresh_token\' parameter.'
                        }
                        return h.response({ error, error_description: errorDescription }).code(400)
                    }
                }
            })
        }

        // jwks
        if (this.jwksRoute && jwksGenerator) {
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

                    const jwks = await jwksGenerator.generateIfEmpty() as JWKS

                    if (this.jwksRoute?.handler) {
                        return this.jwksRoute.handler({
                            jwks
                        }, req, h)
                    }

                    return jwks
                }
            })
        }
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

export class OAuth2ClientCredentialsBuilder {

    #params: OAuth2ClientCredentialsBuilderArg

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

    constructor(params: OAuth2ClientCredentialsBuilderArg) {
        this.#params = params
    }

    static create(params?: Partial<OAuth2ClientCredentialsBuilderArg>): OAuth2ClientCredentialsBuilder {
        const paramsComplete: OAuth2ClientCredentialsBuilderArg = {
            tokenRoute: params && params.tokenRoute || OAuth2ClientCredentialsTokenRoute.buildDefault(),
            ...(params || {})
        };
        return new OAuth2ClientCredentialsBuilder(paramsComplete)
    }

    build(): OAuth2ClientCredentials {
        const result = new OAuth2ClientCredentials(this.#params)

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

    addClientAuthenticationMethod(value: 'client_secret_basic' | 'client_secret_post' | ClientAuthMethod): this {
        if (value == 'client_secret_basic') {
            this.#clientAuthMethods.client_secret_basic = new ClientSecretBasic()
        } else if (value == 'client_secret_post') {
            this.#clientAuthMethods.client_secret_post = new ClientSecretPost()
        } else {
            this.#clientAuthMethods[value.method] = value
        }
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
        this.#params.options = { ...(this.#params.options || {}), validate: handler }
        return this
    }

    /**
     * Auto-verifies the access token JWT using the configured JWKS before running user validation.
     */
    useAccessTokenJwks(active: boolean): this {
        this.#params.options = { ...(this.#params.options || {}), useAccessTokenJwks: active }
        return this
    }

    jwksRoute<Refs extends ReqRef = ReqRefDefaults>(handler: (route: DefaultJWKSRoute<Refs>) => void): this {
        this.#params.jwksRoute = this.#params.jwksRoute || JWKSRoute.buildDefault();
        handler(this.#params.jwksRoute)
        return this
    }

    tokenRoute<Refs extends ReqRef = ReqRefDefaults>(handler: (route: DefaultOAuth2ClientCredentialsTokenRoute<Refs>) => void): this {
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