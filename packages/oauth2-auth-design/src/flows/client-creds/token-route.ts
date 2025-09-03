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
    OAuth2TokenRoute,
    IOAuth2TokenRoute,
    DefaultOAuth2TokenRoute
} from '../common'


//#region TokenRoute

export interface OAuth2ClientCredentialsTokenParams extends OAuth2TokenParams {
    clientId: string
    clientSecret: string
    scope?: string
}

export type OAuth2ClientCredentialsTokenHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = OAuth2TokenHandler<OAuth2ClientCredentialsTokenParams, Refs, R>

export type IOAuth2ClientCredentialsTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> = IOAuth2TokenRoute<OAuth2ClientCredentialsTokenParams, Refs>

export class OAuth2ClientCredentialsTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> extends OAuth2TokenRoute<
    OAuth2ClientCredentialsTokenParams,
    Refs
> implements IOAuth2ClientCredentialsTokenRoute<Refs> {
    static buildDefault<
        Refs extends ReqRef = ReqRefDefaults
    >() {
        return new DefaultOAuth2ClientCredentialsTokenRoute<Refs>()
    }
}

//#endregion TokenRoute

//#region Defaults

/**
 * Return null for invalid request
 */
export type ClientCredentialsTokenGenerator<Refs extends ReqRef = ReqRefDefaults> = TokenGenerator<OAuth2ClientCredentialsTokenParams, Refs>;

export class DefaultOAuth2ClientCredentialsTokenRoute<
    Refs extends ReqRef = ReqRefDefaults
> extends OAuth2ClientCredentialsTokenRoute<Refs>
    implements DefaultOAuth2TokenRoute<
        OAuth2ClientCredentialsTokenParams, Refs
    > {

    #generateToken: ClientCredentialsTokenGenerator<Refs>

    constructor() {
        super('/oauth2/token', async (props, req, h) => {
            if (!props.clientSecret) {
                return h.response({ error: 'invalid_request', error_description: 'Token request was missing \'client_secret\'.' }).code(400)
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

    validate(handler: OAuth2ClientCredentialsTokenHandler<Refs>): this {
        this._handler = handler
        return this
    }

    generateToken(handler: ClientCredentialsTokenGenerator<Refs>): this {
        this.#generateToken = handler
        return this
    }
}

//#endregion Defaults