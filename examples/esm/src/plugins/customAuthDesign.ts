// plugins/customAuthDesign.ts
import multipleFlows from './multiple-flows';
import { APIKeyAuthDesign, BasicAuthDesign, BearerAuthDesign, GroupAuthDesign } from '@kaapi/kaapi';

export const basicAuthDesign = new BasicAuthDesign({
    auth: {
        async validate(_, username, password) {
            if (username == 'admin' && password == 'password') {
                return {
                    isValid: true,
                    credentials: {
                        user: {
                            username: 'kaapiuser',
                        },
                    },
                };
            }
            return {};
        },
    },
});

export const apiKeyAuthDesign = new APIKeyAuthDesign({
    auth: {
        headerTokenType: 'Session',
        async validate(_, token) {
            if (token == 'admin') {
                return {
                    isValid: true,
                    credentials: {
                        user: {
                            username: 'kaapiuser',
                        },
                    },
                };
            }
            return {};
        },
    },
});

export const bearerAuthDesign = new BearerAuthDesign({
    auth: {
        async validate(_, token) {
            if (token == 'admin') {
                return {
                    isValid: true,
                    credentials: {
                        user: {
                            username: 'kaapiuser',
                        },
                    },
                };
            }
            return {};
        },
    },
});

export const customAuthDesign = new GroupAuthDesign([
    basicAuthDesign,
    apiKeyAuthDesign,
    bearerAuthDesign,
    multipleFlows,
]);
