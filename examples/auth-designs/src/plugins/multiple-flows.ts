import { createInMemoryKeyStore, MultipleFlowsBuilder } from '@kaapi/oauth2-auth-design';
import oidcAuthCodeFlow from './flow-builders/oidc-auth-code-flow';
import oidcClientCredentialsFlow from './flow-builders/oidc-client-credentials-flow';
import oidcDeviceFlow from './flow-builders/oidc-device-flow';
//import oidcClientCredentialsFlowDraft from '../drafts/oidc-client-credentials-flow-draft';

const mflow = MultipleFlowsBuilder
    .create()
    .tokenEndpoint('/oauth2/v2/token')
    .jwksRoute(route => route.setPath('/oauth2/v2/keys')) // activates jwks uri
    .setPublicKeyExpiry(86400) // 24h
    .setJwksKeyStore(createInMemoryKeyStore()) // store for JWKS
    .add(oidcAuthCodeFlow)
    .add(oidcClientCredentialsFlow)
    .add(oidcDeviceFlow)
    .build()

mflow.checkAndRotateKeys().catch(
    console.error
)

setInterval(() => {
    mflow.checkAndRotateKeys().catch(
        console.error
    )
}, 3600 * 1000) // 1h

export default mflow