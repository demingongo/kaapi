import oidcAuthCodeFlowDraft from '../drafts/oidc-auth-code-flow-draft';
import oidcClientCredentialsFlowDraft from '../drafts/oidc-client-credentials-flow-draft';
//import oidcAuthCodeFlow from './flow-builders/oidc-auth-code-flow';
//import oidcClientCredentialsFlow from './flow-builders/oidc-client-credentials-flow';
import oidcDeviceFlow from './flow-builders/oidc-device-flow';
import { createInMemoryKeyStore, MultipleFlowsBuilder } from '@kaapi/oauth2-auth-design';

const mflow = MultipleFlowsBuilder.create()
    .tokenEndpoint('/oauth2/v2/token')
    .jwksRoute((route) => route.setPath('/oauth2/v2/keys')) // activates jwks uri
    .setPublicKeyExpiry(86400) // 24h
    .setJwksKeyStore(createInMemoryKeyStore()) // store for JWKS
    .setJwksRotatorOptions({
        intervalMs: 7.884e9, // 91 days
        timestampStore: createInMemoryKeyStore(),
    })
    .add(oidcAuthCodeFlowDraft)
    .add(oidcClientCredentialsFlowDraft)
    .add(oidcDeviceFlow)
    .build();

mflow.checkAndRotateKeys().catch(console.error);

setInterval(() => {
    mflow.checkAndRotateKeys().catch(console.error);
}, 3600 * 1000); // 1h

export default mflow;
