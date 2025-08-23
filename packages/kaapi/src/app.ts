import { KaapiServer, KaapiServerOptions, KaapiServerRoute } from '@kaapi/server';
import { IKaapiApp, AbstractKaapiApp } from './abstract-app';
import { createLogger, ILogger } from './services/log';
import { IMessaging, IMessagingSender, IMessagingSubscribeConfig } from './services/messaging';
import qs from 'qs'
import winston from 'winston';
import { createDocsRouter, DocsConfig, DocsUIOptions } from './services/docs/docs';
import { KaapiOpenAPI, KaapiPostman } from './services/docs/generators';
import { HandlerDecorations, Lifecycle, ReqRef, ReqRefDefaults, Server } from '@hapi/hapi';
import { KaapiPlugin, KaapiTools } from './services/plugins/plugin';

export interface KaapiAppOptions extends KaapiServerOptions {
    logger?: ILogger,
    loggerOptions?: winston.LoggerOptions,
    messaging?: IMessaging,
    docs?: DocsConfig,
    extend?: KaapiPlugin[] | KaapiPlugin
}

export class Kaapi extends AbstractKaapiApp implements IKaapiApp {
    public readonly log;

    protected messaging?: IMessaging;

    protected docs: { openapi: KaapiOpenAPI, postman: KaapiPostman }

    get openapi() {
        return this.docs.openapi
    }

    get postman() {
        return this.docs.postman
    }

    #defaultServerOpts?: KaapiServerOptions

    #docsDisabled: boolean = false

    #docsPath: string = '/docs/api'

    #docsOptions: DocsUIOptions = {}

    #serverStarted = false

