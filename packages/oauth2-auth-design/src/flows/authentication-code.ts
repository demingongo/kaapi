import {
    KaapiTools,
    RouteOptions
} from '@kaapi/kaapi'
import { ClientAuthentication, GrantType, OAuth2Util } from '@novice1/api-doc-generator'
import Boom from '@hapi/boom'
import Hoek from '@hapi/hoek'
import {
    IOAuth2RefreshTokenRoute,
    OAuth2WithJWKSAuthDesign,
    OAuth2AuthOptions,
    OAuth2Error,
    OAuth2RefreshTokenParams,
    OAuth2ClientAuthentication,
    TokenEndpointAuthMethod
} from './common'
import { createIDToken } from '../utils/jwks-generator'
import { JWKSStore } from '../utils/jwks-store'
import {
    IOAuth2ACAuthorizationRoute,
    OAuth2ACAuthorizationParams
} from './auth-code/authorization-route'
import { IOAuth2ACTokenRoute, OAuth2ACTokenParams } from './auth-code/token-route'
import { TokenTypeValidationResponse } from '../utils/token-types'

//#region OAuth2AuthorizationCode

export interface OAuth2AuthorizationCodeArg {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authorizationRoute: IOAuth2ACAuthorizationRoute<any, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenRoute: IOAuth2ACTokenRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refreshTokenRoute?: IOAuth2RefreshTokenRoute<any>;
    options?: OAuth2AuthOptions;
    strategyName?: string;
    jwksStore?: JWKSStore;
}

export class OAuth2AuthorizationCode extends OAuth2WithJWKSAuthDesign {

    protected strategyName: string
    protected description?: string
    protected scopes?: Record<string, string>
    protected options: OAuth2AuthOptions

    protected pkce: boolean = false

    protected clientAuthenticationMethods = {
        header: false,
        body: false
    }

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
            options,
            strategyName,

