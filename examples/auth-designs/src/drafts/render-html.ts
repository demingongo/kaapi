import { AuthResponseRenderer, OAuth2ErrorBody } from '@kaapi/oauth2-auth-design'

const TEMPLATES_AUTH: Record<string, AuthResponseRenderer> = {
    'authorization-page': (({ error, errorMessage, emailField, passwordField }) => {
        if (error && ['invalid_client'].includes(error)) {
            return { error, error_description: errorMessage } as OAuth2ErrorBody
        }
        return `<!DOCTYPE html>
<html lang="en">
 <head>
  <meta charset="UTF-8">
  <meta name="Generator" content="EditPlus®">
  <meta name="Author" content="">
  <meta name="Keywords" content="">
  <meta name="Description" content="">
  <title>Sign In</title>
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
    ${errorMessage || ''}
  </div>
  <div>
  <input type="email" id="${emailField}" name="${emailField}" placeholder="${emailField}" autocomplete="${emailField}" />
  <input type="password" id="${passwordField}" name="${passwordField}" placeholder="${passwordField}" />
  <input type="hidden" id="step" name="step" value="login" />
  </div>
  <div>
  <button type="submit">
    Submit
  </button>
  </div>
  </form>
 </body>
</html>`
    }),

    'consent-page': ((_, params) => {

      params.clientId
        return `<!DOCTYPE html>
<html lang="en">
 <head>
  <meta charset="UTF-8">
  <meta name="Generator" content="EditPlus®">
  <meta name="Author" content="">
  <meta name="Keywords" content="">
  <meta name="Description" content="">
  <title>Sign In</title>
  <style>
    .error {
      color: red;
      font-weight: bold;
    }
  </style>
 </head>
 <body>
  <form method="POST">
  <h3 class="error">
    Consent to ${params.clientId}?
  </h3>
  <div>
  <input type="hidden" id="step" name="step" value="consent" />
  </div>
  <div>
  <button type="submit" name="submit" value="allow">
    Allow
  </button>
  <button type="submit" name="submit" value="deny">
    Deny
  </button>
  </div>
  </form>
 </body>
</html>`
    })
}



// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function renderHtml(template: string, substitution?: Record<string, any>): Promise<string | object> {
    if (!(template in TEMPLATES_AUTH)) {
        throw new Error(`Unknown template '${template}'`)
    }

    return TEMPLATES_AUTH[template](substitution?.context || {}, substitution?.params || {}, substitution?.req || {}, substitution?.h || {})
}