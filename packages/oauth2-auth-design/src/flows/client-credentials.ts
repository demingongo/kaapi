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
import Boom from '@hapi/boom'
import Hoek from '@hapi/hoek'
import {
    IOAuth2RefreshTokenRoute,
    OAuth2AuthDesign,
    OAuth2AuthOptions,
    OAuth2Error,
    OAuth2RefreshTokenParams,
    OAuth2RefreshTokenRoute
} from './common'
import { ClientAuthMethod } from '../utils/client-auth-methods'

//#region TokenRoute

export interface OAuth2ClientCredsTokenParams {
    grantType: string
    clientId: string
    clientSecret: string
    scope?: string
}

export type OAuth2ClientCredsTokenHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: OAuth2ClientCredsTokenParams, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IOAuth2ClientCredsTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> {
    path: string,
    handler: OAuth2ClientCredsTokenHandler<Refs>
}

//#endregion TokenRoute

//#region OAuth2ClientCreds

export interface OAuth2ClientCredsArg {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenRoute: IOAuth2ClientCredsTokenRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refreshTokenRoute?: OAuth2RefreshTokenRoute<any>;
    options?: OAuth2AuthOptions;
    strategyName?: string;
}

export class OAuth2ClientCreds extends OAuth2AuthDesign {

    protected strategyName: string
    protected description?: string
    protected scopes?: Record<string, string>
    protected options: OAuth2AuthOptions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected tokenRoute: IOAuth2ClientCredsTokenRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected refreshTokenRoute?: IOAuth2RefreshTokenRoute<any>

    constructor(
        {
            tokenRoute,
            refreshTokenRoute,
            options,
            strategyName
        }: OAuth2ClientCredsArg
    ) {
        super()

        this.tokenRoute = tokenRoute
        this.refreshTokenRoute = refreshTokenRoute

        this.strategyName = strategyName || 'oauth2-client-credentials'
        this.options = options ? { ...options } : {}
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

        const supported = this.getTokenEndpointAuthMethods()
        const authMethodsInstances = this.clientAuthMethods

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
                Payload: { code_verifier?: unknown, code?: unknown, grant_type?: unknown, redirect_uri?: unknown, refresh_token?: unknown, scope?: unknown }
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
                        const params: OAuth2ClientCredsTokenParams = {
                            clientId: clientId,
                            clientSecret: clientSecret,
                            grantType: req.payload.grant_type
                        }
                        if (req.payload.scope && typeof req.payload.scope === 'string') {
                            params.scope = req.payload.scope
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
                                refreshToken: `${req.payload.refresh_token}`
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
                        const params: OAuth2RefreshTokenParams = {
                            clientId,
                            clientSecret,
                            grantType: `${req.payload.grant_type}`,
                            refreshToken: `${req.payload.refresh_token}`
                        }

                        if (req.payload.scope && typeof req.payload.scope === 'string') {
                            params.scope = req.payload.scope
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
    }

}

//#endregion OAuth2ClientCreds