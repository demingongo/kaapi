import oidcAuthCodeFlowDraft from '../drafts/oidc-auth-code-flow-draft';
//import oidcClientCredentialsFlowDraft from '../drafts/oidc-client-credentials-flow-draft';
import { createInMemoryKeyStore, MultipleFlowsBuilder } from '@kaapi/oauth2-auth-design';

const mflow = MultipleFlowsBuilder.create()
    .tokenEndpoint('/oauth2/v2/token')
    .jwksRoute((route) => route.setPath('/oauth2/v2/keys')) // activates jwks uri
    .setPublicKeyExpiry(86400) // 24h
    .setJwksKeyStore(createInMemoryKeyStore()) // store for JWKS
    .add(oidcAuthCodeFlowDraft)
    //.add(oidcClientCredentialsFlowDraft)
    .build();

mflow.checkAndRotateKeys().catch(console.error);

export default mflow;
