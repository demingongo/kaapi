import {
    HandlerDecorations,
    Lifecycle,
    //PluginSpecificConfiguration,
    //Request,
    ReqRefDefaults,
    //ResponseToolkit,
    //RouteOptions,
    Server,
    ServerRoute,
    //ServerOptions,
    //server,
    //RequestRoute,
    //RouteSettings,
    ReqRef,
    ServerOptions,
    ServerApplicationState,
    server
    //RequestQuery,
    //RequestApplicationState,
    //UserCredentials,
    //AppCredentials,
    //ServerAuthSchemeObjectApi,
    //RouteRules,
    //RouteOptionsApp,
    //InternalRequestDefaults
} from '@hapi/hapi';
//import stream from 'node:stream'
import Hoek from '@hapi/hoek'
import Boom from '@hapi/boom'
import { KaviAuthOptions } from './auth';

export type PartialServerRoute<Refs extends ReqRef = ReqRefDefaults> = Partial<ServerRoute<Refs>>

export interface KaviServerRoute<Refs extends ReqRef = ReqRefDefaults> extends PartialServerRoute<Refs> {
    /**
     * if true, it will set options.auth.startegy = 'kavi'
     */
    auth?: boolean
}

/*
export interface KaviRequestDefaults extends InternalRequestDefaults {
    Server: Server;

    Payload: stream.Readable | Buffer | string | object;
    Query: RequestQuery;
    Params: Record<string, any>;
    Pres: Record<string, any>;
    Headers: Record<string, any>;
    RequestApp: RequestApplicationState;

    AuthUser: UserCredentials;
    AuthApp: AppCredentials;
    AuthApi: ServerAuthSchemeObjectApi;
    AuthCredentialsExtra: Record<string, unknown>;
    AuthArtifactsExtra: Record<string, unknown>;

    Rules: RouteRules;
    Bind: object | null;
    RouteApp: RouteOptionsApp;
}
    */

export interface KaviServerOptions extends ServerOptions {
    auth?: KaviAuthOptions
}

export class KaviServer<A = ServerApplicationState> {

    #server: Server<A>;

    get server() {
        return this.#server
    }

    constructor(opts?: KaviServerOptions | undefined) {
        const { auth: authOpts, ...serverOpts } = opts || {}

        this.#server = server(serverOpts)

        // register the auth scheme
        this.#server.auth.scheme('kavi-auth', (_server, options) => {

            return {
                async authenticate(request, h) {

                    const settings: KaviAuthOptions = Hoek.applyToDefaults({
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
        this.#server.auth.strategy('kavi', 'kavi-auth', authOpts);
    }

    route<Refs extends ReqRef = ReqRefDefaults>(
        serverRoute: KaviServerRoute<Refs>,
        handler: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>): this {
        // Set defaults
        if (!serverRoute.method) serverRoute.method = '*';
        if (!serverRoute.path) serverRoute.path = '/';

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
                route.options.auth.strategy = 'kavi'
            }
        }

        route.handler = handler

        this.#server.route(route as ServerRoute<Refs>);

        return this;
    }
}