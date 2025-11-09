import { ValidatorArkSchema, ValidatorArk } from './types';

declare module '@kaapi/kaapi' {
    interface PluginSpecificConfiguration {
        valibot?: ValidatorArkSchema;
    }

    interface Server {
        ark: ValidatorArk;
    }
}

export {};
