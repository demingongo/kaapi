// plugins/customAuthDesign.ts

import { KaapiPlugin, MultiAuthUtil } from '@kaapi/kaapi';
import { apiKeyAuthDesign } from './apiKeyDesign';
import { authenticationCodeDesign } from '../oauth2Plugins';
import Boom from '@hapi/boom';

export interface ICustomAuthDesign extends KaapiPlugin {
    docs(): MultiAuthUtil;
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

        // in parallel
        Promise.all([
            apiKeyAuthDesign.integrate(tools),
            authenticationCodeDesign.integrate(tools)
        ]).then(() => {
            tools.log('[customAuthDesign] auth strategies registered')
            tools.openapi?.setDefaultSecurity(
                this.docs()
            );
        }).catch(err => {
            tools.log.error('[customAuthDesign] error registering auth strategies:', err);
        })
    },

    docs() {
        return new MultiAuthUtil([
            apiKeyAuthDesign.docs(),
            authenticationCodeDesign.docs()
        ])
    }
}