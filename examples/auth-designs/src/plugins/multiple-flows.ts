import oidcAuthCodeFlowDraft from '../drafts/oidc-auth-code-flow-draft';
import oidcClientCredentialsFlowDraft from '../drafts/oidc-client-credentials-flow-draft';
import oidcDeviceFlow from '../drafts/oidc-device-auth-flow-draft';
import { KaapiOIDCMultipleFlowsBuilder } from '@kaapi/oauth2-auth-design';
import { jwksAuthority } from './jwks';

const mflow = KaapiOIDCMultipleFlowsBuilder.create()
    .setTokenEndpoint('/oauth2/v2/token')
    .setJwksEndpoint('/oauth2/v2/keys') // activates jwks uri
    .onJwksRequest(async () => {
        return await jwksAuthority.getJwksEndpointResponse();
    })
    .addFlow(oidcAuthCodeFlowDraft)
    .addFlow(oidcClientCredentialsFlowDraft)
    .addFlow(oidcDeviceFlow)
    .build();

export default mflow;
