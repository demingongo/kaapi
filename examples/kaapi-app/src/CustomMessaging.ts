import { IMessaging, IMessagingSender } from '@kaapi/kaapi'


export interface CustomMessagingSubscribeConfig {
    groupId: string
    readUncommitted?: boolean
}

export class CustomMessaging implements IMessaging {
    async publish<T = unknown>(topic: string, message: T): Promise<void> {
        console.log(topic, message)
        console.error('Method "publish" not implemented.')
    }
    async subscribe<T = unknown>(topic: string, handler: (message: T, sender: IMessagingSender) => Promise<void> | void, conf?: CustomMessagingSubscribeConfig): Promise<void> {
        console.log(topic, handler, conf)
        console.error('Method "subscribe" not implemented.')
    }
    
}