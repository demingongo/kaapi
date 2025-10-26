# @kaapi/kaapi

[![npm version](https://img.shields.io/npm/v/@kaapi/kaapi.svg?color=blue&style=flat-square)](https://www.npmjs.com/package/@kaapi/kaapi)
[![Docs](https://img.shields.io/badge/Docs-Wiki-brightgreen.svg?style=flat-square)](https://github.com/demingongo/kaapi/wiki)
[![TypeScript](https://img.shields.io/badge/Built%20With-TypeScript-blue.svg?style=flat-square)](https://www.typescriptlang.org/)


Kaapi is a **modern, extensible backend framework** built on [Hapi](https://hapi.dev/), offering a **TypeScript-first design**, **plugin-based** architecture with **messaging**, **authentication**, and **automatic API documentation** baked in.

---

## 🚀 Features

- ⚡ **Simple Setup** — Minimal boilerplate, Hapi-compatible routing  
- 🔐 **Auth Designs** — Built-in Basic, Bearer, and API Key authentication  
- 🧱 **Plugins System** — Extend Kaapi easily with `app.extend()`  
- 📘 **API Docs** — Swagger & Postman generation out of the box  
- 📡 **Messaging Abstraction** — Kafka, MQTT, AMQP, or custom  
- 🪵 **Powerful Logging** — Winston-based or custom logger support  
- 🧩 **Type Safe** — Fully typed with first-class TypeScript support  

---

## 🧰 Quick Start

```bash
npm install @kaapi/kaapi
```

```ts
import { Kaapi } from '@kaapi/kaapi';

const app = new Kaapi({ port: 3000, host: 'localhost' });

app.route({ method: 'GET', path: '/' }, () => 'Hello Kaapi!');
await app.listen();

app.log.info(`🚀 Server running at http://localhost:3000`);
```
🧭 Visit: [`http://localhost:3000`](http://localhost:3000)

---

## 📚 Documentation

👉 **Full documentation available here:**
🔗 [Kaapi Wiki →](https://github.com/demingongo/kaapi/wiki)

---

## 💡 Example Features

* **Auth:** `BearerAuthDesign`, `BasicAuthDesign`, `APIKeyAuthDesign`
* **Docs:** `/docs/api` (Swagger UI), `/docs/api/schema?format=postman`
* **Messaging:** Abstract interface for Kafka, MQTT, etc.
* **Extend:** Custom plugins via `KaapiPlugin` interface
* **Logger:** Built-in Winston logger or bring your own

---

## 🧠 Why Kaapi?

Kaapi focuses on **clarity**, **composability**, and **developer productivity**:

> One framework, many patterns — REST, messaging, auth, docs — all in TypeScript.

---

