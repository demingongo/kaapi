export interface IMessagingContext {
    id?: string
    name?: string
    timestamp?: string
    [x: string]: string | undefined
}

export type IMessagingSubscribeConfig = object

export interface IPublishMethod {
    <T = unknown>(topic: string, message: T): Promise<void>
}

export interface ISubscribeMethod {
    <T = unknown>(topic: string, handler: (message: T, context: IMessagingContext) => Promise<void> | void, conf?: IMessagingSubscribeConfig): Promise<void>
}

export interface IMessaging {
    publish<T = unknown>(topic: string, message: T): Promise<void>
    subscribe<T = unknown>(topic: string, handler: (message: T, context: IMessagingContext) => Promise<void> | void, conf?: IMessagingSubscribeConfig): Promise<void>
    shutdown?(): Promise<unknown>
}
