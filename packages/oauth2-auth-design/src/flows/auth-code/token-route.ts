import {
    Lifecycle,
    ReqRef,
    ReqRefDefaults
} from '@kaapi/kaapi'
import {
    IOAuth2TokenResponse,
    OAuth2TokenResponseBody,
    OAuth2ErrorBody,
    PathValue,
    TokenGenerator,
    OAuth2TokenParams,
    OAuth2TokenHandler,
    IOAuth2TokenRoute,
    OAuth2TokenRoute,
    DefaultOAuth2TokenRoute,
    OAuth2ErrorCode
} from '../common'
import { verifyCodeVerifier } from '../../utils/verify-code-verifier'

//#region TokenRoute

export interface OAuth2ACTokenParams extends OAuth2TokenParams {
    code: string
    clientId: string
    clientSecret?: string
    codeVerifier?: string
    redirectUri?: string
    verifyCodeVerifier: typeof verifyCodeVerifier
}

export type OAuth2ACTokenHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = OAuth2TokenHandler<OAuth2ACTokenParams, Refs, R>

export type IOAuth2ACTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> = IOAuth2TokenRoute<OAuth2ACTokenParams, Refs>

export class OAuth2ACTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> extends OAuth2TokenRoute<
    OAuth2ACTokenParams,
    Refs
> implements IOAuth2ACTokenRoute<Refs> {

    static buildDefault<
        Refs extends ReqRef = ReqRefDefaults
    >() {
        return new DefaultOAuth2ACTokenRoute<Refs>()
    }
}

//#endregion TokenRoute

//#region Defaults

/**
 * Return null for invalid request
 */
export type AuthCodeTokenGenerator<Refs extends ReqRef = ReqRefDefaults> = TokenGenerator<OAuth2ACTokenParams, Refs>;

export class DefaultOAuth2ACTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> extends OAuth2ACTokenRoute<Refs>
    implements DefaultOAuth2TokenRoute<
        OAuth2ACTokenParams, Refs
    > {

    #generateToken: AuthCodeTokenGenerator<Refs>

    constructor() {
        super('/oauth2/token', async (props, req, h) => {
            if (!props.clientSecret && !props.codeVerifier) {
                return h.response({ error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: 'Token request was missing \'client_secret\' or \'code_verifier\'.' }).code(400)
            }

            let r: OAuth2TokenResponseBody | IOAuth2TokenResponse | OAuth2ErrorBody | null = null

            try {
                r = await this.#generateToken(props, req)
            } catch (err) {
                return h.response({ error:  OAuth2ErrorCode.INVALID_REQUEST, error_description: `${err}` }).code(400)
            }

            if (!r) return h.response({ error:  OAuth2ErrorCode.INVALID_REQUEST }).code(400)

            if ('error' in r) return h.response(r).code(400)

            return h.response(r).code(200)
        })

        this.#generateToken = async () => ({ error:  OAuth2ErrorCode.INVALID_REQUEST })
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