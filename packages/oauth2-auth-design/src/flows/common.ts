import {
    Auth,
    AuthCredentials,
    AuthDesign,
    ILogger,
    KaapiTools,
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit
} from '@kaapi/kaapi'
import Boom, { Boom as IBoom } from '@hapi/boom'
import Hoek from '@hapi/hoek'
import { JWTPayload } from 'jose';
import { OAuth2Util } from '@novice1/api-doc-generator';
import { SecuritySchemeObject } from '@novice1/api-doc-generator/lib/generators/openapi/definitions';

import { OAuth2JwtPayload } from '../utils/jwt-utils';
import { BearerToken, TokenType } from '../utils/token-types';
import {
    ClientAuthMethod,
    ClientSecretBasic,
    ClientSecretPost,
    NoneAuthMethod,
    sortTokenEndpointAuthMethods,
    TokenEndpointAuthMethod
} from '../utils/client-auth-methods';
import { JwksKeyStore, JwksRotationTimestampStore, JwksRotator, JwtAuthority } from '../utils/jwt-authority';
import { InMemoryKeyStore } from '../utils/in-memory-key-store';
import { JWK } from 'node-jose';

//#region Types

export type PathValue = `/${string}`;

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }

export type OAuth2Error = 'invalid_request' | 'invalid_client' | 'invalid_grant' | 'invalid_scope' | 'unauthorized_client' | 'unsupported_grant_type' | 'invalid_token'

export type OAuth2ErrorBody = {
    error: OAuth2Error
    error_description?: string
    error_uri?: string
    [key: string]: unknown
}

export type OAuth2AuthOptions<
    Refs extends ReqRef = ReqRefDefaults
> = {
    /**
     * Auto-verifies the access token JWT using the configured JWKS before running user validation.
     */
    useAccessTokenJwks?: boolean;
    /**
     * 
     * User validations
     */
    validate?(request: Request<Refs>, tokens: {
        /**
         * The access token to validate and/or decode
         */
        token: string
        /**
         * Only defined if useAccessTokenJwks is true. Otherwise, validate and decode the token manually
         */
        jwtAccessTokenPayload?: JWTPayload
    }, h: ResponseToolkit<Refs>): Promise<{
        isValid?: boolean;
        artifacts?: unknown;
        credentials?: AuthCredentials;
        message?: string;
    } | Auth | IBoom>;
};

export interface OpenIDHelpers {
    readonly ttl?: number
    createIdToken: (payload: WithRequired<Partial<OAuth2JwtPayload>, 'sub'>) => Promise<{
        token: string;
        kid: string;
    }>
}

//#endregion Types

//#region TokenGenerator

export type TokenGenerator<P extends object = object, Refs extends ReqRef = ReqRefDefaults, Err extends { error: string } = OAuth2ErrorBody> = (
    params: P,
    req: Request<Refs>
) => Promise<OAuth2TokenResponseBody | IOAuth2TokenResponse | Err | null> | OAuth2TokenResponseBody | IOAuth2TokenResponse | Err | null

//#endregion TokenGenerator

//#region TokenRoute

export interface OAuth2TokenParams extends Partial<OpenIDHelpers> {
    grantType: string
    tokenType: string
    readonly ttl?: number
    createJwtAccessToken?: (payload: JWTPayload) => Promise<{
        token: string;
        kid: string;
    }>
}

export type OAuth2TokenHandler<
    P extends OAuth2TokenParams = OAuth2TokenParams,
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: P, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IOAuth2TokenRoute<
    P extends OAuth2TokenParams = OAuth2TokenParams,
    Refs extends ReqRef = ReqRefDefaults
> {
    path: string,
    handler: OAuth2TokenHandler<P, Refs>,
}

export abstract class OAuth2TokenRoute<
    P extends OAuth2TokenParams = OAuth2TokenParams,
    Refs extends ReqRef = ReqRefDefaults
> implements IOAuth2TokenRoute<P, Refs> {

    protected _path: string;
    protected _handler: OAuth2TokenHandler<P, Refs>

    get path() {
        return this._path
    }

    get handler() {
        return this._handler
    }

    constructor(
        path: string,
        handler: OAuth2TokenHandler<P, Refs>
    ) {
        this._path = path;
        this._handler = handler;
    }
}

