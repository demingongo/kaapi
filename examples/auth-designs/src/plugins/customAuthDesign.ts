// plugins/customAuthDesign.ts

import {
    APIKeyAuthDesign,
    BasicAuthDesign,
    BearerAuthDesign,
    GroupAuthDesign
} from '@kaapi/kaapi';
//import { authenticationCodeDesign } from '../oauth2Plugins';
import { openIDDesign2 } from '../openId2';

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
    openIDDesign2
    //authenticationCodeDesign
])