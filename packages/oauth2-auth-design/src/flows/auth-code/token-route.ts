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
    OAuth2ErrorBody,
    OpenIDHelpers,
    PathValue
} from '../common'
import { JWTPayload } from 'jose'

//#region TokenRoute

export interface OAuth2ACTokenParams extends Partial<OpenIDHelpers> {
    grantType: string
    code: string
    clientId: string
    clientSecret?: string
    codeVerifier?: string
    redirectUri?: string
    readonly ttl?: number
    createJwtAccessToken?: (payload: JWTPayload) => Promise<string>
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

    static buildDefault<
        Refs extends ReqRef = ReqRefDefaults
    >() {
        return new DefaultOAuth2ACTokenRoute<Refs>()
    }

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

//#region Defaults

/**
 * Return null for invalid request
 */
export type AuthCodeTokenGenerator<Refs extends ReqRef = ReqRefDefaults> = (
    params: OAuth2ACTokenParams,
    req: Request<Refs>
) => Promise<OAuth2TokenResponseBody | IOAuth2TokenResponse | OAuth2ErrorBody | null> | OAuth2TokenResponseBody | IOAuth2TokenResponse | OAuth2ErrorBody |  null

export class DefaultOAuth2ACTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> extends OAuth2ACTokenRoute<Refs> {

    #generateToken: AuthCodeTokenGenerator<Refs>

    constructor() {
        super('/oauth2/token', async (props, req, h) => {
            if (!props.clientSecret && !props.codeVerifier) {
                return h.response({ error: 'invalid_request', error_description: 'Token request was missing \'client_secret\' or \'code_verifier\'.' }).code(400)
            }

            let r: OAuth2TokenResponseBody | IOAuth2TokenResponse | OAuth2ErrorBody | null = null

            try {
                r = await this.#generateToken(props, req)
            } catch (err) {
                return h.response({ error: 'invalid_request', error_description: `${err}` }).code(400)
            }

            if (!r) return h.response({ error: 'invalid_request' }).code(400)

            if ('error' in r) return h.response(r).code(400)

            return h.response(r).code(200)
        })

        this.#generateToken = async () => ({ error: 'invalid_request' })
    }

    setPath(path: PathValue): this {
        if (path)
            this._path = path
        return this
    }

    validate(handler: OAuth2ACTokenHandler<Refs>): this {
        this._handler = handler
        return this
    }

    generateToken(handler: AuthCodeTokenGenerator<Refs>): this {
        this.#generateToken = handler
        return this
    }
}

//#endregion Defaults