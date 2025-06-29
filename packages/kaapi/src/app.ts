import { KaapiServer, KaapiServerOptions } from '@kaapi/server';
import { IKaapiApp, KaapiBaseApp } from './baseApp';
import { createLogger, ILogger } from './services/log';
import { IMessaging, IMessagingSender, IMessagingSubscribeConfig } from './services/messaging';
import qs from 'qs'
import winston from 'winston';

export interface KaapiAppOptions extends KaapiServerOptions {
    logger?: ILogger,
    loggerOptions?: winston.LoggerOptions,
    messaging?: IMessaging
}

export class Kaapi extends KaapiBaseApp implements IKaapiApp {
    public readonly log;

    protected messaging?: IMessaging;

    #defaultServerOpts?: KaapiServerOptions

    constructor(opts?: KaapiAppOptions) {
        super()

        const { logger, loggerOptions, messaging, ...serverOpts } = opts || {}

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