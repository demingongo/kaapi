import { SecuritySchemeObject } from '@novice1/api-doc-generator/lib/generators/openapi/definitions';
import { ChallengeAlgorithm, GrantType, OAuth2Util } from '@novice1/api-doc-generator';
import { OAuth2AuthorizationCode, OAuth2AuthorizationCodeArg } from '../authentication-code';
import { KaapiTools, Lifecycle, ReqRef, Request, ReqRefDefaults, ResponseToolkit } from '@kaapi/kaapi';
import { JWKS } from '../../utils/jwks-store';

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

//#region OpenIDJWKSRoute

export interface OpenIDJWKSParams {
    jwks: JWKS
}

export type OpenIDJWKSHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: OpenIDJWKSParams, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IOpenIDJWKSRoute<
    Refs extends ReqRef = ReqRefDefaults
> {
    path: string,
    handler?: OpenIDJWKSHandler<Refs>
}

export class OpenIDJWKSRoute<
    Refs extends ReqRef = ReqRefDefaults
> implements IOpenIDJWKSRoute<Refs> {
    protected _path: string;
    protected _handler: OpenIDJWKSHandler<Refs> | undefined

    get path() {
        return this._path
    }

    get handler() {
        return this._handler
    }

    constructor(
        path: string,
        handler?: OpenIDJWKSHandler<Refs>
    ) {
        this._path = path;
        this._handler = handler;
    }
}

//#endregion OpenIDJWKSRoute

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
    jwksRoute: IOpenIDJWKSRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    userInfoRoute?: IOpenIDUserInfoRoute<any>

    /**
     * Override the configuration served at /.well-known/openid-configuration
     */
    openidConfiguration?: Record<string, unknown>
}

export class OpenIDAuthDesign extends OAuth2AuthorizationCode {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected jwksRoute: IOpenIDJWKSRoute<any>;
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
                return {
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
                    token_endpoint_auth_methods_supported: this.getTokenEndpointAuthMethods(),
                    ...this.openidConfiguration
                }
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

                const jwks = await this.jwksGenerator.generateIfEmpty() as JWKS

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