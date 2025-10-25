import oidcAuthCodeFlowDraft from '../drafts/oidc-auth-code-flow-draft';
//import oidcClientCredentialsFlowDraft from '../drafts/oidc-client-credentials-flow-draft';
import { createInMemoryKeyStore, MultipleFlowsBuilder } from '@kaapi/oauth2-auth-design';

const mflow = MultipleFlowsBuilder.create()
    .tokenEndpoint('/oauth2/v2/token')
    .jwksRoute((route) => route.setPath('/oauth2/v2/keys')) // activates jwks uri
    .setJwksKeyStore(createInMemoryKeyStore()) // store for JWKS
    .setPublicKeyExpiry(8.64e+6) // 100 days
    .setJwksRotatorOptions({
        intervalMs: 7.862e+9, // every 91 days
        timestampStore: createInMemoryKeyStore()
    })
    .add(oidcAuthCodeFlowDraft)
    //.add(oidcClientCredentialsFlowDraft)
    .build();

mflow.checkAndRotateKeys().catch(console.error);

export default mflow;