export interface DefaultOAuth2TokenRoute<
    P extends OAuth2TokenParams = OAuth2TokenParams,
    Refs extends ReqRef = ReqRefDefaults,
    Err extends { error: string } = OAuth2ErrorBody
> extends OAuth2TokenRoute<P, Refs> {
    setPath(path: PathValue): this;

    validate(handler: OAuth2TokenHandler<P, Refs>): this;

    generateToken(handler: TokenGenerator<P, Refs, Err>): this;
}

//#endregion TokenRoute

//#region RefreshTokenRoute

export interface OAuth2RefreshTokenParams extends OAuth2TokenParams {
    refreshToken: string
    clientId: string
    clientSecret?: string
    scope?: string
    verifyJwt?<P extends object = object>(token: string): Promise<P & JWTPayload>
}

export type OAuth2RefreshTokenHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = OAuth2TokenHandler<OAuth2RefreshTokenParams, Refs, R>

export type IOAuth2RefreshTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> = IOAuth2TokenRoute<OAuth2RefreshTokenParams, Refs>

export class OAuth2RefreshTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> extends OAuth2TokenRoute<
    OAuth2RefreshTokenParams,
    Refs
> implements IOAuth2RefreshTokenRoute<Refs> {
    static buildDefault<
        Refs extends ReqRef = ReqRefDefaults,
        Err extends { error: string } = OAuth2ErrorBody
    >() {
        return new DefaultOAuth2RefreshTokenRoute<Refs, Err>()
    }
}

export class DefaultOAuth2RefreshTokenRoute<
    Refs extends ReqRef = ReqRefDefaults,
    Err extends { error: string } = OAuth2ErrorBody
> extends OAuth2RefreshTokenRoute<Refs>
    implements DefaultOAuth2TokenRoute<
        OAuth2RefreshTokenParams, Refs, Err
    > {

    #generateToken: TokenGenerator<OAuth2RefreshTokenParams, Refs, Err>

    constructor() {
        super('/oauth2/token', async (props, req, h) => {
            const r = await this.#generateToken(props, req)

            if (!r) return h.continue

            if ('error' in r) return h.response(r).code(400)

            return h.response(r).code(200)
        })
        this.#generateToken = () => null;
    }

    generateToken(handler: TokenGenerator<OAuth2RefreshTokenParams, Refs, Err>): this {
        this.#generateToken = handler;
        return this;
    }

    setPath(path: PathValue): this {
        if (path)
            this._path = path
        return this
    }

    validate(handler: OAuth2RefreshTokenHandler<Refs>): this {
        this._handler = handler
        return this
    }
}

//#endregion RefreshTokenRoute

//#region OAuth2TokenResponse

export interface OAuth2TokenResponseBody {
    access_token: string
    token_type: string
    expires_in?: number
    refresh_token?: string
    scope?: string
    id_token?: string
    error?: never
    [key: string]: unknown
}

export interface IOAuth2TokenResponse {
    toJSON(): OAuth2TokenResponseBody
}

export class OAuth2TokenResponse implements IOAuth2TokenResponse {

    protected accessToken: string

    protected tokenType = 'bearer'
    /**
     * in seconds
     */
    protected expiresIn?: number
    protected refreshToken?: string
    protected scope?: string
    protected idToken?: string

    constructor({ access_token, expires_in, refresh_token, scope, id_token }: { access_token: string, expires_in?: number, refresh_token?: string, scope?: string, id_token?: string }) {
        this.accessToken = access_token
        this.expiresIn = expires_in
        this.refreshToken = refresh_token
        this.scope = scope
        this.idToken = id_token
    }

    setAccessToken(value: string): this {
        this.accessToken = value
        return this;
    }
    getAccessToken(): string {
        return this.accessToken;
    }

    setTokenType(value: string | TokenType): this {
        this.tokenType = typeof value == 'string' ? value : value.prefix
        return this;
    }
    getTokenType(): string {
        return this.tokenType;
    }

    /**
     * @param value number of seconds
     */
    setExpiresIn(value?: number): this {
        this.expiresIn = value
        return this;
    }
    /**
     * @returns number of seconds
     */
    getExpiresIn(): number | undefined {
        return this.expiresIn;
    }

