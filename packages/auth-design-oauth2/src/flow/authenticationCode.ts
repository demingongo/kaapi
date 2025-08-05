import {
    Auth,
    AuthCredentials,
    KaapiPlugin,
    KaapiTools,
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit,
    RouteOptions,
    ServerAuthScheme,
} from '@kaapi/kaapi'
import { GrantType, OAuth2Util } from '@novice1/api-doc-generator'
import Boom from '@hapi/boom'
import Hoek from '@hapi/hoek'

//#region Types

export type OAuth2Error = 'invalid_request' | 'invalid_client' | 'invalid_grant' | 'invalid_scope' | 'unauthorized_client' | 'unsupported_grant_type' | 'invalid_token'

export type OAuth2AuthOptions = {
    tokenType?: string;
    validate?<
        Refs extends ReqRef = ReqRefDefaults
    >(request: Request<Refs>, token: string, h: ResponseToolkit<Refs>): Promise<{
        isValid?: boolean;
        artifacts?: unknown;
        credentials?: AuthCredentials;
        message?: string;
        scheme?: string;
    } | Auth>;
};

//#endregion Types

//#region AuthorizationRoute

export interface OAuth2ACAuthorizationParams {
    clientId: string
    responseType: string
    redirectUri: string
    scope?: string
    state?: string
    codeChallenge?: string
}

export type OAuth2ACAuthorizationHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: OAuth2ACAuthorizationParams, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IOAuth2ACAuthorizationRoute<
    GetRefs extends ReqRef = ReqRefDefaults,
    PostRefs extends ReqRef = ReqRefDefaults,
> {
    path: string,
    handler: OAuth2ACAuthorizationHandler<GetRefs>
    postHandler: OAuth2ACAuthorizationHandler<PostRefs>
}

export class OAuth2ACAuthorizationRoute<
    GetRefs extends ReqRef = ReqRefDefaults,
    PostRefs extends ReqRef = ReqRefDefaults,
> implements IOAuth2ACAuthorizationRoute<GetRefs, PostRefs> {
    protected _path: string;
    protected _handler: OAuth2ACAuthorizationHandler<GetRefs>
    protected _postHandler: OAuth2ACAuthorizationHandler<PostRefs>

    get path() {
        return this._path
    }

    get handler() {
        return this._handler
    }

    get postHandler() {
        return this._postHandler
    }

    constructor(
        path: string,
        handler: OAuth2ACAuthorizationHandler<GetRefs>,
        postHandler: OAuth2ACAuthorizationHandler<PostRefs>
    ) {
        this._path = path;
        this._handler = handler;
        this._postHandler = postHandler;
    }
}

//#endregion AuthorizationRoute

//#region TokenRoute

export interface OAuth2ACTokenParams {
    grantType: string
    code: string
    clientId: string
    clientSecret?: string
    codeVerifier?: string
    redirectUri?: string
}

export type OAuth2ACTokenHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: OAuth2ACTokenParams, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IOAuth2ACTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> {
    path: string,
    handler: OAuth2ACTokenHandler<Refs>
}

export class OAuth2ACTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> implements IOAuth2ACTokenRoute<Refs> {
    protected _path: string;
    protected _handler: OAuth2ACTokenHandler<Refs>

    get path() {
        return this._path
    }

    get handler() {
        return this._handler
    }

    constructor(
        path: string,
        handler: OAuth2ACTokenHandler<Refs>
    ) {
        this._path = path;
        this._handler = handler;
    }
}

//#endregion TokenRoute

//#region RefreshTokenRoute

export interface OAuth2ACRefreshTokenParams {
    grantType: string
    refreshToken: string
    clientId: string
    clientSecret?: string
    scope?: string
}

export type OAuth2ACRefreshTokenHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: OAuth2ACRefreshTokenParams, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IOAuth2ACRefreshTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> {
    path: string,
    handler: OAuth2ACRefreshTokenHandler<Refs>
}

export class OAuth2ACRefreshTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> implements IOAuth2ACRefreshTokenRoute<Refs> {
    protected _path: string;
    protected _handler: OAuth2ACRefreshTokenHandler<Refs>

    get path() {
        return this._path
    }

    get handler() {
        return this._handler
    }

    constructor(
        path: string,
        handler: OAuth2ACRefreshTokenHandler<Refs>
    ) {
        this._path = path;
        this._handler = handler;
    }
}

//#endregion RefreshTokenRoute

//#region AuthDesignOAuth2

export interface AuthDesignOAuth2Arg {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authorizationRoute: OAuth2ACAuthorizationRoute<any, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenRoute: OAuth2ACTokenRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refreshTokenRoute?: OAuth2ACRefreshTokenRoute<any>;
    options?: OAuth2AuthOptions;
    securitySchemeName?: string;
}

