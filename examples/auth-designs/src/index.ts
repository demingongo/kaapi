import { Kaapi, KaapiServerRoute, ReqRef, ReqRefDefaults } from '@kaapi/kaapi'
import Boom from '@hapi/boom'
import { AuthDesignOAuth2 } from '@kaapi/auth-design-oauth2'

import { GrantType, OAuth2Util } from '@novice1/api-doc-generator';

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    docs: {
        disabled: false
    }
})

// 404
app.route({}, () => Boom.notFound('Nothing here'))

class MyAuthDesign extends AuthDesignOAuth2 {
     protected tokenRoute: KaapiServerRoute
     protected refreshTokenRoute: KaapiServerRoute

    router<Refs extends ReqRef = ReqRefDefaults>(): KaapiServerRoute<Refs>[] {
        throw new Error('Method not implemented.')
    }

    scheme() {
        const docs = new OAuth2Util(this.securitySchemeName)
            .setGrantType(GrantType.clientCredentials)
            .setScopes(this.getScopes() || {})
            .setAccessTokenUrl(this.tokenRoute.path || '');

        if (this.description) {
            docs.setDescription(this.description)
        }
        if (this.refreshTokenRoute.path) {
            docs.setRefreshUrl(this.refreshTokenRoute.path)
        }

        return docs 
    }
    
}

const _vv = new MyAuthDesign('auth-design-oauth2')