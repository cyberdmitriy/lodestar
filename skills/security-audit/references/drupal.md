# Drupal checklist (8 and later)

For finders: where Drupal code usually goes wrong. For verifiers: what Drupal already protects by default.

## Safe by default

These are not findings on their own:

- Database API placeholders (`:name`) and `->condition()` bind values, in both `select()` queries and entity queries.
- Twig escapes output. `t()`, `$this->t()` and `FormattableMarkup` escape `@var` and `%var` strings; `:var` is escaped and filtered as a URL. Not covered: a non-literal first argument (`t($input)`), a `MarkupInterface` value (inserted as is), `@`/`%` inside an HTML attribute.
- A string in `#markup` passes through `Xss::filterAdmin()`: an allowlist of body tags without `script`, `style`, `iframe`, `object`, `embed`, `form` or `svg`, with `on*`, `style` and `srcdoc` attributes and dangerous URL protocols removed. User data in such a string is HTML injection at most, rarely XSS. A `Markup` object in `#markup` is not filtered, and `#allowed_tags` replaces the tag list. `#plain_text` escapes everything.
- Form API forms carry a CSRF token for authenticated users and reject values outside `#options`.
- A route whose access checks all return neutral is denied.
- Permissions marked `restrict access: true` (for example `administer users`, `administer permissions`) are trusted. What a user holding one can do with it is not a vulnerability.

## Look for

**Injection**

- `$connection->query()`, `\Drupal::database()->query()` or D7 `db_query()` with variables concatenated into the SQL instead of placeholders.
- `->where()`, `->addExpression()`, `->having()` with interpolated input, field names included. `orderBy()` keeps only ASC/DESC and escapes the field, and `condition()` escapes the field and rejects odd operators: a sort field from the request is not injection, though it can sort by a private column.
- `'#type' => 'inline_template'` with user data inside `#template`: template injection. Data belongs in `#context`.
- `unserialize()` on request data or on data a user can store.
- `exec`, `shell_exec`, `proc_open`, `system` with input.

**XSS**

- `Markup::create($input)`, `ViewsRenderPipelineMarkup::create($input)`, `#children` with user data.
- Twig `|raw` on user data.
- JavaScript that writes server data through `.html()`, `innerHTML` or `$(string)` instead of `Drupal.checkPlain()` or `Drupal.t()` placeholders.
- Text format config in the diff (`filter.format.*.yml`) that lets untrusted roles post `script`, `iframe`, `style` or event-handler attributes, or a `user.role.*.yml` that gives an untrusted role `use text format full_html`.

**Access control**

- `*.routing.yml`: `_access: 'TRUE'` on a route that returns non-public data or performs an action; a `_permission` weaker than the data needs (`access content` for private data).
- Controllers, forms, REST resources and custom JSON endpoints that load an entity by an ID from the request without `$entity->access('view' | 'update' | 'delete')`.
- Entity queries with `->accessCheck(FALSE)` whose results reach users who must not see them; SQL queries on nodes without `->addTag('node_access')`.
- State-changing routes reachable by a plain GET link (`/item/5/delete`) without `_csrf_token: 'TRUE'` in the route requirements.
- `'#token' => FALSE` on forms for authenticated users; reading `$form_state->getUserInput()` where `->getValue()` would enforce `#options`.
- `AccessResult::allowed()` / `allowedIf()` that depends on the user or the entity without `->cachePerUser()`, `->cachePerPermissions()` or `->addCacheableDependency()`: the access decision is cached and served to other users.
- Render arrays with per-user or per-role data without matching `#cache` contexts (`user`, `user.permissions`, `user.roles`): one user's data is cached and shown to another.
- Views config in the diff (`views.view.*.yml`) that lists nodes or users with `disable_sql_rewrite: true` or access type `none`: node access is switched off for that view.
- Custom node listings, JSON endpoints and autocompletes without a `status` condition. While no module implements node grants, `accessCheck(TRUE)` and the `node_access` tag do not hide unpublished nodes.

**Files**

- Upload validators that allow every extension (`FileExtension` with an empty `extensions`, or `file_validate_extensions` with an empty list up to D10), `svg`, `html`, `htm` or `xml` in the allowed list for files on `public://`, `allow_insecure_uploads: true` in `system.file.yml`, or private documents saved to `public://`. Without an extension validator Drupal applies its default list (`jpg jpeg gif png txt doc xls pdf ppt pps odt ods odp`) and renames `php`, `phar`, `js` and similar to `.txt`.
- `file_get_contents()`, `readfile()`, `BinaryFileResponse` on a path built from input.

**Secrets**

- `settings.php` committed with database credentials or a literal `hash_salt`.

**Outbound and redirects**

- `\Drupal::httpClient()->get($input)` with a host the attacker chooses: SSRF.
- `new TrustedRedirectResponse($input)` with user input: it skips the external-URL check. Report only when the redirect leaks a token or an authorization code.