    setRefreshToken(value?: string): this {
        this.refreshToken = value
        return this;
    }
    getRefreshToken(): string | undefined {
        return this.refreshToken;
    }

    setScope(value?: string | string[]): this {
        this.scope = Array.isArray(value) ? value.join(' ') : value
        return this;
    }
    getScope(): string | undefined {
        return this.scope;
    }

    setIdToken(value?: string): this {
        this.idToken = value
        return this;
    }
    getIDToken(): string | undefined {
        return this.idToken;
    }

    toObject(): { access_token: string, token_type: string, expires_in?: number, refresh_token?: string, scope?: string, id_token?: string } {
        return {
            access_token: this.getAccessToken(),
            token_type: this.getTokenType(),
            expires_in: this.getExpiresIn(),
            refresh_token: this.getRefreshToken(),
            scope: this.getScope(),
            id_token: this.getIDToken(),
        }
    }

    toJSON(): { access_token: string, token_type: string, expires_in?: number, refresh_token?: string, scope?: string, id_token?: string } {
        return this.toObject()
    }
}

//#endregion OAuth2TokenResponse

//#region OAuth2AuthDesign

export interface OAuth2JwksOptions {
    keyStore?: JwksKeyStore;
    /**
     * Public key ttl in seconds
     */
    ttl?: number;

    /**
     * key pair rotation
     */
    rotation?: {
        intervalMs: number;
        timestampStore: JwksRotationTimestampStore;
    }
}

export interface OAuth2AuthDesignOptions {
    logger?: ILogger;
    jwksOptions?: OAuth2JwksOptions;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwksRoute?: IJWKSRoute<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: OAuth2AuthOptions<any>;
    strategyName?: string;
}

export abstract class OAuth2AuthDesign extends AuthDesign {

