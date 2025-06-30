import { KaapiServer, KaapiServerOptions, KaapiServerRoute } from '@kaapi/server';
import { IKaapiApp, KaapiBaseApp } from './baseApp';
import { createLogger, ILogger } from './services/log';
import { IMessaging, IMessagingSender, IMessagingSubscribeConfig } from './services/messaging';
import qs from 'qs'
import winston from 'winston';
import { Postman } from '@novice1/api-doc-generator';
import { createDocsRouter, DocsConfig, DocsOptions } from './services/docs/docs';
import { KaapiOpenAPI } from './services/docs/generators';
import { HandlerDecorations, Lifecycle, ReqRef, ReqRefDefaults } from '@hapi/hapi';

export interface KaapiAppOptions extends KaapiServerOptions {
    logger?: ILogger,
    loggerOptions?: winston.LoggerOptions,
    messaging?: IMessaging,
    docs?: DocsConfig
}

export class Kaapi extends KaapiBaseApp implements IKaapiApp {
    public readonly log;

    protected messaging?: IMessaging;

    protected docs: { openapi: KaapiOpenAPI, postman: Postman }

    get openapi() {
        return this.docs.openapi
    }

    get postman() {
        return this.docs.postman
    }

    #defaultServerOpts?: KaapiServerOptions

    #docsDisabled: boolean = false

    #docsPath: string = '/docs/api'

    #docsOptions: DocsOptions = {}

    constructor(opts?: KaapiAppOptions) {
        super()

        const { logger, loggerOptions, messaging, docs, ...serverOpts } = opts || {}

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
            postman: new Postman(docs?.postmanOptions)
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

        if (docs?.options) {
            this.#docsOptions = docs.options
        }

        if (!this.#docsDisabled) {
            const [route, handler] = createDocsRouter(
                this.#docsPath,
                this.docs,
                this.#docsOptions
            )
            this.server().route(route, handler)
        }
    }

    private _createServer(opts: KaapiServerOptions = {}): KaapiServer {
        return new KaapiServer({
            ...(this.#defaultServerOpts || {}),
            query: {
                parser: (query) => qs.parse(query)
            },
            ...opts
        })
    }

    private async _startServer() {
        await this.kaapiServer?.server.start()
        this.log.verbose('📢  Server listening on %s', this.kaapiServer?.server.info.uri);
        this.log.verbose(`${this.kaapiServer?.server.info.id} ${this.kaapiServer?.server.info.started ? new Date(this.kaapiServer.server.info.started) : this.kaapiServer?.server.info.started}`);
    }

    /**
     * Initializes and starts the server if needed and returns it
     */
    server(opts?: KaapiServerOptions): KaapiServer {
        if (!this.kaapiServer) {
            this.kaapiServer = this._createServer(opts);
            this._startServer()
        }
        return this.kaapiServer
    }

    /**
     * Initializes and starts the server if needed and returns it
     */
    async serverAsync(opts?: KaapiServerOptions): Promise<KaapiServer> {
        if (!this.kaapiServer) {
            this.kaapiServer = this._createServer(opts);
            await this._startServer()
        }
        return this.kaapiServer
    }

    /**
     * Initializes and starts the server if needed and returns it
     */
    async listen(port?: string | number, host?: string): Promise<KaapiServer> {
        let r = this.kaapiServer
        if (!r) {
            const opts: KaapiServerOptions = {
                port,
                host
            };
            r = await this.serverAsync(opts)
        }
        return r
    }

    route<Refs extends ReqRef = ReqRefDefaults>(
        serverRoute: KaapiServerRoute<Refs>,
        handler: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>) {
        this.docs.openapi.addRoutes(serverRoute)
        return super.route(serverRoute, handler)
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
}