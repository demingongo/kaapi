import {
    Auth,
    AuthCredentials,
    AuthDesign,
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit
} from '@kaapi/kaapi'
import { Boom } from '@hapi/boom'
import { JWKSStore } from '../utils/jwks-store';
import { getInMemoryJWKSStore } from '../utils/in-memory-jwks-store';
import { JWKSGenerator, OAuth2JwtPayload } from '../utils/jwks-generator';
import { BearerToken, TokenType } from '../utils/token-types';

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
    validate?(request: Request<Refs>, token: string, h: ResponseToolkit<Refs>): Promise<{
        isValid?: boolean;
        artifacts?: unknown;
        credentials?: AuthCredentials;
        message?: string;
    } | Auth | Boom>;
};

export interface OIDCHelpers {
    readonly ttl?: number
    createIDToken: (payload: WithRequired<Partial<OAuth2JwtPayload>, 'sub'>) => Promise<string>
}

//#endregion Types

//#region RefreshTokenRoute

export interface OAuth2RefreshTokenParams extends Partial<OIDCHelpers> {
    grantType: string
    refreshToken: string
    clientId: string
    clientSecret?: string
    scope?: string
}

export type OAuth2RefreshTokenHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: OAuth2RefreshTokenParams, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IOAuth2RefreshTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> {
    path: string,
    handler: OAuth2RefreshTokenHandler<Refs>
}

export class OAuth2RefreshTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> implements IOAuth2RefreshTokenRoute<Refs> {
    protected _path: string;
    protected _handler: OAuth2RefreshTokenHandler<Refs>

    get path() {
        return this._path
    }

    get handler() {
        return this._handler
    }

    constructor(
        path: string,
        handler: OAuth2RefreshTokenHandler<Refs>
    ) {
        this._path = path;
        this._handler = handler;
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

    setIDToken(value?: string): this {
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

export abstract class OAuth2AuthDesign extends AuthDesign {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected _tokenType: TokenType<any>

    get tokenType(): string {
        return this._tokenType.prefix
    }

    constructor() {
        super()
        this._tokenType = new BearerToken()
        /*{
            prefix: 'Bearer',
            isValid: () => ({ isValid: true })
        }*/
    }

    setTokenType<Refs extends ReqRef = ReqRefDefaults>(value: TokenType<Refs>): this {
        this._tokenType = value
        return this
    }
}

export abstract class OAuth2WithJWKSAuthDesign extends OAuth2AuthDesign {

    #jwksGenerator: JWKSGenerator

    get jwksGenerator(): JWKSGenerator {
        return this.#jwksGenerator
    }

    constructor(jwksStore?: JWKSStore, ttlSeconds?: number) {
        super()
        this.#jwksGenerator = new JWKSGenerator(jwksStore || getInMemoryJWKSStore(), ttlSeconds)
    }

    setTokenTTL(ttlSeconds?: number): this {
        this.#jwksGenerator.ttl = ttlSeconds
        return this
    }

    getTokenTTL(): number | undefined {
        return this.#jwksGenerator.ttl
    }
}

//#endregion OAuth2AuthDesign