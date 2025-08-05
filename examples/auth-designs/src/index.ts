
import {
    Kaapi
} from '@kaapi/kaapi'
import Boom from '@hapi/boom'

import { AuthDesignOAuth2, OAuth2ACAuthorizationHandler, OAuth2ACAuthorizationRoute } from './authorizationCode';


const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    docs: {
        disabled: false
    }
})

// 404
app.route({}, () => Boom.notFound('Nothing here'))

function buildSignInHTML(options: { title: string, error?: string }) {
    return `<!DOCTYPE html>
<html lang="en">
 <head>
  <meta charset="UTF-8">
  <meta name="Generator" content="EditPlus®">
  <meta name="Author" content="">
  <meta name="Keywords" content="">
  <meta name="Description" content="">
  <title>${options.title}</title>
  <style>
    .error {
      color: red;
      font-weight: bold;
    }
  </style>
 </head>
 <body>
  <form method="POST">
  <div class="error">
    ${options.error || ''}
  </div>
  <div>
  <input type="email" id="email" name="email" placeholder="email" autocomplete="email" />
  <input type="password" id="password" name="password" placeholder="password" />
  </div>
  <div>
  <button type="submit">
    Submit
  </button>
  </div>
  </form>
 </body>
</html>`
}

const plugin = new AuthDesignOAuth2(
    new OAuth2ACAuthorizationRoute(
        '/oauth2/ac/login',
        (async ({ clientId, redirectUri, codeChallenge, scope, state }, { query: { nonce } }, h) => {

            console.log('clientId', clientId)
            console.log('codeChallenge', codeChallenge)
            console.log('redirectUri', redirectUri)
            console.log('scope', scope)
            console.log('state', state)
            console.log('nonce', nonce)

            if (clientId) {
                //#region @TODO: validation

                //#endregion @TODO: validation
            } else {
                return h.response({ error: 'Bad \'client_id\' parameter.' }).code(400)
            }

            // render form
            return h.response(
                buildSignInHTML({
                    title: 'Sign in'
                })
            ).code(200).type('text/html')
        }) as OAuth2ACAuthorizationHandler<{ Query: { nonce?: string } }>,
        (async ({ clientId, redirectUri, codeChallenge, scope, state }, { query: { nonce }, payload: { email, password } }, h) => {
            console.log('clientId', clientId)
            console.log('codeChallenge', codeChallenge)
            console.log('redirectUri', redirectUri)
            console.log('scope', scope)
            console.log('state', state)
            console.log('nonce', nonce)

            let error = ''

            if (clientId && email && password) {
                //#region @TODO: validation + code
                const code = 'generated_code'
                if (email == 'user@novice1' && password == '1234') {
                    return h.redirect(`${redirectUri}?code=${code}${state ? `&state=${state}` : ''}`)
                } else {
                    error = 'wrong credentials'
                }
                //#endregion @TODO: validation + code generation
            } else {
                error = 'invalid request'
            }

            // render form
            return h.response(
                buildSignInHTML({
                    title: 'Sign in',
                    error: error || 'something went wrong'
                })
            ).code(200).type('text/html')
        }) as OAuth2ACAuthorizationHandler<{ Query: { nonce?: string }, Payload: { email: string, password: string } }>
    ),
    {}
)

app.plug(plugin)
