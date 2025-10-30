### 💡 Why `extensions()` works well

* **Broad but precise:**
  It naturally covers many kinds of add-ons: features, integrations, runtime hooks, etc.
  It doesn’t imply that every plugin must expose a callable API.

* **Semantically consistent with `extend()`:**
  The mental model lines up beautifully:

  ```js
  await app.extend(MyPlugin)
  app.extensions().myplugin.run()
  ```

  → “I extended the app, now I can access the extensions.”

* **Optional participation:**
  Plugins that don’t expose anything don’t have to appear under `extensions()`.
  Others can register themselves there dynamically if they want to be discoverable.

* **Future-proof:**
  Maybe later add metadata or introspection (e.g., `app.extensions().list()` or `app.extensions().has('myplugin')`).

---

### 🧠 Example Pattern

```js
// registration
await app.extend(MyPlugin)
await app.extend(StartupLogger)
await app.extend(DatabasePlugin)

// later
app.extensions().myplugin.run()
app.extensions().database.query('SELECT * FROM users')

// StartupLogger never exposes anything — that’s fine
```

---
