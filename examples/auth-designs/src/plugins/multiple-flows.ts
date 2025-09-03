import { getInMemoryJWKSStore, MultipleFlowsBuilder } from '@kaapi/oauth2-auth-design';
import oidcAuthCodeFlow from './flow-builders/oidc-auth-code-flow';
import oidcClientCredentialsFlow from './flow-builders/oidc-client-credentials-flow';
import oidcDeviceFlow from './flow-builders/oidc-device-flow';

export default MultipleFlowsBuilder
    .create()
    .tokenEndpoint('/oauth2/v2/token')
    .setTokenTTL(36000)
    .setJwksStore(getInMemoryJWKSStore({ timeThreshold: 36000 / 2 })) // store for JWKS
    .jwksRoute(route => route.setPath('/oauth2/v2/keys')) // activates jwks uri
    .add(oidcAuthCodeFlow)
    .add(oidcClientCredentialsFlow)
    .add(oidcDeviceFlow)
    .build()