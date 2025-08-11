import {
    AuthDesign,
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
    OAuth2AuthOptions, 
    OAuth2Error, 
    OAuth2RefreshTokenParams, 
    OAuth2RefreshTokenRoute 
} from './common'

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

export class OAuth2ClientCreds extends AuthDesign {

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
        t.scheme(this.strategyName, (_server, options) => {

            return {
                async authenticate(request, h) {

                    const settings: OAuth2AuthOptions = Hoek.applyToDefaults({}, options || {});

                    const authorization = request.raw.req.headers.authorization;

                    const authSplit = authorization ? authorization.split(/\s+/) : ['', ''];

                    const tokenType = authSplit[0]
                    let token = authSplit[1]

                    if (tokenType.toLowerCase() !== 'bearer') {
                        token = ''
                        return Boom.unauthorized(null, 'Bearer')
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
                                    return h.unauthenticated(Boom.unauthorized(message, 'Bearer'), {
                                        credentials: credentials || {},
                                        artifacts
                                    })
                                }
                            }
                        } catch (err) {
                            return Boom.internal(err instanceof Error ? err : `${err}`)
                        }
                    }

                    return Boom.unauthorized(null, 'Bearer')
                },
            }
        })
        t.strategy(this.strategyName, this.strategyName, this.options)
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

        t
            .route<{
                Payload: { client_id?: unknown, client_secret?: unknown, code_verifier?: unknown, code?: unknown, grant_type?: unknown, redirect_uri?: unknown, refresh_token?: unknown, scope?: unknown }
            }>({
                options: routesOptions,
                path: this.tokenRoute.path,
                method: 'POST',
                handler: async (req, h) => {
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
                        const hasClientId = req.payload.client_id && typeof req.payload.client_id === 'string'
                        const hasClientSecret = req.payload.client_secret && typeof req.payload.client_secret === 'string'
                        const hasRefreshToken = req.payload.refresh_token && typeof req.payload.refresh_token === 'string'
                        if (
                            hasClientId &&
                            hasRefreshToken
                        ) {
                            const params: OAuth2RefreshTokenParams = {
                                clientId: `${req.payload.client_id}`,
                                grantType: req.payload.grant_type,
                                refreshToken: `${req.payload.refresh_token}`
                            }

                            if (hasClientSecret) {
                                params.clientSecret = `${req.payload.client_secret}`
                            }

                            if (req.payload.scope && typeof req.payload.scope === 'string') {
                                params.scope = req.payload.scope
                            }

                            return this.refreshTokenRoute.handler(params, req, h)
                        } else {
                            let error: OAuth2Error = 'unauthorized_client';
                            let errorDescription = ''
                            if (!(req.payload.client_id && typeof req.payload.client_id === 'string')) {
                                error = 'invalid_request'
                                errorDescription = 'Request was missing the \'client_id\' parameter.'
                            } else if (!(req.payload.client_secret && typeof req.payload.client_secret === 'string')) {
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
                        if (req.payload.grant_type != 'authorization_code' || (this.tokenRoute.path == this.refreshTokenRoute?.path &&
                            req.payload.grant_type != 'refresh_token')) {
                            error = 'unsupported_grant_type'
                            errorDescription = `Request does not support the 'grant_type' '${req.payload.grant_type}'.`
                        } else if (!(req.payload.client_id && typeof req.payload.client_id === 'string')) {
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
                    const hasClientId = req.payload.client_id && typeof req.payload.client_id === 'string'
                    const hasClientSecret = req.payload.client_secret && typeof req.payload.client_secret === 'string'
                    const hasRefreshToken = req.payload.refresh_token && typeof req.payload.refresh_token === 'string'
                    const isRefreshTokenGrantType = req.payload.grant_type === 'refresh_token'
                    if (
                        hasClientId &&
                        hasRefreshToken &&
                        isRefreshTokenGrantType
                    ) {
                        const params: OAuth2RefreshTokenParams = {
                            clientId: `${req.payload.client_id}`,
                            grantType: `${req.payload.grant_type}`,
                            refreshToken: `${req.payload.refresh_token}`
                        }

                        if (hasClientSecret) {
                            params.clientSecret = `${req.payload.client_secret}`
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
                        } else if (!(req.payload.client_id && typeof req.payload.client_id === 'string')) {
                            error = 'invalid_request'
                            errorDescription = 'Request was missing the \'client_id\' parameter.'
                        } else if (!(req.payload.client_secret && typeof req.payload.client_secret === 'string')) {
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