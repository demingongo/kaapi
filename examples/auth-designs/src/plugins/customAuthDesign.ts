// plugins/customAuthDesign.ts

import { GroupAuthDesign } from '@kaapi/kaapi';
import { apiKeyAuthDesign } from './apiKeyDesign';
import { authenticationCodeDesign } from '../oauth2Plugins';

/*
import { 
    AuthDesign, 
    //KaapiPlugin, 
    KaapiTools, 
    KaapiGroupAuthUtil 
} from '@kaapi/kaapi';
*/
//import Boom from '@hapi/boom';
//import { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils';


export const customAuthDesign = new GroupAuthDesign([
    authenticationCodeDesign,
    apiKeyAuthDesign
])


/*
export class CustomAuthDesign extends AuthDesign {
    docs() {
        return new KaapiGroupAuthUtil([
            authenticationCodeDesign.docs(),
            apiKeyAuthDesign.docs(),
        ])
    }
    integrateStrategy(t: KaapiTools) {
        apiKeyAuthDesign.integrateStrategy(t)
        authenticationCodeDesign.integrateStrategy(t)
    }
    async integrateHook(t: KaapiTools): Promise<void> {
        await apiKeyAuthDesign.integrateHook(t)
        await authenticationCodeDesign.integrateHook(t)
    }
}

export const customAuthDesign = new CustomAuthDesign()
*/

/*
export interface ICustomAuthDesign extends KaapiPlugin {
    docs(): KaapiGroupAuthUtil;
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
        return new KaapiGroupAuthUtil([
            apiKeyAuthDesign.docs(),
            authenticationCodeDesign.docs()
        ])
    }
}
    */