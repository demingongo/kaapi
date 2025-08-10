import Boom from '@hapi/boom';
import { AuthDesign, KaapiTools } from '@kaapi/kaapi';
import { ApiKeyLocation, ApiKeyUtil } from '@novice1/api-doc-generator'

class ApiKeyAuthDesign extends AuthDesign {

    #headerKey = 'Authorization'
    protected securitySchemeName: string = 'apiKey'
    protected description?: string
    protected apiKeyLocation: ApiKeyLocation = ApiKeyLocation.header

    public get headerKey() {
        return this.#headerKey
    }

    inCookie() {
        this.apiKeyLocation = ApiKeyLocation.cookie
        return this
    }

    inHeader() {
        this.apiKeyLocation = ApiKeyLocation.header
        return this
    }

    inQuery() {
        this.apiKeyLocation = ApiKeyLocation.query
        return this
    }

    docs(): ApiKeyUtil {
        const docs = new ApiKeyUtil(this.securitySchemeName)
            .setApiKeyLocation(this.apiKeyLocation)
            .setKey(this.headerKey)

        if (this.description) {
            docs.setDescription(this.description)
        }

        return docs
    }

    integrateStrategy(t: KaapiTools): void | Promise<void> {
        t.scheme(this.securitySchemeName, (_server) => {

            return {
                authenticate: async (request, h) => {

                    console.log('checking apiKey', request.path, request.route.settings.auth)

                    const settings = {
                        tokenType: 'Session'
                    };

                    const authorization = this.apiKeyLocation == ApiKeyLocation.cookie ?
                        request.state[this.headerKey] as string | object | undefined : this.apiKeyLocation == ApiKeyLocation.query ? 
                        request.query[this.headerKey] as string | string[] | undefined :
                        request.raw.req.headers[this.headerKey.toLowerCase()];

                    let token = typeof authorization === 'string' ? authorization : ''

                    if (settings.tokenType) {
                        const authSplit = typeof authorization === 'string' ? authorization.split(/\s+/) : ['', ''];

                        const tokenType = authSplit[0]
                        token = authSplit[1]

                        if (tokenType.toLowerCase() !== settings.tokenType?.toLowerCase()) {
                            token = ''
                            return Boom.unauthorized(null, 'Session')
                        }
                    }

                    if (token) {
                        try {
                            //#region @TODO: validation

                            //#endregion @TODO: validation

                            // authorized to go further
                            return h.authenticated({ credentials: {}, artifacts: {} })
                        } catch (err) {
                            return Boom.internal(err instanceof Error ? err : `${err}`)
                        }
                    }

                    return h.unauthenticated(Boom.unauthorized(), { credentials: {} })
                },
            }
        })
        t.strategy(this.securitySchemeName, this.securitySchemeName)
    }

    integrateHook(_t: KaapiTools): void | Promise<void> {
        console.log('[ApiKeyAuthDesign] apiKey auth strategy registered');
    }
}



export const apiKeyAuthDesign = new ApiKeyAuthDesign() 