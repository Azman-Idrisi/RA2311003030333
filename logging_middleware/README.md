# logging-middleware

Reusable function to send logs to the evaluation service API.

## Usage

```js
const { Log } = require('./logging_middleware');

await Log("backend", "error", "handler", "received string, expected bool");
await Log("backend", "fatal", "db", "database connection lost");
await Log("backend", "info", "service", "request handled ok");
```

`Log(stack, level, package, message)` — all lowercase. Message max 48 chars.

**stack:** `backend`, `frontend`

**level:** `debug`, `info`, `warn`, `error`, `fatal`

**package (backend):** cache, controller, cron_job, db, domain, handler, repository, route, service, auth, config, middleware, utils

**package (frontend):** api, component, hook, page, state, style, auth, config, middleware, utils

Token is fetched and cached automatically — no manual auth needed.

## Setup

```bash
npm install
node test.js   # to verify it works
```
