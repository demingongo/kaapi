import type {
    ReqRefDefaults,
    ReqRef,
    KaapiServerRoute,
    HandlerDecorations,
    Lifecycle,
    Server
} from '@kaapi/kaapi'
import type {
    Config,
    InferIssue,
    InferOutput,
    ObjectEntriesAsync
} from 'valibot'

export type NonEmptyValibotSchema = ObjectEntriesAsync[string]
export type ValibotSchema = NonEmptyValibotSchema | undefined | null;

export type ValidatorValibotOptions<TSchema extends NonEmptyValibotSchema> = Config<InferIssue<TSchema>>

export type ValidatorValibotSchema = {
    payload?: ValibotSchema;
    query?: ValibotSchema;
    params?: ValibotSchema;
    headers?: ValibotSchema;
    state?: ValibotSchema;
    options?: ValidatorValibotOptions<NonEmptyValibotSchema>;
    failAction?: 'error' | 'log' | Lifecycle.Method | undefined;
}

export type ValibotlessReqRefDefaults = Omit<ReqRefDefaults, 'Query' | 'Headers' | 'Params' | 'Payload'>;
export type ValibotlessReqRef = Omit<ReqRef, 'Query' | 'Headers' | 'Params' | 'Payload'>;

export type output<T> = T extends NonEmptyValibotSchema ? InferOutput<T> : unknown;

export interface ValidatorValibotReqRef<RS extends ValidatorValibotSchema = ValidatorValibotSchema> {
    Query: output<RS['query']>,
    Headers: output<RS['headers']>
    Params: output<RS['params']>
    Payload: output<RS['payload']>
}

export type ValidatorValibot = <V extends ValidatorValibotSchema>(schema: V) => {
    route<R extends ValibotlessReqRef = ValibotlessReqRefDefaults>(
        serverRoute: KaapiServerRoute<ValidatorValibotReqRef<V> & R>,
        handler?: HandlerDecorations | Lifecycle.Method<ValidatorValibotReqRef<V> & R, Lifecycle.ReturnValue<ValidatorValibotReqRef<V> & R>>
    ): Server;
}