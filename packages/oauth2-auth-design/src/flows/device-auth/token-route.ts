import {
    Lifecycle,
    ReqRef,
    ReqRefDefaults
} from '@kaapi/kaapi'
import {
    DefaultOAuth2TokenRoute,
    DeviceFlowOAuth2ErrorCode,
    DeviceFlowOAuth2ErrorCodeType,
    IOAuth2TokenResponse,
    IOAuth2TokenRoute,
    OAuth2TokenHandler,
    OAuth2TokenParams,
    OAuth2TokenResponseBody,
    OAuth2TokenRoute,
    PathValue,
    StandardOAuth2ErrorCode,
    TokenGenerator
} from '../common'

//#region Types

/**
 * | Situation                     | Error                   | Meaning           |
 * | ----------------------------- | ----------------------- | ----------------- |
 * | Authorization still pending   | `authorization_pending` | Keep polling      |
 * | Polling too fast              | `slow_down`             | Increase interval |
 * | Invalid / expired device code | `invalid_grant`         | Stop polling      |
 * | User denied                   | `access_denied`         | Stop polling      |
 * | Client misconfiguration       | `invalid_client`        | Client error      |
 */
export type OAuth2DeviceCodeTokenErrorBody = {
    error: DeviceFlowOAuth2ErrorCodeType | typeof StandardOAuth2ErrorCode.INVALID_GRANT | typeof StandardOAuth2ErrorCode.INVALID_CLIENT
    error_description?: string
    error_uri?: string
    [key: string]: unknown
}

//#endregion Types

//#region TokenRoute

export interface OAuth2DeviceAuthTokenParams extends OAuth2TokenParams {
    deviceCode: string
    clientId: string
    clientSecret?: string
}

export type OAuth2DeviceAuthTokenHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = OAuth2TokenHandler<OAuth2DeviceAuthTokenParams, Refs, R>

export type IOAuth2DeviceAuthTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> = IOAuth2TokenRoute<OAuth2DeviceAuthTokenParams, Refs>

export class OAuth2DeviceAuthTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> extends OAuth2TokenRoute<
    OAuth2DeviceAuthTokenParams,
    Refs
> implements IOAuth2DeviceAuthTokenRoute<Refs> {

    static buildDefault<
        Refs extends ReqRef = ReqRefDefaults
    >() {
        return new DefaultOAuth2DeviceAuthTokenRoute<Refs>()
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
> extends OAuth2DeviceAuthTokenRoute<Refs>
    implements DefaultOAuth2TokenRoute<
        OAuth2DeviceAuthTokenParams, Refs, OAuth2DeviceCodeTokenErrorBody
    > {

    #generateToken: DeviceAuthTokenGenerator<Refs>

    constructor() {
        super('/oauth2/token', async (props, req, h) => {
            let r: OAuth2TokenResponseBody | IOAuth2TokenResponse | OAuth2DeviceCodeTokenErrorBody | null = null

            try {
                r = await this.#generateToken(props, req)
            } catch (err) {
                return h.response({ error: DeviceFlowOAuth2ErrorCode.ACCESS_DENIED, error_description: `${err}` }).code(400)
            }

            if (!r) return h.response({ error: DeviceFlowOAuth2ErrorCode.ACCESS_DENIED }).code(400)

            if ('error' in r) return h.response(r).code(400)

            return h.response(r).code(200)
        })

        this.#generateToken = async () => ({ error: DeviceFlowOAuth2ErrorCode.ACCESS_DENIED })
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