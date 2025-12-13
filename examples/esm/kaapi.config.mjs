import { OAuth2FlowGenerator, OAuth2UtilGenerator } from '@kaapi/oauth2-auth-design/cli'

export default {
    generators: [
        new OAuth2FlowGenerator(),
        new OAuth2UtilGenerator()
    ]
}