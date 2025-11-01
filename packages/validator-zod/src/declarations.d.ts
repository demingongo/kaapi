import { ValidatorZodSchema, ValidatorZod } from './types'

declare module '@kaapi/kaapi' {
    interface PluginSpecificConfiguration {
        zod?: ValidatorZodSchema;
    }

    interface Server {
        zod: ValidatorZod
    }
}

export { }