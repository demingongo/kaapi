import {
    HandlerDecorations,
    Lifecycle,
    ReqRef,
    ReqRefDefaults
} from '@hapi/hapi';
import { KaviServerRoute, KaviServer, KaviServerOptions } from '@kavi/server';
import { ILogger } from './services/log';
import { IMessaging, IMessagingSender, IMessagingSubscribeConfig, IPublishMethod, ISubscribeMethod } from './services/messaging';

export interface IKaviApp extends IMessaging {
    log: ILogger
    emit: IPublishMethod
    on: ISubscribeMethod
    server(): KaviServer;
    route<Refs extends ReqRef = ReqRefDefaults>(
        serverRoute: KaviServerRoute<Refs>,
        handler: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>): this
}

export abstract class KaviBaseApp implements IKaviApp {
    abstract log: ILogger
    abstract emit<T = unknown>(topic: string, message: T): Promise<void>
    abstract on<T = unknown>(topic: string, handler: (message: T, sender: IMessagingSender) => void | Promise<void>, conf?: IMessagingSubscribeConfig | undefined): Promise<void>
    abstract publish<T = unknown>(topic: string, message: T): Promise<void>
    abstract subscribe<T = unknown>(topic: string, handler: (message: T, sender: IMessagingSender) => void | Promise<void>, conf?: IMessagingSubscribeConfig | undefined): Promise<void>
    abstract server(opts?: KaviServerOptions): KaviServer;

    protected version?: string

    protected kaviServer?: KaviServer;

    route<Refs extends ReqRef = ReqRefDefaults>(
        serverRoute: KaviServerRoute<Refs>,
        handler: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>) {
        this.server().route<Refs>(serverRoute, handler)
        return this
    }

    toString() {
        let result = `${this.version} || 0.0.0`
        if (this.kaviServer) {
            result += `, server: ${this.kaviServer?.server.info.uri}, `
            result += `state: ${this.kaviServer?.server.info.started ? new Date(this.kaviServer?.server.info.started) : 'STOPPED'}`
        }
        return result
    }

    [Symbol.for('nodejs.util.inspect.custom')]() {
        return `${this.constructor.name} <${this.toString()}>`;
    }
}