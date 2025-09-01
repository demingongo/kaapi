import {
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit
} from '@kaapi/kaapi'
import {
    IOAuth2TokenResponse,
    OAuth2TokenResponseBody,
    OpenIDHelpers,
    PathValue,
    TokenGenerator
} from '../common'
import { JWTPayload } from 'jose'

//#region Types

export type OAuth2DeviceCodeTokenError = 'access_denied' | 'authorization_pending' | 'slow_down'

export type OAuth2DeviceCodeTokenErrorBody = {
    error: OAuth2DeviceCodeTokenError
    error_description?: string
    error_uri?: string
    [key: string]: unknown
}

//#endregion Types

//#region TokenRoute

export interface OAuth2DeviceAuthTokenParams extends Partial<OpenIDHelpers> {
    grantType: string
    deviceCode: string
    clientId: string
    clientSecret?: string
    readonly ttl?: number
    createJwtAccessToken?: (payload: JWTPayload) => Promise<string>
}

export type OAuth2DeviceAuthTokenHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: OAuth2DeviceAuthTokenParams, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IOAuth2DeviceAuthTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> {
    path: string,
    handler: OAuth2DeviceAuthTokenHandler<Refs>
}

export class OAuth2DeviceAuthTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> implements IOAuth2DeviceAuthTokenRoute<Refs> {

    static buildDefault<
        Refs extends ReqRef = ReqRefDefaults
    >() {
        return new DefaultOAuth2DeviceAuthTokenRoute<Refs>()
    }

    protected _path: string;
    protected _handler: OAuth2DeviceAuthTokenHandler<Refs>

    get path() {
        return this._path
    }

    get handler() {
        return this._handler
    }

    constructor(
        path: string,
        handler: OAuth2DeviceAuthTokenHandler<Refs>
    ) {
        this._path = path;
        this._handler = handler;
    }
}

//#endregion TokenRoute

//#region Defaults

/**
 * Return null for invalid request
 */
export type DeviceAuthTokenGenerator<Refs extends ReqRef = ReqRefDefaults> = TokenGenerator<OAuth2DeviceAuthTokenParams, Refs, OAuth2DeviceCodeTokenErrorBody>;

export class DefaultOAuth2DeviceAuthTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> extends OAuth2DeviceAuthTokenRoute<Refs> {

    #generateToken: DeviceAuthTokenGenerator<Refs>

    constructor() {
        super('/oauth2/token', async (props, req, h) => {
            let r: OAuth2TokenResponseBody | IOAuth2TokenResponse | OAuth2DeviceCodeTokenErrorBody | null = null

            try {
                r = await this.#generateToken(props, req)
            } catch (err) {
                return h.response({ error: 'access_denied', error_description: `${err}` }).code(400)
            }

            if (!r) return h.response({ error: 'access_denied' }).code(400)

            if ('error' in r) return h.response(r).code(400)

            return h.response(r).code(200)
        })

        this.#generateToken = async () => ({ error: 'access_denied' })
    }

    setPath(path: PathValue): this {
        if (path)
            this._path = path
        return this
    }

    validate(handler: OAuth2DeviceAuthTokenHandler<Refs>): this {
        this._handler = handler
        return this
    }

    generateToken(handler: DeviceAuthTokenGenerator<Refs>): this {
        this.#generateToken = handler
        return this
    }
}

//#endregion Defaults