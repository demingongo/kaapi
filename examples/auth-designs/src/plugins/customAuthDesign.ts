import { KaapiPlugin } from '@kaapi/kaapi';
import { GroupAuthUtil } from '@novice1/api-doc-generator'
import { apiKeyAuthDesign } from './apiKeyDesign';
import { authenticationCodeDesign } from '../oauth2Plugins';
import Boom from '@hapi/boom';

export interface ICustomAuthDesign extends KaapiPlugin {
    scheme(): GroupAuthUtil;
}

export const customAuthDesign: ICustomAuthDesign = {
    integrate(tools) {

        tools.scheme('exceptions', () => {
            return {
                async authenticate(request, h) {

                    console.log('checking exceptions strategy', request.path)

                    const accepted = ['/docs', '/oauth2'].some(chunk => {
                        return request.path.startsWith(chunk)
                    })
                    if (accepted && !request.route.settings.auth?.strategies) {
                        return h.authenticated({ credentials: {} })
                    }
                    return Boom.unauthorized(null)
                },
            }
        })
        tools.strategy('exceptions', 'exceptions')

        apiKeyAuthDesign.integrate(tools);
        authenticationCodeDesign.integrate(tools);

        tools.openapi?.setDefaultSecurity(
            this.scheme()
        );
    },

    scheme() {
        return new GroupAuthUtil([
            apiKeyAuthDesign.scheme(),
            authenticationCodeDesign.scheme()
        ])
    }
}