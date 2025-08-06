import Boom from '@hapi/boom';
import { KaapiPlugin } from '@kaapi/kaapi';
import { ApiKeyLocation, ApiKeyUtil } from '@novice1/api-doc-generator'

export interface IApiKeyAuthDesign extends KaapiPlugin {
    scheme(): ApiKeyUtil;
}

export const apiKeyAuthDesign: IApiKeyAuthDesign = {
    integrate(tools) {
        tools.scheme('apiKey', (_server) => {

            return {
                async authenticate(request, h) {

                    console.log('checking apiKey', request.path)

                    const settings = {
                        tokenType: 'Session'
                    };

                    const authorization = request.raw.req.headers.authorization;

                    const authSplit = authorization ? authorization.split(/\s+/) : ['', ''];

                    const tokenType = authSplit[0]
                    let token = authSplit[1]

                    if (tokenType.toLowerCase() !== settings.tokenType?.toLowerCase()) {
                        token = ''
                        return Boom.unauthorized(null, 'Session')
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

        tools.strategy('apiKey', 'apiKey')

        console.log('apiKey auth strategy registered');

        const securityScheme = this.scheme();
        tools.openapi?.addSecurityScheme(securityScheme)
            .setDefaultSecurity(securityScheme);
    },

    scheme() {
        return new ApiKeyUtil('apiKey')
            .setApiKeyLocation(ApiKeyLocation.header)
            .setDescription('')
            .setKey('Authorization')
    }
}