            jwksStore
        }: OAuth2AuthorizationCodeArg
    ) {
        super(jwksStore)

        this.authorizationRoute = authorizationRoute
        this.tokenRoute = tokenRoute
        this.refreshTokenRoute = refreshTokenRoute

        this.strategyName = strategyName || 'oauth2-authorization-code'
        this.options = options ? { ...options } : {}
    }

    withPkce(): this {
        this.pkce = true
        return this
    }

    withoutPkce(): this {
        this.pkce = false
        return this
    }

    isWithPkce(): boolean {
        return this.pkce
    }

    addClientAuthenticationMethod(value: OAuth2ClientAuthentication): this {
        if (value == ClientAuthentication.body) {
            this.clientSecretPostAuthenticationMethod()
        } else if (value == ClientAuthentication.header) {
            this.clientSecretBasicAuthenticationMethod()
        } else if (value == 'none') {
            this.withPkce()
        }
        return this
    }

    clientSecretBasicAuthenticationMethod(): this {
        this.clientAuthenticationMethods.header = true
        return this
    }

    clientSecretPostAuthenticationMethod(): this {
        this.clientAuthenticationMethods.body = true
        return this
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

    getTokenEndpointAuthMethods(): TokenEndpointAuthMethod[] {
        const clientAuthenticationMethods = { 
            body: this.clientAuthenticationMethods.body,
            header: this.clientAuthenticationMethods.header,
            none: this.isWithPkce()
        }

        if (!clientAuthenticationMethods.body &&
            !clientAuthenticationMethods.header &&
            !clientAuthenticationMethods.none
        ) {
            clientAuthenticationMethods.header = true
        }

        const result: TokenEndpointAuthMethod[] = []

        if (clientAuthenticationMethods.header) {
            result.push('client_secret_basic')
        }
        if (clientAuthenticationMethods.body) {
            result.push('client_secret_post')
        }
        if (clientAuthenticationMethods.none) {
            result.push('none')
        }

        return result
    }

    /**
     * Returns the schema used for the documentation
     */
    docs() {
        const docs = new OAuth2Util(this.strategyName)
            .setGrantType(this.isWithPkce() ? GrantType.authorizationCodeWithPkce : GrantType.authorizationCode)
            .setScopes(this.getScopes() || {})
            .setAuthUrl(this.authorizationRoute.path)
            .setAccessTokenUrl(this.tokenRoute.path || '');

        const supported = this.getTokenEndpointAuthMethods()

        if (supported.includes('client_secret_post')) {
            docs.setChallengeAlgorithm(ClientAuthentication.body)
        } else if (
            supported.includes('client_secret_basic')
        ) {
            docs.setChallengeAlgorithm(ClientAuthentication.header)
        }

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
        const tokenTypePrefix = this.tokenType
        const tokenTypeInstance = this._tokenType
        t.scheme(this.strategyName, (_server, options) => {

            return {
                async authenticate(request, h) {

                    const settings: OAuth2AuthOptions = Hoek.applyToDefaults({}, options || {});

                    const authorization = request.raw.req.headers.authorization;

                    const authSplit = authorization ? authorization.split(/\s+/) : ['', ''];

                    const tokenType = authSplit[0]
                    let token = authSplit[1]

                    if (tokenType.toLowerCase() !== tokenTypePrefix.toLowerCase()) {
                        token = ''
                        return Boom.unauthorized(null, tokenTypePrefix)
                    }

                    if (!(await tokenTypeInstance.isValid(request, token)).isValid) {
                        return Boom.unauthorized(null, tokenTypePrefix)
                    }

                    if (settings.validate) {
                        try {
                            const result = await settings.validate?.(request, token, h)

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

        const hasOpenIDScope = () => typeof this.getScopes()?.['openid'] != 'undefined'

        const tokenTypeInstance = this._tokenType

        const supported = this.getTokenEndpointAuthMethods()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const routesOptions: RouteOptions<any> = {
            plugins: {
                kaapi: {
                    docs: false
                }
            }
        }

        t
            .route({
                options: routesOptions,
                path: this.authorizationRoute.path,
                method: ['GET', 'POST'],
                handler: async (req, h) => {
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

                        return h.response({ error: 'invalid_request', error_description: errorDescription }).code(400)
                    }
                }
            })
            .route<{
                Payload: { client_id?: unknown, client_secret?: unknown, code_verifier?: unknown, code?: unknown, grant_type?: unknown, redirect_uri?: unknown, refresh_token?: unknown, scope?: unknown }
            }>({
                options: routesOptions,
                path: this.tokenRoute.path,
                method: 'POST',
                handler: async (req, h) => {
                    // validating body
                    let clientId: string | undefined;
                    let clientSecret: string | undefined;

                    if (supported.includes('client_secret_basic')) {
                        const authorization = req.raw.req.headers.authorization;

                        const [authType, base64Credentials] = authorization ? authorization.split(/\s+/) : ['', ''];

                        if (authType.toLowerCase() == 'basic') {
                            const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8').split(':');
                            if (!decoded[0] || !decoded[1]) {
                                return h.response({ error: 'invalid_client', error_description: 'Error in client_secret_basic' }).code(400)
                            } else {
                                clientId = decoded[0];
                                clientSecret = decoded[1];
                            }
                        }
                    }

                    if (!clientId && (supported.includes('client_secret_post') || supported.includes('none'))) {
                        if (req.payload.client_id && typeof req.payload.client_id === 'string') {
                            clientId = req.payload.client_id
                        }
                        if (supported.includes('client_secret_post') && req.payload.client_secret && typeof req.payload.client_secret === 'string') {
                            clientSecret = req.payload.client_secret
                        }
                    }

                    if (!clientSecret && !supported.includes('none')) {
                        return h.response({ error: 'invalid_request', error_description: 'Request was missing the \'client_secret\' parameter.' }).code(400)
                    }

                    if (
                        clientId &&
                        req.payload.code && typeof req.payload.code === 'string' &&
                        req.payload.grant_type === 'authorization_code'
                    ) {

                        const params: OAuth2ACTokenParams = {
                            clientId,
                            grantType: req.payload.grant_type,
                            code: req.payload.code,

                            ttl: this.jwksGenerator.ttl,
                            createIDToken: hasOpenIDScope() ? (async (payload) => {
                                return await createIDToken(this.jwksGenerator, {
                                    aud: clientId,
                                    iss: t.postman?.getHost()[0] || '',
                                    ...payload
                                })
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
                            return h.response({ error: 'invalid_request', error_description: ttR.message || '' }).code(400)
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
                            const params: OAuth2RefreshTokenParams = {
                                clientId,
                                grantType: req.payload.grant_type,
                                refreshToken: `${req.payload.refresh_token}`,

                                ttl: this.jwksGenerator.ttl,
                                createIDToken: hasOpenIDScope() ? (async (payload) => {
                                    return await createIDToken(this.jwksGenerator, {
                                        aud: clientId,
                                        iss: t.postman?.getHost()[0] || '',
                                        ...payload
                                    })
                                }) : undefined
                            }

                            if (clientSecret) {
                                params.clientSecret = clientSecret
                            }

                            if (req.payload.scope && typeof req.payload.scope === 'string') {
                                params.scope = req.payload.scope
                            }

                            return this.refreshTokenRoute.handler(params, req, h)
                        } else {
                            let error: OAuth2Error = 'unauthorized_client';
                            let errorDescription = ''
                            if (!clientId) {
                                error = 'invalid_request'
                                errorDescription = 'Request was missing the \'client_id\' parameter.'
                            } else if (!(req.payload.refresh_token && typeof req.payload.refresh_token === 'string')) {
                                error = 'invalid_request'
                                errorDescription = 'Request was missing the \'refresh_token\' parameter.'
                            }

                            return h.response({ error, error_description: errorDescription }).code(400)
                        }
                    } else {
                        let error: OAuth2Error = 'unauthorized_client';
                        let errorDescription = ''
                        if (req.payload.grant_type != 'authorization_code' || (this.tokenRoute.path == this.refreshTokenRoute?.path &&
                            req.payload.grant_type != 'refresh_token')) {
                            error = 'unsupported_grant_type'
                            errorDescription = `Request does not support the 'grant_type' '${req.payload.grant_type}'.`
                        } else if (!clientId) {
                            error = 'invalid_request'
                            errorDescription = 'Request was missing the \'client_id\' parameter.'
                        } else if (!(req.payload.code && typeof req.payload.code === 'string')) {
                            error = 'invalid_request'
                            errorDescription = 'Request was missing the \'code\' parameter.'
                        }
                        return h.response({ error, error_description: errorDescription }).code(400)
                    }

                }
            })

        // refreshToken
        if (this.refreshTokenRoute?.path && this.refreshTokenRoute.path != this.tokenRoute.path) {
            t.route<{
                Payload: { client_id?: unknown, client_secret?: unknown, grant_type?: unknown, refresh_token?: unknown, scope?: unknown }
            }>({
                options: routesOptions,
                path: this.refreshTokenRoute.path,
                method: 'POST',
                handler: async (req, h) => {
                    // validating body
                    let clientId: string | undefined;
                    let clientSecret: string | undefined;

                    if (supported.includes('client_secret_basic')) {
                        const authorization = req.raw.req.headers.authorization;

                        const [authType, base64Credentials] = authorization ? authorization.split(/\s+/) : ['', ''];

                        if (authType.toLowerCase() == 'basic') {
                            const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8').split(':');
                            if (!decoded[0] || !decoded[1]) {
                                return h.response({ error: 'invalid_client', error_description: 'Error in client_secret_basic' }).code(400)
                            } else {
                                clientId = decoded[0];
                                clientSecret = decoded[1];
                            }
                        }
                    }

                    if (!clientId && (supported.includes('client_secret_post') || supported.includes('none'))) {
                        if (req.payload.client_id && typeof req.payload.client_id === 'string') {
                            clientId = req.payload.client_id
                        }
                        if (supported.includes('client_secret_post') && req.payload.client_secret && typeof req.payload.client_secret === 'string') {
                            clientSecret = req.payload.client_secret
                        }
                    }

                    if (!clientSecret && !supported.includes('none')) {
                        return h.response({ error: 'invalid_request', error_description: 'Request was missing the \'client_secret\' parameter.' }).code(400)
                    }

                    const hasRefreshToken = req.payload.refresh_token && typeof req.payload.refresh_token === 'string'
                    const isRefreshTokenGrantType = req.payload.grant_type === 'refresh_token'
                    if (
                        clientId &&
                        hasRefreshToken &&
                        isRefreshTokenGrantType
                    ) {
                        const params: OAuth2RefreshTokenParams = {
                            clientId,
                            grantType: `${req.payload.grant_type}`,
                            refreshToken: `${req.payload.refresh_token}`,

                            ttl: this.jwksGenerator.ttl,
                            createIDToken: hasOpenIDScope() ? (async (payload) => {
                                return await createIDToken(this.jwksGenerator, {
                                    aud: clientId,
                                    iss: t.postman?.getHost()[0] || '',
                                    ...payload
                                })
                            }) : undefined
                        }

                        if (clientSecret) {
                            params.clientSecret = clientSecret
                        }

                        if (req.payload.scope && typeof req.payload.scope === 'string') {
                            params.scope = req.payload.scope
                        }

                        return this.refreshTokenRoute?.handler(params, req, h)
                    } else {
                        let error: OAuth2Error = 'unauthorized_client';
                        let errorDescription = ''
                        if (req.payload.grant_type != 'refresh_token') {
                            error = 'unsupported_grant_type'
                            errorDescription = `Request does not support the 'grant_type' '${req.payload.grant_type}'.`
                        } else if (!clientId) {
                            error = 'invalid_request'
                            errorDescription = 'Request was missing the \'client_id\' parameter.'
                        } else if (!(req.payload.refresh_token && typeof req.payload.refresh_token === 'string')) {
                            error = 'invalid_request'
                            errorDescription = 'Request was missing the \'refresh_token\' parameter.'
                        }
                        return h.response({ error, error_description: errorDescription }).code(400)
                    }
                }
            })
        }
    }

}

//#endregion OAuth2AuthorizationCode