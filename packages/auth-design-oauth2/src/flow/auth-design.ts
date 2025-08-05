import Hoek from '@hapi/hoek'
import Boom from '@hapi/boom'
import { Auth, AuthCredentials, KaapiServerRoute, ReqRef, ReqRefDefaults, ResponseToolkit, ServerAuthScheme, Request } from '@kaapi/kaapi';
import { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils';

export interface IAuthDesign {
    routes?<Refs extends ReqRef = ReqRefDefaults>(): KaapiServerRoute<Refs>[]
    scheme(): BaseAuthUtil
    strategy(): {
        name: string,
        scheme: ServerAuthScheme
    }
}

export type OAuth2Options = {
    tokenType?: string;
    validate?<
        Refs extends ReqRef = ReqRefDefaults
    >(request: Request<Refs>, token: string, h: ResponseToolkit<Refs>): Promise<{
        isValid?: boolean;
        artifacts?: unknown;
        credentials?: AuthCredentials;
        message?: string;
        scheme?: string;
    } | Auth>;
};

export abstract class AuthDesignOAuth2 implements IAuthDesign {

    protected securitySchemeName: string
    protected description?: string
    protected scopes?: Record<string, string>

    constructor(
        securitySchemeName: string
    ) {
        this.securitySchemeName = securitySchemeName
    }

    setDescription(description: string): this {
        this.description = description;
        return this;
    }

    /**
     * 
     * @param scopes The scopes of the access request.
     * A map between the scope name and a short description for it. The map MAY be empty.
     * @returns 
     */
    setScopes(scopes: Record<string, string>): this {
        this.scopes = scopes;
        return this;
    }

    getScopes(): Record<string, string> | undefined {
        return this.scopes
    }

    getSecuritySchemeName(): string {
        return this.securitySchemeName;
    }

    getDescription(): string | undefined {
        return this.description;
    }

    strategy(): {
        name: string,
        scheme: ServerAuthScheme
    } {
        return {
            name: 'hello',
            scheme: (_server, options) => {

            return {
                async authenticate(request, h) {

                    const settings: OAuth2Options = Hoek.applyToDefaults({
                        tokenType: 'Bearer'
                    }, options || {});

                    const authorization = request.raw.req.headers.authorization;

                    const authSplit = authorization ? authorization.split(/\s+/) : ['', ''];

                    const tokenType = authSplit[0]
                    let token = authSplit[1]

                    if (tokenType.toLowerCase() !== settings.tokenType?.toLowerCase()) {
                        token = ''
                    }

                    if (settings.validate) {
                        try {
                            const result = await settings.validate?.(request, token, h)

                            if (result && 'isAuth' in result) {
                                return result
                            }

                            if (result) {
                                const { isValid, credentials, artifacts, message, scheme } = result;

                                if (isValid && credentials) {
                                    return h.authenticated({ credentials, artifacts })
                                }

                                if (message) {
                                    return h.unauthenticated(Boom.unauthorized(message, scheme || settings.tokenType || ''), {
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
        }
        }
    }

    abstract routes<Refs extends ReqRef = ReqRefDefaults>(): KaapiServerRoute<Refs>[]

    abstract scheme(): BaseAuthUtil

}