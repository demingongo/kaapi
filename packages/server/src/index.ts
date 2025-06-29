import Hapi from '@hapi/hapi';
import Hoek from '@hapi/hoek'
import Boom from '@hapi/boom'

export type PartialServerRoute<Refs extends Hapi.ReqRef = Hapi.ReqRefDefaults> = Partial<Hapi.ServerRoute<Refs>>

export interface KaapiServerRoute<Refs extends Hapi.ReqRef = Hapi.ReqRefDefaults> extends PartialServerRoute<Refs> {
    /**
     * if true, it will set options.auth.startegy = 'kaapi'
     */
    auth?: boolean
}

export type KaapiAuthOptions = {
    tokenType?: string;
    validate?: (request: Hapi.Request<Hapi.ReqRefDefaults>, token: string, h: Hapi.ResponseToolkit<Hapi.ReqRefDefaults>) =>
        Promise<{ isValid?: boolean, artifacts?: unknown, credentials?: Hapi.AuthCredentials, message?: string, scheme?: string } | Hapi.Auth>
}

export interface KaapiServerOptions extends Hapi.ServerOptions {
    auth?: KaapiAuthOptions
}

export class KaapiServer<A = Hapi.ServerApplicationState> {

    #server: Hapi.Server<A>;

    get server() {
        return this.#server
    }

    constructor(opts?: KaapiServerOptions | undefined) {
        const { auth: authOpts, ...serverOpts } = opts || {}

        this.#server = Hapi.server(serverOpts)

        // register the auth scheme
        this.#server.auth.scheme('kaapi-auth', (_server, options) => {

            return {
                async authenticate(request, h) {

                    const settings: KaapiAuthOptions = Hoek.applyToDefaults({
                        tokenType: 'Bearer'
                    }, options || {});

                    //console.log('request.route.settings.plugins=', request.route.settings.plugins)

                    const authorization = request.raw.req.headers.authorization;

                    const authSplit = authorization ? authorization.split(/\s+/) : ['', ''];

                    const tokenType = authSplit[0]
                    let token = authSplit[1]

                    if (tokenType.toLowerCase() !== settings.tokenType?.toLowerCase()) {
                        token = ''
                    }

                    if (settings.validate) {
                        try {
                            const result = await settings.validate?.(request, token, h)

                            if (result && 'isAuth' in result) {
                                return result
                            }

                            if (result) {
                                const { isValid, credentials, artifacts, message, scheme } = result;

                                if (isValid && credentials) {
                                    return h.authenticated({ credentials, artifacts })
                                }

                                if (message) {
                                    return h.unauthenticated(Boom.unauthorized(message, scheme || settings.tokenType || ''), {
                                        credentials: credentials || {},
                                        artifacts
                                    })
                                }
                            }
                        } catch (err) {
                            console.error(err)
                            return Boom.internal(err instanceof Error ? err : `${err}`)
                        }
                    }

                    return h.unauthenticated(Boom.unauthorized(), { credentials: {} })
                },
            }
        });

        // register the auth startegy
        this.#server.auth.strategy('kaapi', 'kaapi-auth', authOpts);
    }

    route<Refs extends Hapi.ReqRef = Hapi.ReqRefDefaults>(
        serverRoute: KaapiServerRoute<Refs>,
        handler: Hapi.HandlerDecorations | Hapi.Lifecycle.Method<Refs, Hapi.Lifecycle.ReturnValue<Refs>>): this {
        // Set defaults
        if (!serverRoute.method) serverRoute.method = '*';
        if (!serverRoute.path) serverRoute.path =  '/{any*}';

        const { auth, ...route } = serverRoute

        if (auth &&
            (!route.options ||
                typeof route.options != 'function' && (
                    !route.options.auth ||
                    typeof route.options.auth === 'object' &&
                    !route.options.auth.strategy)
            )) {
            if (!route.options) {
                route.options = {}
            }
            if (!route.options.auth) {
                route.options.auth = {}
            }
            if (typeof route.options.auth === 'object') {
                route.options.auth.strategy = 'kaapi'
            }
        }

        route.handler = handler

        this.#server.route(route as Hapi.ServerRoute<Refs>);

        return this;
    }
}
