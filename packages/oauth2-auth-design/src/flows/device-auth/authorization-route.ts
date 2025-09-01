import {
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit
} from '@kaapi/kaapi'
import { PathValue } from '../common'

//#region AuthorizationRoute

export interface OAuth2DeviceAuthorizationParams {
    clientId: string
    scope?: string
}

export type OAuth2DeviceAuthorizationHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: OAuth2DeviceAuthorizationParams, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

export interface IOAuth2DeviceAuthorizationRoute<
    PostRefs extends ReqRef = ReqRefDefaults,
> {
    path: string,
    handler: OAuth2DeviceAuthorizationHandler<PostRefs>
}

export class OAuth2DeviceAuthorizationRoute<
    PostRefs extends ReqRef = ReqRefDefaults,
> implements IOAuth2DeviceAuthorizationRoute<PostRefs> {

    static buildDefault<
        PostRefs extends ReqRef = ReqRefDefaults,
    >() {
        return new DefaultOAuth2DeviceAuthorizationRoute<PostRefs>()
    }

    protected _path: string;
    protected _handler: OAuth2DeviceAuthorizationHandler<PostRefs>

    get path() {
        return this._path
    }

    get handler() {
        return this._handler
    }

    constructor(
        path: string,
        handler: OAuth2DeviceAuthorizationHandler<PostRefs>
    ) {
        this._path = path;
        this._handler = handler;
    }
}

//#endregion AuthorizationRoute

//#region Defaults

/**
 * 
 * example:
 * ```json
 * {
       "device_code": "abc123",
       "user_code": "XYZ-789",
       "verification_uri": "https://auth.example.com/activate",
       "verification_uri_complete": "https://auth.example.com/activate?user_code=XYZ-789",
       "expires_in": 1800,
       "interval": 5
 * }
 * ```
 */
export type DeviceCodeResponse = {
    /**
     * Used by the device to poll the token endpoint.
     */
    device_code: string;
    /**
     * Used by the end user to authorize the device.
     * 
     * Shown to the user to enter on the verification page.
     */
    user_code: string;
    /**
     * The end-user verification URI on the authorization server. This is where the user goes to authorize the device.
     * 
     * Where the user should go to enter the code.
     */
    verification_uri: string;
    /**
     * Optional convenience URI with the code pre-filled.
     * 
     * The verification URI, including the user code, that is presented to the user. This is a convenience for clients that can display URIs.
     * 
     * Where the user should go to enter the code (with the code embedded in the link).
     */
    verification_uri_complete?: string;
    /**
     * The lifetime in seconds of the device_code and user_code.
     * 
     * The expiration time of the device and user codes.
     */
    expires_in: number;
    /**
     * The minimum amount of time in seconds that the client MUST wait between polling requests to the token endpoint.
     * 
     * The minimum interval that the client MUST wait between polling requests to the token endpoint.
     */
    interval: number;
}

/**
 * Return null for invalid code
 */
export type DeviceCodeGenerator<Refs extends ReqRef = ReqRefDefaults> = (
    params: OAuth2DeviceAuthorizationParams,
    req: Request<Refs>
) => Promise<DeviceCodeResponse | null> | DeviceCodeResponse | null

export class DefaultOAuth2DeviceAuthorizationRoute<
    PostRefs extends ReqRef = ReqRefDefaults
> extends OAuth2DeviceAuthorizationRoute<PostRefs> {
    #clientId?: string | null

    #generateCode: DeviceCodeGenerator<PostRefs>

    constructor() {
        super('/oauth2/devicecode', async (props, req, h) => {
            if (this.#clientId && this.#clientId != props.clientId) {
                return h.response({
                    error: 'invalid_client',
                    errorMessage: 'Bad \'client_id\' parameter'
                }).code(400)
            }

            const code = await this.#generateCode(props, req)
            if (code) {
                return code
            } else {
                return h.response({
                    error: 'invalid_client',
                    errorMessage: 'Bad \'client_id\' parameter'
                }).code(400)
            }
        })

        // @TODO: generate id for user, store it in-memory, generate jwt code ?
        this.#generateCode = async () => null
    }

    setPath(path: PathValue): this {
        if (path)
            this._path = path
        return this
    }

    validate(handler: OAuth2DeviceAuthorizationHandler<PostRefs>): this {
        this._handler = handler
        return this
    }

    generateCode(handler: DeviceCodeGenerator<PostRefs>): this {
        this.#generateCode = handler
        return this
    }

    setClientId(value: string | null): this {
        this.#clientId = value
        return this
    }
}

//#endregion Defaults