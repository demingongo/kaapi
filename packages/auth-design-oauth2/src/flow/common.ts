import {
    Auth,
    AuthCredentials,
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit
} from '@kaapi/kaapi'

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

//#region RefreshTokenRoute

export interface OAuth2RefreshTokenParams {
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