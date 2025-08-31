// plugins/customAuthDesign.ts

import {
    APIKeyAuthDesign,
    BasicAuthDesign,
    BearerAuthDesign,
    GroupAuthDesign
} from '@kaapi/kaapi';
//import { authenticationCodeDesign } from '../oauth2Plugins';
//import { openIDDesignV1 } from '../open-id-design-v1';
//import { clientCredentialsDesignV1 } from '../oauth2-cc-v1';
import { OIDCMultiFlowsDesignV2 } from '../oidc-multi-flows-v2';

export const basicAuthDesign = new BasicAuthDesign({
    //strategyName: 'API Key',
    auth: {
        async validate(_, username, password) {
            if (username == 'admin' && password == 'password') {
                return {
                    isValid: true,
                    credentials: {
                        user: {
                            username: 'kaapiuser'
                        }
                    }
                }
            }
            return {}
        }
    }
})

export const apiKeyAuthDesign = new APIKeyAuthDesign({
    //strategyName: 'API Key',
    auth: {
        headerTokenType: 'Session',
        async validate(_, token) {
            if (token == 'admin') {
                return {
                    isValid: true,
                    credentials: {
                        user: {
                            username: 'kaapiuser'
                        }
                    }
                }
            }
            return {}
        }
    }
})

export const bearerAuthDesign = new BearerAuthDesign({
    //strategyName: 'Bearer Auth Design',
    auth: {
        async validate(_, token) {
            if (token == 'admin') {
                return {
                    isValid: true,
                    credentials: {
                        user: {
                            username: 'kaapiuser'
                        }
                    }
                }
            }
            return {}
        }
    }
})

export const customAuthDesign = new GroupAuthDesign([
    basicAuthDesign,
    apiKeyAuthDesign,
    bearerAuthDesign,
    OIDCMultiFlowsDesignV2,
    //openIDDesignV1,
    //clientCredentialsDesignV1
    //authenticationCodeDesign
])