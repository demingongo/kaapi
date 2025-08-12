// plugins/customAuthDesign.ts

import {
    APIKeyAuthDesign,
    BasicAuthDesign,
    BearerAuthDesign,
    GroupAuthDesign
} from '@kaapi/kaapi';
//import { authenticationCodeDesign } from '../oauth2Plugins';
import { openIDDesign } from '../openId';

export const basicAuthDesign = new BasicAuthDesign({
    //strategyName: 'API Key',
    options: {
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
    options: {
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
    options: {
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
    openIDDesign
    //authenticationCodeDesign
])