    protected _clientAuthMethods: Record<TokenEndpointAuthMethod, ClientAuthMethod | undefined> = {
        client_secret_basic: undefined,
        client_secret_post: undefined,
        client_secret_jwt: undefined,
        private_key_jwt: undefined,
        none: undefined
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected _tokenType: TokenType<any>

    get tokenType(): string {
        return this._tokenType.prefix
    }

    protected get clientAuthMethods(): Record<TokenEndpointAuthMethod, ClientAuthMethod | undefined> {
        const result: Record<TokenEndpointAuthMethod, ClientAuthMethod | undefined> = {
            client_secret_basic: undefined,
            client_secret_post: undefined,
            client_secret_jwt: undefined,
            private_key_jwt: undefined,
            none: undefined
        }

        const keys = Object.keys(this._clientAuthMethods).map(key => {
            const k = key as TokenEndpointAuthMethod
            result[k] = this._clientAuthMethods[k]
            return this._clientAuthMethods[k] ? key : undefined
        }).filter((key): key is TokenEndpointAuthMethod => !!key)

        if (!keys.length) {
            result.client_secret_basic = new ClientSecretBasic()
        }

        return result
    }

    //
    protected strategyName: string
    protected options: OAuth2AuthOptions
    protected description?: string
    protected scopes?: Record<string, string>
    protected tokenTTL?: number;
    protected logger?: ILogger;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected jwksRoute?: IJWKSRoute<any>;
    protected jwksKeyStore?: JwksKeyStore;
    protected jwksPublicKeyTtl?: number;
    protected jwksRotationIntervalMs?: number;
    protected jwksRotationTimestampStore?: JwksRotationTimestampStore;

    protected jwtAuthority?: JwtAuthority;
    protected jwksRotator?: JwksRotator;

    constructor(options?: OAuth2AuthDesignOptions) {
        super()
        this._tokenType = new BearerToken()
        this.strategyName = options?.strategyName || 'oauth2-auth-design'
        this.options = options?.options ? { ...(options.options) } : {}

        //
        this.jwksRoute = options?.jwksRoute
        this.jwksKeyStore = options?.jwksOptions?.keyStore
        this.jwksPublicKeyTtl = options?.jwksOptions?.ttl
        this.jwksRotationIntervalMs = options?.jwksOptions?.rotation?.intervalMs
        this.jwksRotationTimestampStore = options?.jwksOptions?.rotation?.timestampStore
    }

    protected async _extractClientParams(
        req: Request<ReqRefDefaults>,
        authMethodsInstances: Record<TokenEndpointAuthMethod, ClientAuthMethod | undefined>,
        checkOrder: TokenEndpointAuthMethod[],
    ): Promise<{ clientId?: string; clientSecret?: string; error?: OAuth2Error; errorDescription?: string }> {
        let clientId: string | undefined;
        let clientSecret: string | undefined;
        let error: OAuth2Error | undefined;
        let errorDescription: string | undefined;

        for (const am of checkOrder) {
            const amInstance = authMethodsInstances[am]
            if (amInstance) {
                //console.log('Check', amInstance.method, '...')
                const v = await amInstance.extractParams(req as unknown as Request<ReqRefDefaults>)
                if (v.hasAuthMethod) {
                    //console.log(amInstance.method, 'IS BEING USED')
                    clientId = v.clientId
                    clientSecret = v.clientSecret
                    if (!v.clientId) {
                        error = 'invalid_request'
                        errorDescription = `Error ${amInstance.method}: Missing client_id`
                    } else if (!amInstance.secretIsOptional && !v.clientSecret) {
                        error = 'invalid_request'
                        errorDescription = `Error ${amInstance.method}: Missing client_secret`
                    }
                    break;
                } else {
                    //console.log(amInstance.method, 'was not used')
                }
            }
        }

        return {
            error,
            errorDescription,
            clientId,
            clientSecret
        }
    }

    protected getJwtAuthority(): JwtAuthority | undefined {
        if (this.jwtAuthority) return this.jwtAuthority;
        if (this.jwksRoute || this.jwksKeyStore || this.options.useAccessTokenJwks) {
            this.jwtAuthority = new JwtAuthority(this.jwksKeyStore || new InMemoryKeyStore(), this.jwksPublicKeyTtl)
        }
        return this.jwtAuthority
    }

    protected getJwksRotator(): JwksRotator | undefined {
        if (this.jwksRotator) return this.jwksRotator;
        const jwtAuthority = this.getJwtAuthority();
        if (jwtAuthority && this.jwksRotationIntervalMs) {
            this.jwksRotator = new JwksRotator({
                keyGenerator: jwtAuthority,
                rotationIntervalMs: this.jwksRotationIntervalMs,
                rotatorKeyStore: this.jwksRotationTimestampStore || new InMemoryKeyStore(),
                logger: this.logger
            })
        }
        return this.jwksRotator
    }

    protected createJwksEndpoint(t: KaapiTools) {
        const jwtAuthority = this.getJwtAuthority();

        if (this.jwksRoute && jwtAuthority) {
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

                    const jwks = await jwtAuthority.getJwksEndpointResponse()

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

    async checkAndRotateKeys(): Promise<void> {
        return this.getJwksRotator()?.checkAndRotateKeys()
    }

    async generateKeyPair(): Promise<void> {
        return this.getJwtAuthority()?.generateKeyPair()
    }

    setTokenType<Refs extends ReqRef = ReqRefDefaults>(value: TokenType<Refs>): this {
        this._tokenType = value
        return this
    }

    getTokenEndpointAuthMethods(): TokenEndpointAuthMethod[] {
        const result = Object.keys(this._clientAuthMethods).map(key => {
            return this._clientAuthMethods[key as TokenEndpointAuthMethod] ? key : undefined
        }).filter((key): key is TokenEndpointAuthMethod => !!key)

        if (!result.length) {
            result.push('client_secret_basic')
        }

        return sortTokenEndpointAuthMethods(result);
    }

    clientSecretBasicAuthenticationMethod(): this {
        this._clientAuthMethods.client_secret_basic = new ClientSecretBasic()
        return this
    }

    clientSecretPostAuthenticationMethod(): this {
        this._clientAuthMethods.client_secret_post = new ClientSecretPost()
        return this
    }

    noneAuthenticationMethod(): this {
        this._clientAuthMethods.none = new NoneAuthMethod()
        return this
    }

    addClientAuthenticationMethod(value: 'client_secret_basic' | 'client_secret_post' | 'none' | ClientAuthMethod): this {
        if (value == 'client_secret_basic') {
            this.clientSecretPostAuthenticationMethod()
        } else if (value == 'client_secret_post') {
            this.clientSecretBasicAuthenticationMethod()
        } else if (value == 'none') {
            this.noneAuthenticationMethod()
        } else {
            this._clientAuthMethods[value.method] = value
        }
        return this
    }

    //

    setTokenTTL(ttlSeconds?: number): this {
        this.tokenTTL = ttlSeconds
        return this
    }

    getTokenTTL(): number | undefined {
        return this.tokenTTL
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
     * Where authentication schemes and strategies are registered.
     */
    integrateStrategy(t: KaapiTools): void {
        const tokenTypePrefix = this.tokenType
        const tokenTypeInstance = this._tokenType
        const getJwtAuthority = () => this.getJwtAuthority();

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

                    const jwtAuthority = getJwtAuthority()

                    if (jwtAuthority && settings.useAccessTokenJwks) {
                        try {
                            jwtAccessTokenPayload = await jwtAuthority.verify(token)
                        } catch (err) {
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
}

//#endregion OAuth2AuthDesign

//#region JWKSRoute

export interface JWKSParams {
    jwks: {
        keys: JWK.RawKey[];
    }
}

export type JWKSHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: JWKSParams, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IJWKSRoute<
    Refs extends ReqRef = ReqRefDefaults
> {
    path: string,
    handler?: JWKSHandler<Refs>
}

export class JWKSRoute<
    Refs extends ReqRef = ReqRefDefaults
> implements IJWKSRoute<Refs> {

    static buildDefault<
        GetRefs extends ReqRef = ReqRefDefaults
    >() {
        return new DefaultJWKSRoute<GetRefs>()
    }

    protected _path: string;
    protected _handler: JWKSHandler<Refs> | undefined

    get path() {
        return this._path
    }

    get handler() {
        return this._handler
    }

    constructor(
        path: string,
        handler?: JWKSHandler<Refs>
    ) {
        this._path = path;
        this._handler = handler;
    }
}

export class DefaultJWKSRoute<
    Refs extends ReqRef = ReqRefDefaults
> extends JWKSRoute<Refs> {
    constructor() {
        super('/oauth2/keys')
    }

    setPath(path: PathValue): this {
        if (path)
            this._path = path
        return this
    }

    validate(handler: JWKSHandler<Refs>): this {
        this._handler = handler
        return this
    }
}

//#endregion JWKSRoute

//#region OAuth2AuthDesignBuilder

export interface OAuth2AuthDesignBuilder {
    setJwksKeyStore(keyStore: JwksKeyStore): this;
    setJwksRotatorOptions(jwksRotatorOptions: OAuth2JwksOptions['rotation']): this;
    build(): AuthDesign
}

//#endregion OAuth2AuthDesignBuilder

//#region OIDCAuthUtil

export class OIDCAuthUtil extends OAuth2Util {
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

//#endregion OIDCAuthUtil

//#region OAuth2SingleAuthFlow

export interface OAuth2SingleAuthFlow {

    readonly grantType: string;

    handleToken<Refs extends Partial<Record<keyof ReqRefDefaults, unknown>> = ReqRefDefaults>(t: KaapiTools, request: Request<Refs>, h: ResponseToolkit<Refs>): Promise<Lifecycle.ReturnValueTypes<{
        Payload: {
            grant_type?: unknown;
            refresh_token?: unknown;
            scope?: unknown;
        };
    }>>;

    handleRefreshToken?<Refs extends Partial<Record<keyof ReqRefDefaults, unknown>> = ReqRefDefaults>(t: KaapiTools, request: Request<Refs>, h: ResponseToolkit<Refs>): Promise<Lifecycle.ReturnValueTypes<{
        Payload: {
            grant_type?: unknown;
            refresh_token?: unknown;
            scope?: unknown;
        };
    }>>;

    getDiscoveryConfiguration?(t: KaapiTools): Record<string, unknown>;

    registerAuthorizationEndpoint?(t: KaapiTools): void;
}

//#endregion OAuth2SingleAuthFlow

//#region OAuth2SingleAuthFlowBuilder

export interface OAuth2SingleAuthFlowBuilder extends OAuth2AuthDesignBuilder {
    setJwksKeyStore(keyStore: JwksKeyStore): this;
    setPublicKeyExpiry(ttl: number): this;
    build(): AuthDesign & OAuth2SingleAuthFlow
}

//#endregion OAuth2SingleAuthFlowBuilder
