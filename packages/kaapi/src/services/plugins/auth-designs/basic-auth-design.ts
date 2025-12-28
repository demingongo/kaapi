// BasicAuthDesign

import Boom from '@hapi/boom';
import {
    Auth,
    AuthCredentials,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit
} from '@hapi/hapi';
import { BasicAuthUtil } from '@novice1/api-doc-generator';
import {
    AuthDesign,
    KaapiTools,
} from '../plugin';

export type BasicAuthOptions<
    Refs extends ReqRef = ReqRefDefaults
> = {
    validate?(request: Request<Refs>, username: string, password: string, h: ResponseToolkit<Refs>): Promise<{
        isValid?: boolean;
        artifacts?: unknown;
        credentials?: AuthCredentials;
        message?: string;
    } | Auth | Boom.Boom>;
};

export interface BasicAuthArg {
    auth?: BasicAuthOptions;
    strategyName?: string;
}

export class BasicAuthDesign extends AuthDesign {

    readonly key = 'Authorization'
    protected strategyName: string = 'basic-auth-design'
    protected description?: string
    protected auth: BasicAuthOptions

    constructor(
        arg?: BasicAuthArg
    ) {
        super()

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

    docs(): BasicAuthUtil | undefined {
        const docs = new BasicAuthUtil(this.strategyName)

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

                    const settings: BasicAuthOptions = options || {};

                    const authorization = request.raw.req.headers[this.key.toLowerCase()];


                    const authSplit = typeof authorization === 'string' ? authorization.split(/\s+/) : ['', ''];

                    const tokenType = authSplit[0]
                    let token = authSplit[1]

                    if (tokenType.toLowerCase() !== 'basic') {
                        token = ''
                        return Boom.unauthorized(null, strategyName)
                    }

                    const [username, password] = Buffer.from(token, 'base64').toString().split(':', 2);

                    if (settings.validate) {
                        try {
                            const result = await settings.validate?.(request, username, password, h)

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
                                    return h.unauthenticated(Boom.unauthorized(message, 'Basic'), {
                                        credentials: credentials || {},
                                        artifacts
                                    })
                                }
                            }
                        } catch (err) {
                            return Boom.internal(err instanceof Error ? err : `${err}`)
                        }
                    }

                    return Boom.unauthorized(null, 'Basic')
                },
            }
        })
        t.strategy(strategyName, strategyName, this.auth)
    }

    toString(): string {
        return this.getStrategyName()
    }
}