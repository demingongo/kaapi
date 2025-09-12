import {
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit
} from '@kaapi/kaapi'
import { encode } from 'html-entities'
import { OAuth2Error, OAuth2ErrorBody, PathValue } from '../common'

//#region AuthorizationRoute

export interface OAuth2ACAuthorizationParams {
    clientId: string
    responseType: string
    redirectUri: string
    scope?: string
    state?: string
    codeChallenge?: string
    nonce?: string
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

    static buildDefault<
        GetRefs extends ReqRef = ReqRefDefaults,
        PostRefs extends ReqRef = ReqRefDefaults,
    >() {
        return new DefaultOAuth2ACAuthorizationRoute<GetRefs, PostRefs>()
    }

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

//#region Defaults

export type AuthErrorType = OAuth2Error | 'credentials' | 'unknown'

export type AuthResponseRenderer<Refs extends ReqRef = ReqRefDefaults> = (
    context: {
        statusCode: number,
        emailField: string,
        passwordField: string,
        error?: AuthErrorType,
        errorMessage?: string
    },
    params: OAuth2ACAuthorizationParams,
    req: Request<Refs>,
    h: ResponseToolkit<Refs>
) => Promise<string | object> | string | object

export type AuthCodeGeneratorResult =
    | { type: 'code'; value: string }
    | { type: 'continue'; value?: unknown }
    | { type: 'deny'; value?: unknown }

/**
 * Return null for invalid code
 */
export type AuthCodeGenerator<Refs extends ReqRef = ReqRefDefaults> = (
    params: OAuth2ACAuthorizationParams,
    req: Request<Refs>,
    h: ResponseToolkit<Refs>
) => Promise<AuthCodeGeneratorResult | null> | AuthCodeGeneratorResult | null

export type AuthResponseHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>> = (
        context: {
            authorizationResult: AuthCodeGeneratorResult,
            emailField: string,
            passwordField: string,
            /**
             * The full redirect URI that the user should be sent to after authorization.
             * This URL includes the appropriate query parameters based on the outcome —
             * either an authorization `code` (on success) or `error`/`error_description` (on failure).
             *
             * Automatically constructed from the original `redirect_uri` and the `authorizationResult`.
             */
            fullRedirectUri: string
        },
        params: OAuth2ACAuthorizationParams,
        req: Request<Refs>,
        h: ResponseToolkit<Refs>
    ) => R

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const render: AuthResponseRenderer<any> = ({ error, errorMessage, emailField, passwordField }) => {
    if (error && ['invalid_client'].includes(error)) {
        return { error, error_description: errorMessage } as OAuth2ErrorBody
    }
    return `<!DOCTYPE html>
<html lang="en">
 <head>
  <meta charset="UTF-8">
  <meta name="Generator" content="EditPlus®">
  <meta name="Author" content="">
  <meta name="Keywords" content="">
  <meta name="Description" content="">
  <title>Sign In</title>
  <style>
    .error {
      color: red;
      font-weight: bold;
    }
  </style>
 </head>
 <body>
  <form method="POST">
  <div class="error">
    ${errorMessage || ''}
  </div>
  <div>
  <input type="email" id="${emailField}" name="${emailField}" placeholder="${emailField}" autocomplete="${emailField}" />
  <input type="password" id="${passwordField}" name="${passwordField}" placeholder="${passwordField}" />
  </div>
  <div>
  <button type="submit">
    Submit
  </button>
  </div>
  </form>
 </body>
</html>`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authResponseHandler: AuthResponseHandler<any> = async (ctx, _params, _req, h) => {
    return h.redirect(`${ctx.fullRedirectUri}`)
}

export class DefaultOAuth2ACAuthorizationRoute<
    GetRefs extends ReqRef = ReqRefDefaults,
    PostRefs extends ReqRef = ReqRefDefaults,
> extends OAuth2ACAuthorizationRoute<GetRefs, PostRefs> {
    #clientId?: string | null
    #redirectUri?: string | null

    #emailField = 'email'
    #passwordField = 'password'

    #generateCode: AuthCodeGenerator<PostRefs>
    #renderResponse: AuthResponseRenderer<GetRefs>
    #renderPOSTResponse: AuthResponseRenderer<PostRefs>
    #authorizationResponseHandler: AuthResponseHandler<PostRefs>

    constructor() {
        super('/oauth2/authorize', async ({ clientId, redirectUri, ...props }, req, h) => {
            if (this.#clientId && this.#clientId != clientId) {
                return h.response(
                    await this.#renderResponse(
                        {
                            emailField: this.#emailField,
                            passwordField: this.#passwordField,
                            statusCode: 400,
                            error: 'invalid_client',
                            errorMessage: 'Bad \'client_id\' parameter'
                        },
                        { clientId, redirectUri, ...props },
                        req, h)).code(400)
            }
            if (this.#redirectUri && this.#redirectUri != redirectUri) {
                return h.response(
                    await this.#renderResponse(
                        {
                            emailField: this.#emailField,
                            passwordField: this.#passwordField,
                            statusCode: 400,
                            error: 'invalid_client',
                            errorMessage: 'Bad \'redirect_uri\' parameter'
                        },
                        { clientId, redirectUri, ...props },
                        req, h)).code(400)
            }

            // render form
            return h.response(
                await this.#renderResponse({
                    emailField: this.#emailField,
                    passwordField: this.#passwordField,
                    statusCode: 200
                }, { clientId, redirectUri, ...props }, req, h)
            ).code(200)
        }, async (props, req, h) => {
            if (this.#clientId && this.#clientId != props.clientId) {
                return h.response(
                    await this.#renderPOSTResponse(
                        {
                            emailField: this.#emailField,
                            passwordField: this.#passwordField,
                            statusCode: 400,
                            error: 'invalid_client',
                            errorMessage: 'Bad \'client_id\' parameter'
                        },
                        props,
                        req, h)).code(400)
            }
            if (this.#redirectUri && this.#redirectUri != props.redirectUri) {
                return h.response(
                    await this.#renderPOSTResponse(
                        {
                            emailField: this.#emailField,
                            passwordField: this.#passwordField,
                            statusCode: 400,
                            error: 'invalid_client',
                            errorMessage: 'Bad \'redirect_uri\' parameter'
                        },
                        props,
                        req, h)).code(400)
            }

            let error: AuthErrorType = 'unknown'
            let errorMessage = 'someting went wrong'

            if (
                props.clientId &&
                req.payload &&
                typeof req.payload === 'object' /*&&
                this.#emailField in req.payload &&
                this.#passwordField in req.payload
                */
            ) {
                const code = await this.#generateCode(props, req, h)
                if (code) {
                    let fullRedirectUri = '';
                    if (code.type === 'code' && code.value) {
                        fullRedirectUri = `${props.redirectUri}?code=${encodeURIComponent(code.value)}${props.state ? `&state=${encodeURIComponent(props.state)}` : ''}`
                    } else if (code.type === 'deny') {
                        fullRedirectUri = `${props.redirectUri}?error=invalid_request&error_description=${encodeURIComponent('User denied consent')}${props.state ? `&state=${encodeURIComponent(props.state)}` : ''}`
                    } else {
                        fullRedirectUri = `${props.redirectUri}?error=invalid_request&error_description=${encodeURIComponent('No code')}${props.state ? `&state=${encodeURIComponent(props.state)}` : ''}`
                    }
                    return this.#authorizationResponseHandler({
                        authorizationResult: code,
                        emailField: this.#emailField,
                        passwordField: this.#passwordField,
                        fullRedirectUri
                    }, props, req, h)
                } else {
                    error = 'credentials'
                    errorMessage = 'wrong credentials'
                }
            } else {
                error = 'invalid_request'
            }

            // render form
            return h.response(
                await this.#renderPOSTResponse(
                    {
                        emailField: this.#emailField,
                        passwordField: this.#passwordField,
                        statusCode: 400,
                        error: error,
                        errorMessage
                    },
                    props,
                    req, h)).code(400)
        })

        // @TODO: generate id for user, store it in-memory, generate jwt code ?
        this.#generateCode = async () => null
        this.#renderResponse = render
        this.#renderPOSTResponse = render
        this.#authorizationResponseHandler = authResponseHandler
    }

    setPath(path: PathValue): this {
        if (path)
            this._path = path
        return this
    }

    validateGET(handler: OAuth2ACAuthorizationHandler<GetRefs>): this {
        this._handler = handler
        return this
    }

    validatePOST(handler: OAuth2ACAuthorizationHandler<PostRefs>): this {
        this._postHandler = handler
        return this
    }

    setGETResponseRenderer(renderer: AuthResponseRenderer<GetRefs>): this {
        this.#renderResponse = renderer
        return this
    }

    setPOSTResponseRenderer(renderer: AuthResponseRenderer<PostRefs>): this {
        this.#renderPOSTResponse = renderer
        return this
    }

    generateCode(handler: AuthCodeGenerator<PostRefs>): this {
        this.#generateCode = handler
        return this
    }

    /**
     * 
     * finalizeAuthorization() is called after the authorization code is generated. 
     * 
     * It must redirect the user back to the client's redirect_uri, or respond with an OAuth2 error.
     * 
     * example:
     * ```ts
     * route.finalizeAuthorization(async (ctx, params, req, h) => {
     *   return h.redirect(ctx.fullRedirectUri)
     * })
     * ```
     */
    finalizeAuthorization(handler: AuthResponseHandler<PostRefs>): this {
        this.#authorizationResponseHandler = handler
        return this
    }

    setClientId(value: string | null): this {
        this.#clientId = value
        return this
    }

    setRedirectUri(value: string | null): this {
        this.#redirectUri = value
        return this
    }

    setEmailField(value: string): this {
        const escaped = encodeURIComponent(encode(value))
        if (escaped)
            this.#emailField = escaped
        return this
    }

    setPasswordField(value: string): this {
        const escaped = encodeURIComponent(encode(value))
        if (escaped)
            this.#passwordField = escaped
        return this
    }
}

//#endregion Defaults