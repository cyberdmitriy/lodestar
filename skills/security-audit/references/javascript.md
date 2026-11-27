# JavaScript checklist: Node, browser, Electron

For finders: where JavaScript code usually goes wrong. For verifiers: what the platform already protects by default.

## Safe by default

These are not findings on their own:

- React, Vue and Angular templates escape text.
- Parameterized queries bind values: `?` / `$1` placeholders, ORM query methods (Prisma `findMany({ where })`, Sequelize `where`), Prisma `$queryRaw` / `$executeRaw` as a tagged template or with `Prisma.sql`. `$queryRawUnsafe`, `$executeRawUnsafe`, `Prisma.raw()` with input, and `knex.raw()` without bindings do not.
- `child_process.execFile()` and `spawn()` with an argument array and without `shell: true` do not go through a shell. An argument that starts with `-` can still be read as an option (`git`, `curl`, `tar`): argument injection.
- Electron defaults: `nodeIntegration: false` and `webviewTag: false` since 5, `contextIsolation: true` since 12, renderer `sandbox: true` since 20 unless the window sets `nodeIntegration: true`. Check the Electron version in `package.json` before reporting a default.

## Look for

**Node and server code**

- `exec()`, `execSync()`, `spawn(…, { shell: true })` with interpolated input.
- `eval()`, `new Function()`, `setTimeout(string)` / `setInterval(string)` (browsers only; Node throws on a string), `vm.runIn*()` with input. `vm` is not a security boundary.
- SQL built in template strings and passed to `query()`, `$queryRawUnsafe()`, `Prisma.raw()`, `knex.raw()` without bindings.
- NoSQL operator injection: objects from `req.body` or `req.query` passed into Mongo queries (`{ password: { $ne: null } }`) without casting to a string or validating against a schema. Express 5's default query parser gives `req.query` no nested objects; Express 4 and `query parser: 'extended'` do.
- Path traversal: `path.join(base, input)`, `res.sendFile()`, `fs.readFile()` without checking that the resolved path stays inside the base; archive extraction without checking entry paths (zip slip).
- JWT: `jwt.decode()` used where `jwt.verify()` is needed; `verify()` without pinned `algorithms` when the key setup allows algorithm confusion.
- CORS: `origin: true`, or the request's `Origin` echoed back, together with `credentials: true`.
- New routers or routes without the auth middleware that their siblings use; `express.static()` serving the project root or a directory with `.env`.
- `fetch()` / `axios` to a URL from the request: SSRF.

**Browser code**

- `dangerouslySetInnerHTML`, `v-html`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, jQuery `.html()` and `$(input)` with untrusted data and without DOMPurify.
- `href`, `src`, `action`, `formAction`, `location.href`, `location.assign()`, `window.open()` set from user data without allowing only `http:` and `https:`. React 19+ neutralizes `javascript:` in JSX `href`, `src`, `action` and `formAction`; Vue bindings, direct DOM writes and `location` / `window.open` do not.
- `message` event handlers that act on `event.data` without checking `event.origin`.

**Electron**

- A `BrowserWindow` that loads remote or user-supplied content with `nodeIntegration: true`, `contextIsolation: false`, `sandbox: false`, `webSecurity: false` or `allowRunningInsecureContent: true`.
- `contextBridge.exposeInMainWorld()` exposing `ipcRenderer` itself, a generic `send(channel, …)` / `invoke(channel, …)` passthrough, or Node modules (`fs`, `child_process`).
- `ipcMain.handle()` / `ipcMain.on()` handlers that run commands, read or write files, or open URLs with arguments from the renderer without validation. Treat the renderer as untrusted when it loads remote content or renders user data; sensitive handlers should check `event.senderFrame`.
- `shell.openExternal(url)` with a URL from the renderer or from remote content without allowing only `https:`. `file:`, `smb:` and custom protocols can run code.
- No `setWindowOpenHandler()` or `will-navigate` guard while the app shows remote content: a link can navigate a privileged window to an attacker's page.
- `<webview>` with `nodeintegration` or `allowpopups` on remote content.
- `@electron/remote` enabled (`require('@electron/remote/main').enable(webContents)`, or `enableRemoteModule: true` before Electron 14) for a window that shows remote content or user data: it hands the renderer main-process modules, so any XSS becomes code execution.
- Custom protocol handlers (`protocol.handle()`) that serve files by a path from the URL without confining it to one directory.
