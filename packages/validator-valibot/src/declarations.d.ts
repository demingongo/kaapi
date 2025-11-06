import { ValidatorValibotSchema, ValidatorValibot } from './types'

declare module '@kaapi/kaapi' {
    interface PluginSpecificConfiguration {
        valibot?: ValidatorValibotSchema;
    }

    interface Server {
        valibot: ValidatorValibot
    }
}

export { }