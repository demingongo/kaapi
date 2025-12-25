import {
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit
} from '@kaapi/kaapi'
import { encode } from 'html-entities'
import { AnyOAuth2ErrorCodeType, OAuth2ErrorBody, OAuth2ErrorCode, PathValue } from '../common'

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

export type AuthResponseRenderer<Refs extends ReqRef = ReqRefDefaults> = (
    context: {
        statusCode: number,
        usernameField: string,
        passwordField: string,
        error?: AnyOAuth2ErrorCodeType,
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
            usernameField: string,
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
const render: AuthResponseRenderer<any> = ({ error, errorMessage, usernameField, passwordField }) => {
    if (error && ['invalid_client'].includes(error)) {
        return { error, error_description: errorMessage } as OAuth2ErrorBody
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Sign in</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #111827;
      --accent: #6366f1;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --ring: rgba(99,102,241,.35);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: radial-gradient(1200px 600px at 20% 0%, #1f2937, var(--bg));
      font-family: system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--text);
    }
    .card {
      width: 92%; max-width: 380px; padding: 26px 24px; border-radius: 16px;
      background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: 0 20px 50px rgba(0,0,0,.35);
      backdrop-filter: blur(8px);
    }
    .error {
      background: rgba(239,68,68,.15);
      color: #f87171;
      border: 1px solid rgba(239,68,68,.4);
      padding: 10px 14px;
      border-radius: 10px;
      font-size: .9rem;
      margin-bottom: 14px;
    }
    .title { font-size: 1.25rem; font-weight: 600; letter-spacing: .2px; margin: 0 0 8px; }
    .subtitle { color: var(--muted); font-size: .95rem; margin: 0 0 18px; }
    label { display: block; font-size: .85rem; color: var(--muted); margin: 12px 0 8px; }
    .field {
      display: flex; align-items: center; gap: 8px;
      background: #0b1220; border: 1px solid rgba(255,255,255,.08);
      padding: 12px 14px; border-radius: 12px;
      transition: border-color .2s, box-shadow .2s, transform .05s;
    }
    .field:focus-within {
      border-color: var(--accent); box-shadow: 0 0 0 4px var(--ring);
    }
    .field input {
      all: unset; flex: 1; color: var(--text); caret-color: var(--accent);
    }
    .icon {
      width: 18px; height: 18px; opacity: .7;
      filter: drop-shadow(0 1px 0 rgba(0,0,0,.35));
    }
    .actions { margin-top: 18px; display: flex; align-items: center; justify-content: space-between; }
    .btn {
      appearance: none; border: none; cursor: pointer;
      background: linear-gradient(135deg, #7c3aed, var(--accent));
      color: white; padding: 12px 16px; border-radius: 12px; font-weight: 600;
      box-shadow: 0 10px 20px rgba(99,102,241,.35); transition: transform .05s, filter .2s;
    }
    .btn:hover { filter: brightness(1.05); }
    .btn:active { transform: translateY(1px); }
  </style>
</head>
 <body>
  <form class="card" method="POST">
    <p class="subtitle">Sign in to continue</p>
    ${errorMessage
            ? `<p class="error" id="error-message">
        ${errorMessage}
    </p>`
            : ''
        }

    <label for="${usernameField}">${usernameField}</label>
    <div class="field">
      <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.42 0-8 2.18-8 4.87V21h16v-2.13C20 16.18 16.42 14 12 14Z"/>
      </svg>
      <input id="${usernameField}" name="${usernameField}" type="text" placeholder="${usernameField}" autocomplete="${usernameField}"/>
    </div>

    <label for="${passwordField}">${passwordField}</label>
    <div class="field">
      <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17 8V7a5 5 0 0 0-10 0v1H5v12h14V8Zm-8 0V7a3 3 0 0 1 6 0v1Z"/>
      </svg>
      <input id="${passwordField}" name="${passwordField}" type="password" placeholder="••••••••" autocomplete="current-password"/>
    </div>

    <div class="actions">
      <button class="btn" type="submit">Sign in</button>
    </div>
  </form>
</body>
</html>`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authResponseHandler: AuthResponseHandler<any> = async (ctx, _params, _req, h) => {
    return h.redirect(`${ctx.fullRedirectUri}`)
}

function buildRedirectUri(base: string, params: Record<string, string>): string {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            searchParams.append(key, value)
        }
    }
    return `${base}?${searchParams.toString()}`
}

export class DefaultOAuth2ACAuthorizationRoute<
    GetRefs extends ReqRef = ReqRefDefaults,
    PostRefs extends ReqRef = ReqRefDefaults,
> extends OAuth2ACAuthorizationRoute<GetRefs, PostRefs> {
    #clientId?: string | null
    #redirectUri?: string | null

    #usernameField = 'username'
    #passwordField = 'password'

    #generateCode: AuthCodeGenerator<PostRefs>
    #renderResponse: AuthResponseRenderer<GetRefs>
    #renderPOSTError: AuthResponseRenderer<PostRefs>
    #authorizationResponseHandler: AuthResponseHandler<PostRefs>

    constructor() {
        super('/oauth2/authorize', async ({ clientId, redirectUri, ...props }, req, h) => {
            const validationError = await this.validateClientParams(clientId, redirectUri, { clientId, redirectUri, ...props }, req, h, this.#renderResponse)
            if (validationError) return validationError

            // render form
            return await this.#renderResponse({
                usernameField: this.#usernameField,
                passwordField: this.#passwordField,
                statusCode: 200
            }, { clientId, redirectUri, ...props }, req, h)
        }, async (props, req, h) => {
            const validationError = await this.validateClientParams(props.clientId, props.redirectUri, props, req, h, this.#renderResponse)
            if (validationError) return validationError

            let error: AnyOAuth2ErrorCodeType = OAuth2ErrorCode.SERVER_ERROR
            let errorMessage = 'something went wrong'
            let statusCode: 400 | 401 = 400

            if (
                props.clientId &&
                req.payload &&
                typeof req.payload === 'object' &&
                !Array.isArray(req.payload)/*&&
                this.#usernameField in req.payload &&
                this.#passwordField in req.payload
                */
            ) {
                const code = await this.#generateCode(props, req, h);
                if (code) {
                    let fullRedirectUri = '';
                    if (code.type === 'code' && code.value) {
                        fullRedirectUri = buildRedirectUri(props.redirectUri, {
                            code: code.value,
                            state: props.state ?? ''
                        });
                    } else if (code.type === 'deny') {
                        fullRedirectUri = buildRedirectUri(props.redirectUri, {
                            error: OAuth2ErrorCode.ACCESS_DENIED,
                            error_description: 'User denied consent',
                            state: props.state ?? ''
                        });
                    } else {
                        fullRedirectUri = buildRedirectUri(props.redirectUri, {
                            error: OAuth2ErrorCode.INVALID_REQUEST,
                            error_description: 'No code',
                            state: props.state ?? ''
                        });
                    }
                    return this.#authorizationResponseHandler({
                        authorizationResult: code,
                        usernameField: this.#usernameField,
                        passwordField: this.#passwordField,
                        fullRedirectUri
                    }, props, req, h)
                } else {
                    error = OAuth2ErrorCode.ACCESS_DENIED
                    errorMessage = 'wrong credentials'
                    statusCode = 401
                }
            } else {
                error = OAuth2ErrorCode.INVALID_REQUEST
                errorMessage = 'Missing or invalid request payload'
            }

            // render form
            return h.response(
                await this.#renderPOSTError(
                    {
                        usernameField: this.#usernameField,
                        passwordField: this.#passwordField,
                        statusCode: statusCode,
                        error: error,
                        errorMessage
                    },
                    props,
                    req, h)).code(statusCode)
        })

        // @TODO: generate id for user, store it in-memory, generate jwt code ?
        this.#generateCode = async () => null
        this.#renderResponse = render
        this.#renderPOSTError = render
        this.#authorizationResponseHandler = authResponseHandler
    }

    /**
     * Creates a new `DefaultOAuth2ACAuthorizationRoute` instance from the provided configuration.
     */
    static fromConfig<
        GetRefs extends ReqRef = ReqRefDefaults,
        PostRefs extends ReqRef = ReqRefDefaults,
    >(config: {
        path?: PathValue,
        clientId?: string,
        redirectUri?: string,
        usernameField?: string,
        passwordField?: string,
        codeGenerator?: AuthCodeGenerator<PostRefs>,
        responseRenderer?: AuthResponseRenderer<GetRefs>,
        postErrorRenderer?: AuthResponseRenderer<PostRefs>,
        finalizeAuthorization?: AuthResponseHandler<PostRefs>
    }) {
        const instance = new DefaultOAuth2ACAuthorizationRoute<GetRefs, PostRefs>()
        if (config.path) instance.setPath(config.path)
        if (config.clientId) instance.setClientId(config.clientId)
        if (config.redirectUri) instance.setRedirectUri(config.redirectUri)
        if (config.usernameField) instance.setUsernameField(config.usernameField)
        if (config.passwordField) instance.setPasswordField(config.passwordField)
        if (config.codeGenerator) instance.generateCode(config.codeGenerator)
        if (config.responseRenderer) instance.setGETResponseRenderer(config.responseRenderer)
        if (config.postErrorRenderer) instance.setPOSTErrorRenderer(config.postErrorRenderer)
        if (config.finalizeAuthorization) instance.finalizeAuthorization(config.finalizeAuthorization)
        return instance
    }

    private async validateClientParams(
        clientId: string,
        redirectUri: string,
        props: OAuth2ACAuthorizationParams,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req: Request<any>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        h: ResponseToolkit<any>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderer: AuthResponseRenderer<any>
    ) {
        if (this.#clientId && this.#clientId !== clientId) {
            return h.response(await renderer({
                usernameField: this.#usernameField,
                passwordField: this.#passwordField,
                statusCode: 400,
                error: OAuth2ErrorCode.INVALID_CLIENT,
                errorMessage: 'Bad \'client_id\' parameter'
            }, props, req, h)).code(400)
        }

        if (this.#redirectUri && this.#redirectUri !== redirectUri) {
            return h.response(await renderer({
                usernameField: this.#usernameField,
                passwordField: this.#passwordField,
                statusCode: 400,
                error: OAuth2ErrorCode.INVALID_CLIENT,
                errorMessage: 'Bad \'redirect_uri\' parameter'
            }, props, req, h)).code(400)
        }

        return null
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

    setPOSTErrorRenderer(renderer: AuthResponseRenderer<PostRefs>): this {
        this.#renderPOSTError = renderer
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

    setUsernameField(value: string): this {
        const escaped = encode(value) // For HTML rendering, use encode() (from html-entities)
        if (escaped)
            this.#usernameField = escaped
        return this
    }

    setPasswordField(value: string): this {
        const escaped = encode(value) // For HTML rendering, use encode() (from html-entities)
        if (escaped)
            this.#passwordField = escaped
        return this
    }
}

//#endregion Defaults