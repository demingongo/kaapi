import { KaapiServerRoute } from '@kaapi/kaapi'

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

export const getAuthRoute: KaapiServerRoute<{
    Query: { 
        client_id?: string, 
        code_challenge?: string, 
        redirect_uri?: string, 
        scope?: string, 
        state?: string,
        nonce?: string
    }
}> = {
    path: '/oauth2/ac/login',
    method: 'GET',
    handler: async ({ query: { nonce, client_id, code_challenge, redirect_uri, scope, state } }, h) => {

        console.log('client_id', client_id)
        console.log('codeChallenge', code_challenge)
        console.log('redirectUri', redirect_uri)
        console.log('scope', scope)
        console.log('state', state)
        console.log('nonce', nonce)

        if (client_id) {
            //#region @TODO: validation

            //#endregion @TODO: validation
        } else {
            return h.response({error: 'Bad \'client_id\' parameter.'}).code(400)
        }

        // render form
        return h.response(
            buildSignInHTML({
                title: 'Sign in'
            })
        ).code(200).type('text/html')
    }
}

export const postAuthRoute: KaapiServerRoute<{
    Query: { 
        client_id?: string, 
        code_challenge?: string, 
        redirect_uri?: string, 
        scope?: string, 
        state?: string,
        nonce?: string
    },
    Payload: {
        email: string,
        password: string
    }
}> = {
    path: '/oauth2/ac/login',
    method: 'POST',
    handler: async ({ query: { nonce, client_id, code_challenge, redirect_uri, scope, state }, payload: { email, password }  }, h) => {

        console.log('client_id', client_id)
        console.log('codeChallenge', code_challenge)
        console.log('redirectUri', redirect_uri)
        console.log('scope', scope)
        console.log('state', state)
        console.log('nonce', nonce)

        let error = ''

        if (client_id && email && password) {
            //#region @TODO: validation + code
            const code = 'generated_code'
            if (email == 'user@novice1' && password == '1234') {
                return h.redirect(`${redirect_uri}?code=${code}${state ? `&state=${state}` : ''}`)
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
    }
}