// APIKeyAuthDesign

import Boom from '@hapi/boom';
import {
    Auth,
    AuthCredentials,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit
} from '@hapi/hapi';
import { ApiKeyLocation, ApiKeyUtil } from '@novice1/api-doc-generator';
import {
    AuthDesign,
    KaapiTools,
} from '../plugin';


export type APIKeyAuthOptions<
    Refs extends ReqRef = ReqRefDefaults
> = {
    /**
     * e.g.: "Bearer" or "Session" or ...
     */
    headerTokenType?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validate?(request: Request<Refs>, token: any, h: ResponseToolkit<Refs>): Promise<{
        isValid?: boolean;
        artifacts?: unknown;
        credentials?: AuthCredentials;
        message?: string;
    } | Auth | Boom.Boom>;
};

export interface APIKeyAuthArg {
    /**
     * Default: "Authorization" (header)
     */
    key?: string
    auth?: APIKeyAuthOptions;
    strategyName?: string;
}

export class APIKeyAuthDesign extends AuthDesign {

    #key = 'Authorization'
    protected strategyName: string = 'api-key-auth-design'
    protected description?: string
    protected apiKeyLocation: ApiKeyLocation = ApiKeyLocation.header
    protected auth: APIKeyAuthOptions

    public get key() {
        return this.#key
    }

    constructor(
        arg?: APIKeyAuthArg
    ) {
        super()

        if (arg?.key)
            this.#key = arg.key;

        if (arg?.strategyName)
            this.strategyName = arg.strategyName;

        this.auth = arg?.auth ? { ...arg.auth } : {}
    }

    setDescription(description: string): this {
        this.description = description;
        return this;
    }

    getStrategyName(): string {
        return this.strategyName;
    }

    getDescription(): string | undefined {
        return this.description;
    }

    inCookie(): this {
        this.apiKeyLocation = ApiKeyLocation.cookie
        return this
    }

    inHeader(): this {
        this.apiKeyLocation = ApiKeyLocation.header
        return this
    }

    inQuery(): this {
        this.apiKeyLocation = ApiKeyLocation.query
        return this
    }

    docs(): ApiKeyUtil | undefined {
        const docs = new ApiKeyUtil(this.strategyName)
            .setApiKeyLocation(this.apiKeyLocation)
            .setKey(this.key)

        if (this.description) {
            docs.setDescription(this.description)
        }

        return docs
    }

    integrateStrategy(t: KaapiTools): void | Promise<void> {

        const strategyName = this.strategyName
        const apiKeyLocation = this.apiKeyLocation
        const key = this.key

        t.scheme(strategyName, (_server, options) => {

            return {
                authenticate: async (request, h) => {

                    const settings: APIKeyAuthOptions = options || {};

                    const authorization = apiKeyLocation == ApiKeyLocation.cookie ?
                        request.state[key] : apiKeyLocation == ApiKeyLocation.query ?
                            request.query[key] :
                            request.raw.req.headers[key.toLowerCase()];

                    let token = authorization

                    if (apiKeyLocation == ApiKeyLocation.header && settings.headerTokenType) {
                        const authSplit = typeof authorization === 'string' ? authorization.split(/\s+/) : ['', ''];

                        const tokenType = authSplit[0]
                        token = authSplit[1]

                        if (tokenType.toLowerCase() !== settings.headerTokenType?.toLowerCase()) {
                            return Boom.unauthorized(null, settings.headerTokenType)
                        }
                    }

                    if (settings.validate) {
                        try {
                            const result = await settings.validate?.(request, token, h)

                            if (result && 'isAuth' in result) {
                                return result
                            }

                            if (result && 'isBoom' in result) {
                                return result
                            }

                            if (result) {
                                const { isValid, credentials, artifacts, message } = result;

                                if (isValid && credentials) {
                                    return h.authenticated({ credentials, artifacts })
                                }

                                if (message) {
                                    return h.unauthenticated(Boom.unauthorized(message, (ApiKeyLocation.header && settings.headerTokenType) || strategyName), {
                                        credentials: credentials || {},
                                        artifacts
                                    })
                                }
                            }
                        } catch (err) {
                            return Boom.internal(err instanceof Error ? err : `${err}`)
                        }
                    }

                    return Boom.unauthorized(null, (ApiKeyLocation.header && settings.headerTokenType) || strategyName)
                },
            }
        })
        t.strategy(strategyName, strategyName, this.auth)
    }

    toString(): string {
        return this.getStrategyName()
    }
}