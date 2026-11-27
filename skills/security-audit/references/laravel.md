# Laravel checklist

For finders: where Laravel code usually goes wrong. For verifiers: what Laravel already protects by default.

## Safe by default

These are not findings on their own:

- Eloquent and query builder methods bind values: `where('email', $input)`, `whereIn`, `find`, `create([...])`, `update([...])`.
- Blade `{{ }}` escapes for HTML text and quoted attributes; it does not make a value safe in `href`/`src` (`javascript:` URLs), in event-handler attributes or inside `<script>`. `@json` and `Js::from()` encode for JavaScript.
- The `web` middleware group rejects cross-site POST, PUT, PATCH and DELETE requests: `ValidateCsrfToken` (`VerifyCsrfToken` up to Laravel 10) checks the token; Laravel 13's `PreventRequestForgery` accepts a same-origin `Sec-Fetch-Site` and otherwise checks the token. GET routes are never checked.
- `Hash::make()` / `Hash::check()` hash passwords properly. `Str::random()` and `random_bytes()` are cryptographically secure.
- `$request->validated()` and `$request->safe()` return only validated fields. A field validated only as `array`, with no listed keys and no `field.*` rules, comes back with every nested key the client sent.
- `Process::run([...])` with an array of arguments does not go through a shell. A string command does. An array element that starts with `-` can still be read as an option (`git`, `curl`, `tar`): argument injection.
- Route model binding returns 404 for a missing record. It does **not** check ownership.

## Look for

**Injection**

- `DB::raw`, `DB::select/insert/update/delete/statement/unprepared`, `whereRaw`, `orWhereRaw`, `havingRaw`, `orderByRaw`, `selectRaw`, `groupByRaw` with input concatenated or interpolated instead of passed as bindings.
- Column names from the request without an allowlist: `orderBy($request->sort)`, `where($request->field, …)`, `select($request->columns)`. A direction alone is not a finding: `orderBy()` throws on anything but `asc` / `desc`.
- `exec`, `shell_exec`, `system`, `passthru`, `proc_open`, backticks, `Process::run('… ' . $input)` or any string command built from input (`Process::start()`, `Process::pipe()`), Symfony `Process::fromShellCommandline()` with input.
- `unserialize()` on request data, cookies, or cache and database values a user can write.
- `Blade::render($userString)` or a view compiled from user input: template injection that runs PHP.
- `include` / `require` with a path from input.

**XSS**

- `{!! $value !!}` and `new HtmlString($value)` where `$value` holds user data.
- HTML built by hand in PHP (controllers, mail, notifications) without `e()`.
- `Str::markdown($input)`, `Str::inlineMarkdown($input)` or a CommonMark converter on user input without `'html_input' => 'strip'` (or `'escape'`) and `'allow_unsafe_links' => false`.

**Access control**

- New routes outside the `auth` (or `auth:sanctum`) group that return or change non-public data.
- Controller actions, Livewire components, Filament or Nova resources, and jobs started from a request that load a model by ID or route binding without `authorize()`, `Gate`, a policy, `can:` middleware, or a query scoped to the current user or tenant.
- A Form Request whose `authorize()` returns `true` for a resource that belongs to a user.
- Livewire public properties that hold an ID or a role the client can change (no `#[Locked]`), and actions that use them without authorization.
- `withoutMiddleware(...)` on routes that need auth; routes added to the CSRF exceptions (`VerifyCsrfToken::$except` up to Laravel 10, `validateCsrfTokens(except: [...])` in 11–12, `preventRequestForgery(except: [...])` in 13) while browsers call them with a session cookie; `preventRequestForgery(allowSameSite: true)` when a sibling subdomain serves user content.
- Mass assignment: `$guarded = []`, `#[Unguarded]`, `Model::unguard()`, or `$fillable` / `#[Fillable([...])]` holding fields like `role`, `is_admin`, `user_id`, `team_id`, `price`, combined with `create($request->all())`, `fill($request->input())`, `update($request->all())`, `forceFill(...)`.
- Actions behind links in emails (unsubscribe, confirm, download) without the `signed` middleware or `hasValidSignature()`. Values of a signed URL read with `input()`, `all()` or dynamic properties instead of `query()`: the request body overrides the signed query string.

**Data exposure**

- Models returned straight from a controller (`return $user`, `response()->json($model)`, `->toArray()`) without `$hidden` or `#[Hidden([...])]` on `password`, `remember_token`, API tokens and two-factor secrets; API Resources that include fields of other users.
- `Log::` calls with `$request->all()`, passwords, tokens, or full card or ID numbers.
- `Cache::remember()` for per-user data with a key that does not include the user.
- Real secrets committed in `.env*` files or as literals in `config/*.php`.

**Files**

- Uploads validated without `mimes:`, `mimetypes:` or `extensions:`, or stored on the `public` disk under the client's name or extension (`storeAs($dir, $file->getClientOriginalName())`): an attacker can upload `.html` or `.svg` (stored XSS), or `.php` when the server executes it.
- `response()->download($input)`, `response()->file($input)` without confining the path to one directory. `Storage::download($input)` cannot leave the disk root (Flysystem rejects `../`), but serves any file on that disk: check that the user may read that file.

**Outbound and redirects**

- `Http::get($request->url)` and similar with a host the attacker chooses: SSRF to internal services or cloud metadata (`169.254.169.254`).
- `Http::withoutVerifying()` or `'verify' => false` on calls that carry credentials or personal data.
- Absolute URLs built during a request (password-reset and verification links, `url()`, `route()`) while neither the web server nor `trustHosts(at: [...])` restricts the `Host` header: an attacker sets `Host`, and the emailed link points to their site.
- `redirect($request->input('next'))`, `redirect()->away($input)`: report only when the redirect leaks a token or an authorization code.
