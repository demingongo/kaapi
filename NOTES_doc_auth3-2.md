# Device Authorization Flow with `authorizationRoute` (Device Code Grant)

This guide explains how to implement the **OAuth2 Device Authorization Flow** using `OIDCDeviceAuthorizationBuilder` and the `authorizationRoute()` method from the [`@kaapi/oauth2-auth-design`](https://www.npmjs.com/package/@kaapi/oauth2-auth-design) package.

The Device Authorization Flow is typically used by input-constrained devices (e.g. smart TVs, CLI tools), allowing users to authenticate via a browser on a separate device.

---

## Example Implementation

```ts
import {
  NoneAuthMethod,
  OIDCDeviceAuthorizationBuilder
} from '@kaapi/oauth2-auth-design'

import logger from './logger'
import db from './database'
import { encode } from './encoder'
import { generateCode, VERIFICATION_URI } from './utils'

export default OIDCDeviceAuthorizationBuilder
  .create({ logger })
  .setTokenTTL(600)
  .addClientAuthenticationMethod(new NoneAuthMethod())
  .useAccessTokenJwks(true)
  .authorizationRoute(route =>
    route
      .setPath('/oauth2/devicecode')
      .generateCode(async ({ clientId, scope }, _request) => {
        const client = await db.clients.findById(clientId)
        if (!client) return null

        const userCode = generateCode(6)
        const deviceCode = encode({ clientId, scope, code: generateCode(24) })

        const searchParams = new URLSearchParams()
        searchParams.append('user_code', userCode)

        await db.deviceTokens.insertOne({
          id: deviceCode,
          userCode,
          expiresAt: Date.now() + 900_000 // 15 minutes
        })

        return {
          device_code: deviceCode,
          expires_in: 900,
          interval: 5,
          user_code: userCode,
          verification_uri: VERIFICATION_URI,
          verification_uri_complete: `${VERIFICATION_URI}?${searchParams.toString()}`
        }
      })
  )
```

---

## `authorizationRoute` in Device Authorization Flow

The `authorizationRoute()` method in this context handles the **Device Authorization Endpoint**, which issues `device_code` and `user_code` to the client device.

This endpoint is typically called by a **non-browser client** (e.g. a smart TV) to begin the login flow.

---

### 🔧 Configuration Methods

| Method                          | Purpose                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `setPath('/oauth2/devicecode')` | Customizes the device authorization endpoint path. Default: `/oauth2/authorize`. |
| `generateCode()`                | Implements the logic to create and persist both `device_code` and `user_code`.   |

---

## 🧠 Flow Overview

1. **Client (Device)** calls `POST /oauth2/devicecode` with `client_id` and optional `scope`.
2. **Server** responds with:

   * `device_code` (used by the device to poll the token endpoint)
   * `user_code` (displayed to the user)
   * `verification_uri` (where the user enters the code)
   * `verification_uri_complete` (auto-filled link for convenience)
3. **User** navigates to the verification URI on a browser-enabled device and enters the code.
4. **Device** polls the token endpoint using `device_code` until user authenticates or code expires.

---

## 🔐 `generateCode` Handler

The `generateCode()` function implements the logic to:

* Validate the client.
* Generate and encode both `user_code` and `device_code`.
* Persist the token/session metadata.
* Return the full response object expected by the OAuth2 Device Authorization specification.

### Example Return:

```json
{
  "device_code": "base64encodedcode",
  "user_code": "ABC123",
  "verification_uri": "https://example.com/verify",
  "verification_uri_complete": "https://example.com/verify?user_code=ABC123",
  "expires_in": 900,
  "interval": 5
}
```

---

## 🗃️ Data Persistence

You must persist the `device_code`, `user_code`, and expiration data in a durable store (e.g., MongoDB, Redis) so the token polling endpoint can retrieve and validate them.

---

## 🔐 Client Authentication

In this example, client authentication is handled using:

```ts
.addClientAuthenticationMethod(new NoneAuthMethod())
```

This means **no authentication method is required**, which is suitable for public clients like smart TVs or CLI tools.

You can replace it with `ClientSecretBasic` or `ClientSecretPost` for confidential clients.

---

## ⏳ Token Polling and Completion (not in this example)

While `authorizationRoute()` defines how the device gets a `device_code`, the **token polling endpoint** (not shown here) must:

* Accept the `device_code`
* Check if the user has authorized it
* Issue the access token if approved

That part is typically handled by the `.tokenRoute()` builder method.

---

## Summary

The `authorizationRoute()` in the Device Authorization Flow provides a minimal and secure way for devices with limited input to start an authentication session. It generates and persists device and user codes, which are used to link the device session with the user's identity via a separate verification interface.

The `OAuth2DeviceAuthorizationBuilder.authorizationRoute()` is structurally identical to the OIDC version.

---
