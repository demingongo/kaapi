import type {
    ReqRefDefaults,
    ReqRef,
    KaapiServerRoute,
    HandlerDecorations,
    Lifecycle,
    Server,
    MergeRefs,
} from '@kaapi/kaapi';
import type { Type } from 'arktype';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArkSchema = Type<any, any> | undefined | null;

export type ValidatorArkSchema = {
    payload?: ArkSchema;
    query?: ArkSchema;
    params?: ArkSchema;
    headers?: ArkSchema;
    state?: ArkSchema;
    failAction?: 'error' | 'log' | Lifecycle.Method | undefined;
};

export type ArklessReqRefDefaults = Omit<ReqRefDefaults, 'Query' | 'Headers' | 'Params' | 'Payload'>;
export type ArklessReqRef = Omit<ReqRef, 'Query' | 'Headers' | 'Params' | 'Payload'>;

// Generic helper to extract the inferred type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Infer<T extends Type<any, any>> = T['infer'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type output<T, D = unknown> = T extends Type<any, any> ? Infer<T> : D;

export interface ValidatorArkReqRef<RS extends ValidatorArkSchema = ValidatorArkSchema> {
    Query: output<RS['query'], MergeRefs<ArklessReqRefDefaults>['Query']>;
    Headers: output<RS['headers'], MergeRefs<ArklessReqRefDefaults>['Headers']>;
    Params: output<RS['params'], MergeRefs<ArklessReqRefDefaults>['Params']>;
    Payload: output<RS['payload'], MergeRefs<ArklessReqRefDefaults>['Payload']>;
}

export type ValidatorArk = <V extends ValidatorArkSchema>(
    schema: V
) => {
    route<R extends ArklessReqRef = ArklessReqRefDefaults>(
        serverRoute: KaapiServerRoute<ValidatorArkReqRef<V> & R>,
        handler?:
            | HandlerDecorations
            | Lifecycle.Method<ValidatorArkReqRef<V> & R, Lifecycle.ReturnValue<ValidatorArkReqRef<V> & R>>
    ): Server;
};

export interface ValidatorArkRouteBuilder<V extends ValidatorArkSchema> {
    route<R extends ArklessReqRef = ArklessReqRefDefaults>(
        serverRoute: KaapiServerRoute<ValidatorArkReqRef<V> & R>,
        handler?: HandlerDecorations | Lifecycle.Method<ValidatorArkReqRef<V> & R, Lifecycle.ReturnValue<ValidatorArkReqRef<V> & R>>
    ): KaapiServerRoute<ValidatorArkReqRef<V> & R>;
}
