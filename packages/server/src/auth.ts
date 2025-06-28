import Hapi from '@hapi/hapi'

export type KaviAuthOptions = {
    tokenType?: string;
    validate?: (request: Hapi.Request<Hapi.ReqRefDefaults>, token: string, h: Hapi.ResponseToolkit<Hapi.ReqRefDefaults>) =>
        Promise<{ isValid?: boolean, artifacts?: unknown, credentials?: Hapi.AuthCredentials, message?: string, scheme?: string }>
}