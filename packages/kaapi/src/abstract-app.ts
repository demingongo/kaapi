import type { KaapiOpenAPIHelperClass } from './services/docs/generators';
import type { RouteModifierObject } from './services/docs/modifiers';
import { IKaapiAppLogger } from './services/log';
import {
    IMessaging,
    IMessagingContext,
    IMessagingSubscribeConfig,
    IPublishMethod,
    ISubscribeMethod,
} from './services/messaging';
import { HandlerDecorations, Lifecycle, ReqRef, ReqRefDefaults } from '@hapi/hapi';
import { KaapiServerRoute, KaapiServer, KaapiServerOptions } from '@kaapi/server';

export interface KaapiPluginConfiguration {
    docs?:
        | {
              disabled?: boolean;
              openAPIHelperClass?: KaapiOpenAPIHelperClass;
              helperSchemaProperty?: string;
              modifiers?: () => RouteModifierObject;
          }
        | false;
}

export interface IKaapiApp extends IMessaging {
    log: IKaapiAppLogger;
    emit: IPublishMethod;
    on: ISubscribeMethod;
    server(): KaapiServer;
    route<Refs extends ReqRef = ReqRefDefaults>(
        serverRoute: KaapiServerRoute<Refs>,
        handler?: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>
    ): this;
}

export abstract class AbstractKaapiApp implements IKaapiApp {
    abstract log: IKaapiAppLogger;
    abstract emit<T = unknown>(topic: string, message: T): Promise<void>;
    abstract on<T = unknown>(
        topic: string,
        handler: (message: T, context: IMessagingContext) => void | Promise<void>,
        conf?: IMessagingSubscribeConfig | undefined
    ): Promise<void>;
    abstract publish<T = unknown>(topic: string, message: T): Promise<void>;
    abstract subscribe<T = unknown>(
        topic: string,
        handler: (message: T, context: IMessagingContext) => void | Promise<void>,
        conf?: IMessagingSubscribeConfig | undefined
    ): Promise<void>;
    abstract server(opts?: KaapiServerOptions): KaapiServer;

    protected version?: string;

    protected kaapiServer?: KaapiServer;

    route<Refs extends ReqRef = ReqRefDefaults>(
        serverRoute: KaapiServerRoute<Refs>,
        handler?: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>
    ) {
        this.server().route<Refs>(serverRoute, handler);
        return this;
    }

    toString() {
        let result = `${this.version || '0.0.0'}`;
        if (this.kaapiServer) {
            result += `, server: ${this.kaapiServer?.base.info.uri}, `;
            result += `state: ${this.kaapiServer?.base.info.started ? new Date(this.kaapiServer?.base.info.started) : 'STOPPED'}`;
        }
        return result;
    }

    [Symbol.for('nodejs.util.inspect.custom')]() {
        return `${this.constructor.name} <${this.toString()}>`;
    }
}
