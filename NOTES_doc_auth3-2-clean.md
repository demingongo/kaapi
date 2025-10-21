# OAuth2 Device Authorization Flow with `authorizationRoute`

This guide demonstrates how to implement the **OAuth2 Device Authorization Flow** using the `OIDCDeviceAuthorizationBuilder` and its `.authorizationRoute()` method, provided by the [`@kaapi/oauth2-auth-design`](https://www.npmjs.com/package/@kaapi/oauth2-auth-design) package.

This flow is designed for **input-constrained devices** such as smart TVs, CLI tools, or IoT devices. It allows the user to authenticate using a separate browser-enabled device.

---

## Example Implementation

```ts
import {
  NoneAuthMethod,
  OIDCDeviceAuthorizationBuilder
} from '@kaapi/oauth2-auth-design'

export default OIDCDeviceAuthorizationBuilder
  .create()
  .addClientAuthenticationMethod(new NoneAuthMethod())
  .authorizationRoute(route =>
    route
      .setPath('/oauth2/devicecode')
      .generateCode(async ({ clientId, scope }, request) => {
        // Reject invalid clients
        // return null // Triggers 400 with { error: "invalid_client" }

        // On success, return a DeviceCodeResponse:
        return {
          device_code: 'device-code',
          user_code: 'ABC123',
          verification_uri: 'https://example.com/verify',
          verification_uri_complete: 'https://example.com/verify?user_code=ABC123',
          expires_in: 900,
          interval: 5
        }
      })
  )
```

---

## `authorizationRoute()` Overview

In the Device Authorization Flow, the `authorizationRoute()` method defines the behavior of the **Device Authorization Endpoint**. It responds to a device's request for a `device_code` and `user_code`, allowing the user to complete authentication on a separate browser-capable device.

This builder method supports:

* Customizing the endpoint path.
* Validating the client and scope.
* Generating codes.
* Returning the response per [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628).

---

### 🔧 Configuration Methods

| Method                          | Purpose                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `setPath('/oauth2/devicecode')` | Sets the path for the device authorization endpoint. Default is `/oauth2/devicecode`. |
| `generateCode(handler)`         | Implements the logic to create and return the `device_code` response. |

---

## 📥 `generateCode()` Handler

This method is called whenever a device initiates a device authorization request. It must validate the client and return a properly structured response containing a `device_code`, `user_code`, and verification URLs.

### Parameters

```ts
.generateCode(async (params, request) => { ... })
```

| Parameter | Type                                   | Description                                                            |
| --------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `params`  | `{ clientId: string; scope?: string }` | Contains input from the device authorization request.        |
| `request` | `Request`                              | The raw request object. Use this to access headers, metadata, IP, etc. |

#### `params` Object Fields

| Field      | Type      | Description                                             |
| ---------- | --------- | ------------------------------------------------------- |
| `clientId` | `string`  | The client initiating the device authorization request. |
| `scope`    | `string?` | (Optional) Space-delimited list of scopes requested.    |

---

### ✅ Return Value (DeviceCodeResponse)

When the client is valid and the request is accepted, return an object matching the OAuth2 Device Authorization spec:

```ts
return {
  device_code: 'device-code',                          // Opaque code used by the device to poll the token endpoint
  user_code: 'ABC123',                                 // Short code shown to the user
  verification_uri: 'https://example.com/verify',      // URI the user navigates to
  verification_uri_complete: 'https://example.com/verify?user_code=ABC123', // URI with code prefilled
  expires_in: 900,                                     // Lifetime in seconds (e.g. 900s = 15 min)
  interval: 5                                          // Recommended polling interval in seconds
}
```

#### ❌ Invalid Clients

Return `null` to respond with:

```json
{
  "error": "invalid_client"
}
```

---

## 🔐 Client Authentication

In the example:

```ts
.addClientAuthenticationMethod(new NoneAuthMethod())
```

This allows **public clients** (like TVs or CLI tools) to use the endpoint without authentication. For confidential clients, you can use:

```ts
.addClientAuthenticationMethod(new ClientSecretBasic())
.addClientAuthenticationMethod(new ClientSecretPost())
```

---

## 🧠 Flow Recap

1. **Device** sends a `POST /oauth2/devicecode` request with:

   * `client_id`
   * `scope` (optional)

2. **Server** responds with:

   * `device_code`
   * `user_code`
   * `verification_uri`
   * `verification_uri_complete`
   * `expires_in`
   * `interval`

3. **User** navigates to the verification URI and enters the `user_code`.

4. **Device** polls the token endpoint using the `device_code` until:

   * The user authorizes it (token issued)
   * Or it expires

---

## 🗃️ Persistence Requirements

You **must persist** the following:

| Field         | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `device_code` | Used to poll the token endpoint.                     |
| `user_code`   | Shown to the user for browser input.                 |
| `expires_at`  | Expiration timestamp to prevent re-use.              |
| `client_id`   | Who initiated the request.                           |
| `scope`       | Scopes requested for the session.                    |
| `status`      | Whether the user has approved or denied the request. |

Use a durable store like a database or in-memory cache (e.g., Redis) to track the session lifecycle.

---

## ⏳ Polling (Handled Elsewhere)

The `authorizationRoute()` only covers issuing the device and user codes. It does **not** handle token polling.

Use `.tokenRoute()` to implement the token endpoint, where:

* Devices poll with `device_code`
* Server checks authorization status
* Issues access token if approved

---

## Summary

The `authorizationRoute()` method for the Device Authorization Flow is responsible for:

* Validating incoming device requests
* Generating secure `device_code` and `user_code`
* Returning a complete response that guides the user to verify their identity

It's designed to work seamlessly with constrained devices, while keeping the authentication process user-friendly and secure.

The `authorizationRoute()` method works the same way for both `OAuth2DeviceAuthorizationBuilder` and `OIDCDeviceAuthorizationBuilder`.

---

👉 Next: [[Implement the token endpoint|Authorization-‐-OAuth2-‐-Tuto-4-‐-Token-Issuance-with-tokenRoute]] to support polling with `device_code`.
