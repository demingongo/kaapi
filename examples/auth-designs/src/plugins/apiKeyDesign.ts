import Boom from '@hapi/boom';
import { AuthDesign, KaapiTools } from '@kaapi/kaapi';
import { ApiKeyLocation, ApiKeyUtil } from '@novice1/api-doc-generator'

class ApiKeyAuthDesign extends AuthDesign {
    docs(): ApiKeyUtil {
        return new ApiKeyUtil('apiKey')
            .setApiKeyLocation(ApiKeyLocation.header)
            .setDescription('')
            .setKey('Authorization')
    }

    integrateStrategy(t: KaapiTools): void | Promise<void> {
        t.scheme('apiKey', (_server) => {

            return {
                async authenticate(request, h) {

                    console.log('checking apiKey', request.path, request.route.settings.auth)

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
        t.strategy('apiKey', 'apiKey')
    }
    
    integrateHook(_t: KaapiTools): void | Promise<void> {
        console.log('[ApiKeyAuthDesign] apiKey auth strategy registered');
    }
}



export const apiKeyAuthDesign = new ApiKeyAuthDesign() 