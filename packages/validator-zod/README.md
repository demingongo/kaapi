# @kaapi/validator-zod

Zod validator for kaapi.

It provides validation of `req.params`, `req.payload`, `req.query`, `req.headers`, `req.state` with a [Zod 4](https://www.npmjs.com/package/zod) schema and documentation generator helpers.

## Installation

```bash
npm install @kaapi/validator-zod
```

### Requirements

Zod4

```bash
npm install zod@^4.0.0
```

## Usage

### Set validator

### Create schema

### Create route

### Overrides

Override the validator's options

| failAction | Behavior                     | Safe?                    | Description                                   |
| ---------- | ---------------------------- | ------------------------ | --------------------------------------------- |
| `'error'`  | Reject with validation error | ✅                        | Default safe behavior                         |
| `'log'`    | Log + reject                 | ✅                        | For observability without accepting bad input |
| `function` | Custom handler               | ✅ (developer-controlled) | Must return or throw explicitly               |
| `'ignore'` | ❌ Not supported              | ❌                        | Unsafe, not implemented                       |
