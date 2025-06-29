export interface IMessagingSender {
    name?: string,
    service?: string,
    timestamp?: string,
    uuid?: string,
    [x: string]: string | undefined
}

export interface IMessagingSubscribeConfig {
    [x: string]: unknown | undefined
}

export interface IPublishMethod {
    <T = unknown>(topic: string, message: T): Promise<void>
}

export interface ISubscribeMethod {
    <T = unknown>(topic: string, handler: (message: T, sender: IMessagingSender) => Promise<void> | void, conf?: IMessagingSubscribeConfig): Promise<void>
}

export interface IMessaging {
    publish<T = unknown>(topic: string, message: T): Promise<void>
    subscribe<T = unknown>(topic: string, handler: (message: T, sender: IMessagingSender) => Promise<void> | void, conf?: IMessagingSubscribeConfig): Promise<void>
}
