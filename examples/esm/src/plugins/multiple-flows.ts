import { jwksAuthority, jwksRotator } from '../drafts/jwks';
import oidcAuthCodeFlowDraft from '../drafts/oidc-auth-code-flow-draft';
//import oidcClientCredentialsFlowDraft from '../drafts/oidc-client-credentials-flow-draft';
import { KaapiOIDCMultipleFlowsBuilder } from '@kaapi/oauth2-auth-design';

const mflow = KaapiOIDCMultipleFlowsBuilder.create()
    .setTokenEndpoint('/oauth2/v2/token')
    .setJwksEndpoint('/oauth2/v2/keys') // activates jwks uri
    .onDiscoveryRequest(async (request) => {
        return mflow.kaapi().getDiscoveryConfiguration(request, {});
    })
    .onJwksRequest(async () => {
        return await jwksAuthority.getJwksEndpointResponse();
    })
    .addFlow(oidcAuthCodeFlowDraft)
    .build();

jwksRotator.checkAndRotateKeys().catch(console.error);

export default mflow;
