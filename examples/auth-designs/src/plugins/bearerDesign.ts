import Boom from '@hapi/boom';
import {
    Auth,
    AuthCredentials,
    AuthDesign,
    KaapiTools,
    ReqRef, ReqRefDefaults, Request, ResponseToolkit
} from '@kaapi/kaapi';
import { BearerUtil } from '@novice1/api-doc-generator'

export type BearerAuthOptions = {
    validate?<
        Refs extends ReqRef = ReqRefDefaults
    >(request: Request<Refs>, token: string, h: ResponseToolkit<Refs>): Promise<{
        isValid?: boolean;
        artifacts?: unknown;
        credentials?: AuthCredentials;
        message?: string;
        scheme?: string;
    } | Auth | Boom.Boom>;
};

export interface BearerAuthArg {
    options?: BearerAuthOptions;
    strategyName?: string;
}

export class BearerAuthDesign extends AuthDesign {

    readonly key = 'Authorization'
    protected strategyName: string = 'auth-design-bearer'
    protected description?: string
    protected options: BearerAuthOptions

    constructor(
        arg?: BearerAuthArg
    ) {
        super()

        if (arg?.strategyName)
            this.strategyName = arg.strategyName;

        this.options = arg?.options ? { ...arg.options } : {}
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

    docs(): BearerUtil {
        const docs = new BearerUtil(this.strategyName)

        if (this.description) {
            docs.setDescription(this.description)
        }

        return docs
    }

    integrateStrategy(t: KaapiTools): void | Promise<void> {

        const strategyName = this.strategyName

        t.scheme(strategyName, (_server, options) => {

            return {
                authenticate: async (request, h) => {

                    console.log('checking bearer', request.path, request.route.settings.auth)

                    const settings: BearerAuthOptions = options || {};

                    const authorization = request.raw.req.headers[this.key.toLowerCase()];


                    const authSplit = typeof authorization === 'string' ? authorization.split(/\s+/) : ['', ''];

                    const tokenType = authSplit[0]
                    let token = authSplit[1]

                    if (tokenType.toLowerCase() !== 'bearer') {
                        token = ''
                        return Boom.unauthorized(null, strategyName)
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
                                const { isValid, credentials, artifacts, message, scheme } = result;

                                if (isValid && credentials) {
                                    return h.authenticated({ credentials, artifacts })
                                }

                                if (message) {
                                    return h.unauthenticated(Boom.unauthorized(message, scheme || 'Bearer'), {
                                        credentials: credentials || {},
                                        artifacts
                                    })
                                }
                            }
                        } catch (err) {
                            return Boom.internal(err instanceof Error ? err : `${err}`)
                        }
                    }

                    return h.unauthenticated(Boom.unauthorized(), { credentials: {} })
                },
            }
        })
        t.strategy(strategyName, strategyName, this.options)
    }

    integrateHook(_t: KaapiTools): void | Promise<void> {
        console.log('[BearerAuthDesign] bearer auth strategy registered');
    }

    toString(): string {
        return this.getStrategyName()
    }
}

export const bearerAuthDesign = new BearerAuthDesign({
    strategyName: 'My bearer is your bearer',
    options: {
        async validate() {
            return {
                isValid: true,
                credentials: {
                    user: {
                        username: 'kaapiuser'
                    }
                }
            }
        }
    }
}) 