export class AuthorizationCodeOAuth2 implements KaapiPlugin {

    protected securitySchemeName: string
    protected description?: string
    protected scopes?: Record<string, string>
    protected options: OAuth2AuthOptions

    protected pkce: boolean = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected authorizationRoute: IOAuth2ACAuthorizationRoute<any, any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected tokenRoute: IOAuth2ACTokenRoute<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected refreshTokenRoute?: IOAuth2ACRefreshTokenRoute<any>

    constructor(
        {
            authorizationRoute,
            tokenRoute,
            refreshTokenRoute,
            options,
            securitySchemeName
        }: AuthDesignOAuth2Arg
    ) {
        this.authorizationRoute = authorizationRoute
        this.tokenRoute = tokenRoute
        this.refreshTokenRoute = refreshTokenRoute

        this.securitySchemeName = securitySchemeName || 'auth-design-oauth2'
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

    getSecuritySchemeName(): string {
        return this.securitySchemeName;
    }

    getDescription(): string | undefined {
        return this.description;
    }

    integrate(t: KaapiTools) {

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
                    if (
                        req.payload.client_id && typeof req.payload.client_id === 'string' &&
                        req.payload.code && typeof req.payload.code === 'string' &&
                        req.payload.grant_type === 'authorization_code'
                    ) {
                        const params: OAuth2ACTokenParams = {
                            clientId: req.payload.client_id,
                            grantType: req.payload.grant_type,
                            code: req.payload.code
                        }
                        if (req.payload.client_secret && typeof req.payload.client_secret === 'string') {
                            params.clientSecret = req.payload.client_secret
                        }
                        if (req.payload.code_verifier && typeof req.payload.code_verifier === 'string') {
                            params.codeVerifier = req.payload.code_verifier
                        }
                        if (req.payload.redirect_uri && typeof req.payload.redirect_uri === 'string') {
                            params.redirectUri = req.payload.redirect_uri
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
                            const params: OAuth2ACRefreshTokenParams = {
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
                        const params: OAuth2ACRefreshTokenParams = {
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

        t.scheme(this.securitySchemeName, this.strategyScheme())
        t.strategy(this.securitySchemeName, this.securitySchemeName, this.options)

        const securityScheme = this.scheme()
        t.openapi?.addSecurityScheme(securityScheme)
            .setDefaultSecurity(securityScheme);
        if (securityScheme instanceof OAuth2Util && !securityScheme.getHost() && t.postman?.getHost().length) {
            securityScheme.setHost(t.postman.getHost()[0])
        }
        t.postman?.setDefaultSecurity(securityScheme);
    }

    scheme() {
        const docs = new OAuth2Util(this.securitySchemeName)
            .setGrantType(this.isWithPkce() ? GrantType.authorizationCodeWithPkce : GrantType.authorizationCode)
            .setScopes(this.getScopes() || {})
            .setAuthUrl(this.authorizationRoute.path)
            .setAccessTokenUrl(this.tokenRoute.path || '');

        if (this.refreshTokenRoute?.path) {
            docs.setRefreshUrl(this.refreshTokenRoute.path)
        }

        if (this.description) {
            docs.setDescription(this.description)
        }

        return docs
    }

    strategyScheme(): ServerAuthScheme {
        return (_server, options) => {

            return {
                async authenticate(request, h) {

                    const settings: OAuth2AuthOptions = Hoek.applyToDefaults({
                        tokenType: 'Bearer'
                    }, options || {});

                    const authorization = request.raw.req.headers.authorization;

                    const authSplit = authorization ? authorization.split(/\s+/) : ['', ''];

                    const tokenType = authSplit[0]
                    let token = authSplit[1]

                    if (tokenType.toLowerCase() !== settings.tokenType?.toLowerCase()) {
                        token = ''
                        return Boom.unauthorized(null, tokenType)
                    }

                    if (settings.validate) {
                        try {
                            const result = await settings.validate?.(request, token, h)

                            if (result && 'isAuth' in result) {
                                return result
                            }

                            if (result) {
                                const { isValid, credentials, artifacts, message, scheme } = result;

                                if (isValid && credentials) {
                                    return h.authenticated({ credentials, artifacts })
                                }

                                if (message) {
                                    return h.unauthenticated(Boom.unauthorized(message, scheme || settings.tokenType || ''), {
                                        credentials: credentials || {},
                                        artifacts
                                    })
                                }
                            }
                        } catch (err) {
                            return Boom.internal(err instanceof Error ? err : `${err}`)
                        }
                    }

                    return h.unauthenticated(Boom.unauthorized(), { credentials: {} })
                },
            }
        }
    }

}

//#endregion AuthDesignOAuth2