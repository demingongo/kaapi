import { ValidatorArkSchema, ValidatorArk } from './types';

declare module '@kaapi/kaapi' {
    interface PluginSpecificConfiguration {
        ark?: ValidatorArkSchema;
    }

    interface Server {
        ark: ValidatorArk;
    }
}

export {};
