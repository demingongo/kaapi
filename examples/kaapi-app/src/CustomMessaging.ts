import { IMessaging, IMessagingSender } from '@kaapi/kaapi'


export interface CustomMessagingSubscribeConfig {
    groupId: string
    readUncommitted?: boolean
}

export class CustomMessaging implements IMessaging {
    async publish<T = unknown>(topic: string, message: T): Promise<void> {
        console.log('CustomMessaging.publish:', topic, message)
        console.error('CustomMessaging.publish:', 'Method "publish" not implemented.')
    }
    async subscribe<T = unknown>(topic: string, handler: (message: T, sender: IMessagingSender) => Promise<void> | void, conf?: CustomMessagingSubscribeConfig): Promise<void> {
        console.log('CustomMessaging.subscribe:', topic, handler, conf)
        console.error('CustomMessaging.subscribe:', 'Method "subscribe" not implemented.')
    }

}