import { KaviServer, KaviServerOptions } from '@kavi/server';
import { IKaviApp, KaviBaseApp } from './baseApp';
import { createLogger, ILogger } from './services/log';
import { IMessaging, IMessagingSender, IMessagingSubscribeConfig } from './services/messaging';
import qs from 'qs'
import winston from 'winston';

export interface KaviAppOptions extends KaviServerOptions {
    logger?: ILogger,
    loggerOptions?: winston.LoggerOptions,
    messaging?: IMessaging
}

export class Kavi extends KaviBaseApp implements IKaviApp {
    public readonly log;

    protected messaging?: IMessaging;

    #defaultServerOpts?: KaviServerOptions

    constructor(opts?: KaviAppOptions) {
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

    private _createServer(opts: KaviServerOptions = {}): KaviServer {
        return new KaviServer({
            ...(this.#defaultServerOpts || {}),
            query: {
                parser: (query) => qs.parse(query)
            },
            ...opts
        })
    }

    private async _startServer() {
        await this.kaviServer?.server.start()
        this.log.verbose('📢  Server listening on %s', this.kaviServer?.server.info.uri);
        this.log.verbose(`${this.kaviServer?.server.info.id} ${this.kaviServer?.server.info.started ? new Date(this.kaviServer.server.info.started) : this.kaviServer?.server.info.started}`);
    }

    /**
     * Initializes and starts the server if needed and returns it
     */
    server(opts?: KaviServerOptions): KaviServer {
        if (!this.kaviServer) {
            this.kaviServer = this._createServer(opts);
            this._startServer()
        }
        return this.kaviServer
    }

    /**
     * Initializes and starts the server if needed and returns it
     */
    async serverAsync(opts?: KaviServerOptions): Promise<KaviServer> {
        if (!this.kaviServer) {
            this.kaviServer = this._createServer(opts);
            await this._startServer()
        }
        return this.kaviServer
    }

    /**
     * Initializes and starts the server if needed and returns it
     */
    async listen(port?: string | number, host?: string): Promise<KaviServer> {
        let r = this.kaviServer
        if (!r) {
            const opts: KaviServerOptions = {
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