import oidcAuthCodeFlowDraft from '../drafts/oidc-auth-code-flow-draft';
import oidcClientCredentialsFlowDraft from '../drafts/oidc-client-credentials-flow-draft';
import oidcDeviceFlow from '../drafts/oidc-device-auth-flow-draft';
import { KaapiOIDCMultipleFlowsBuilder } from '@kaapi/oauth2-auth-design';
import { jwksAuthority } from './jwks';

const mflow = KaapiOIDCMultipleFlowsBuilder.create()
    .setTokenEndpoint('/oauth2/v2/token')
    .setJwksEndpoint('/oauth2/v2/keys') // activates jwks uri
    .onDiscoveryRequest(async (request) => {
        return mflow.kaapi().getDiscoveryConfiguration(request, {
            origin: 'http://localhost:3000', // Use the externally accessible URI for discovery to ensure correct endpoint URLs are provided to clients
        });
    })
    .onJwksRequest(async () => {
        return await jwksAuthority.getJwksEndpointResponse();
    })
    .addFlow(oidcAuthCodeFlowDraft)
    .addFlow(oidcClientCredentialsFlowDraft)
    .addFlow(oidcDeviceFlow)
    .build();

export default mflow;