    constructor(opts?: KaapiAppOptions) {
        super()

        const { logger, loggerOptions, messaging, docs, extend, ...serverOpts } = opts || {}

        this.#defaultServerOpts = serverOpts

        this.log = logger || createLogger({
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.splat(),
                        winston.format.simple()
                    ),
                }),
            ],
            ...(loggerOptions || {})
        })
        this.messaging = messaging

        if (!this.messaging) {
            this.log.verbose('🙉 No messaging service!')
        } else {
            this.log.verbose('💬 Messaging service activated!')
        }

        this.docs = {
            openapi: new KaapiOpenAPI(docs?.openAPIOptions),
            postman: new KaapiPostman(docs?.postmanOptions)
        }

        if (docs?.disabled) {
            this.#docsDisabled = !!(docs.disabled)
        }

        if (docs?.path) {
            this.#docsPath = docs.path
        }

        if (docs?.title) {
            this.docs.openapi.setTitle(docs?.title);
            this.docs.postman.setName(docs?.title);
        } else {
            this.docs.openapi.setTitle('API documentation');
            this.docs.postman.setName('API documentation');
        }

        if (docs?.consumes) {
            this.docs.openapi.setConsumes(docs?.consumes);
            this.docs.postman.setConsumes(docs?.consumes);
        } else {
            this.docs.openapi.setConsumes(['application/json']);
            this.docs.postman.setConsumes(['application/json']);
        }

        if (docs?.license) {
            if (typeof docs?.license === 'string')
                this.docs.openapi.setLicense(docs?.license);
            else
                this.docs.openapi.setLicense(docs?.license);
        }

        if (docs?.version) {
            this.docs.openapi.setVersion(docs.version);
            this.docs.postman.setVersion(docs.version);
        }

        if (docs?.host?.url) {
            const hostUrl = docs.host.url;
            const regex = /(?<=(?<!\{)\{)[^{}]*(?=\}(?!\}))/g;
            const variables = docs.host.variables;

            this.docs.openapi.setServers(docs.host);

            this.docs.postman.setHost(hostUrl.replace(regex, match => {
                return `{${match}}`
            }));

            if (variables && Object.keys(variables).length) {
                Object.keys(variables).forEach(
                    varName => {
                        this.docs.postman.addVariable({
                            description: variables[varName].description,
                            key: varName,
                            name: varName,
                            value: variables[varName].default
                        })
                    }
                )
            }
        }

        if (docs?.security) {
            this.docs.openapi.addSecurityScheme(docs?.security)
                .setDefaultSecurity(docs?.security);
            this.docs.postman.setDefaultSecurity(docs?.security);
        }

        if (docs?.examples) {
            this.docs.openapi.setExamples(docs.examples);
        }

        if (docs?.schemas) {
            this.docs.openapi.setSchemas(docs.schemas);
        }

        if (docs?.responses) {
            this.docs.openapi.setResponses(docs?.responses);
        }

        if (docs?.tags) {
            for (const tag of docs.tags) {
                this.docs.openapi.addTag({
                    name: tag.name,
                    description: tag.description,
                    externalDocs: tag.externalDocs
                });
                this.docs.postman.addFolder({
                    item: [],
                    auth: tag.auth,
                    description: tag.description,
                    event: tag.event,
                    name: tag.name,
                    protocolProfileBehavior: tag.protocolProfileBehavior,
                    variable: tag.variable
                });
            }
        }

        if (docs?.ui) {
            this.#docsOptions = docs.ui
        }

        if (extend) {
            this.extend(extend)
                .catch(err => {
                    this.log.error('Error while extending (app.extend)', err)
                }).finally(() => {
                    this._createDocsRouter()
                })
        } else {
            this._createDocsRouter()
        }
    }

    private _createDocsRouter() {
        if (!this.#docsDisabled) {
            const [route, handler] = createDocsRouter(
                this.#docsPath,
                this.docs,
                this.#docsOptions
            )
            this.server().route(route, handler)
        }
    }

    private _createServer(): KaapiServer {
        return new KaapiServer({
            query: {
                parser: (query) => qs.parse(query)
            },
            ...(this.#defaultServerOpts || {})
        })
    }

    private async _startServer() {
        await this.kaapiServer?.base.start()
        this.#serverStarted = true
        this.log.verbose('📢  Server listening on %s', this.kaapiServer?.base.info.uri);
        this.log.verbose(`${this.kaapiServer?.base.info.id} ${this.kaapiServer?.base.info.started ? new Date(this.kaapiServer.base.info.started) : this.kaapiServer?.base.info.started}`);
    }

    /**
     * Initializes and starts the server if needed and returns it
     */
    server(): KaapiServer {
        if (!this.kaapiServer) {
            this.kaapiServer = this._createServer();
        }
        return this.kaapiServer
    }

    /**
     * Initializes the server and returns it without starting it
     */
    base(): Server {
        const server = this.server()
        return server.base
    }

    /**
     * Initializes and starts the server if needed and returns it
     */
    async listen(): Promise<KaapiServer> {
        const server = this.server()
        if (!this.#serverStarted) {
            await this._startServer()
        }
        return server
    }

    /**
     * Stops the server's listener by refusing to accept any new connections or requests (existing connections will continue until closed or timeout), where:
     * @param options - (optional) object with:
     * * timeout - overrides the timeout in millisecond before forcefully terminating a connection. Defaults to 5000 (5 seconds).
     * @return Return value: none.
     * [See docs](https://github.com/hapijs/hapi/blob/master/API.md#-await-serverstopoptions)
     */
    async stop(options?: { timeout: number; }): Promise<void> {
        return await this.kaapiServer?.base.stop(options)
    }

    route<Refs extends ReqRef = ReqRefDefaults>(
        serverRoute: KaapiServerRoute<Refs>,
        handler?: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>) {
        this.docs.openapi.addRoutes(serverRoute)
        this.docs.postman.addRoutes(serverRoute)
        return super.route(serverRoute, handler)
    }

    refreshDocs() {
        if (!this.kaapiServer) return

        this.docs.openapi.removeAll();
        this.docs.postman.removeAll();

        this.kaapiServer.base.table().forEach(
            v => {
                this.docs.openapi.addRequestRoute(v);
                this.docs.postman.addRequestRoute(v);
            }
        )
    }

    async emit<T = unknown>(topic: string, message: T): Promise<void> {
        return await this.messaging?.publish(topic, message)
    }
    async on<T = unknown>(topic: string, handler: (message: T, sender: IMessagingSender) => Promise<void> | void, conf?: IMessagingSubscribeConfig): Promise<void> {
        return await this.messaging?.subscribe(topic, handler, conf)
    }
    async publish<T = unknown>(topic: string, message: T): Promise<void> {
        return await this.messaging?.publish(topic, message)
    }
    async subscribe<T = unknown>(topic: string, handler: (message: T, sender: IMessagingSender) => Promise<void> | void, conf?: IMessagingSubscribeConfig): Promise<void> {
        return await this.messaging?.subscribe(topic, handler, conf)
    }

    async extend(plugins: KaapiPlugin[] | KaapiPlugin) {
        const getCurrentApp = () => this
        const getDocs = () => this.docs
        const tool: KaapiTools = {
            log: this.log,
            route<Refs extends ReqRef = ReqRefDefaults>(serverRoute: KaapiServerRoute<Refs>, handler?: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>) {
                getDocs().openapi.addRoutes(serverRoute)
                getDocs().postman.addRoutes(serverRoute)
                getCurrentApp().server().route(serverRoute, handler)
                return this
            },
            scheme: this.base().auth.scheme.bind(this.base().auth),
            strategy: this.base().auth.strategy.bind(this.base().auth),
            openapi: this.openapi,
            postman: this.postman,
            server: this.base()
        }

        const values = Array.isArray(plugins) ? plugins : [plugins]

        for (const plugin of values) {
            await plugin.integrate(tool)
        }
    }
}