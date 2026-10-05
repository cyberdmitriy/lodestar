---
name: error-handling-audit
description: "Audit and fix error handling and logging gaps across web applications. Detects silent exceptions, lost tracebacks, wrong logger usage, missing error states in UI, and unhandled async operations. Supports Python, Laravel/PHP, and React/JS/TS. Auto-detects the project stack. Use when asked to audit error handling, find silent failures, fix logging, or ensure no error paths leave the UI in a broken state."
---

# Error Handling Audit

Audit and fix error handling and logging gaps in this project. Find silent exceptions, lost tracebacks, wrong logger usage, missing UI error states, and unhandled async operations. Fix them, re-scan, then verify.

## Invocation

- `/lodestar:error-handling-audit` — auto-detect stack, audit everything
- `/lodestar:error-handling-audit --stack python,react` — audit specified layers only
- `/lodestar:error-handling-audit --path apps/backend/` — limit scope to a subdirectory
- `/lodestar:error-handling-audit --stack laravel --path apps/web/` — combined

## Argument Parsing

Parse `$ARGUMENTS` for:
- `--stack` — comma-separated list. Recognized values: `python`, `laravel`, `react`. Case-insensitive. If absent, auto-detect all stacks.
- `--path` — relative path to limit audit scope. When provided, stack auto-detection is scoped to that path only. If absent, audit the entire project.
- `--report-only` — scan and report findings without applying any fixes. Skip all auto-fix and ask steps. Output the same report format but with proposed fixes listed as recommendations, not applied changes. Useful when called from other skills (e.g., `/review-session`) that collect findings before fixing.

## Global Rules

### Test File Exclusion

Exclude test files from all fix patterns. Test file patterns: `*_test.py`, `*Test.php`, `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`, directories named `tests/`, `__tests__/`, `test/`. Verification greps also exclude test directories.

### Auto-Fix vs. Ask

Each pattern has a **Mode** (auto-fix or ask):

- **Auto-fix:** mechanical, safe replacement. Apply without asking. Examples: `print()` → `logger.info()`, `logger.error()` → `logger.exception()` in except blocks, removing `dd()`.
- **Ask:** fix changes control flow (adds re-raise, changes return value, adds redirect), adds structural code (error boundaries, `failed()` methods), or requires choosing between re-throw vs. swallow. Present the specific case and proposed fix to the user, apply only with confirmation.

### Scope Guardrail

If Pass 1 scan finds violations in more than 30 files, pause before applying fixes. Present a summary of findings by category and file count, then ask the user to confirm or narrow scope with `--path`.

## Process

### Phase 0 — Discovery

Run these steps before any fixes.

#### Step 1: Read Project Conventions

Check CLAUDE.md, README, `docs/`, `.editorconfig`, and linter configs for documented error-handling or logging conventions. Project conventions override all skill defaults. If the project documents a specific logger, logging pattern, or error-handling approach, use that as the standard.

#### Step 2: Stack Detection

Scan the project root and common subdirectories (`apps/`, `src/`, `packages/`, `services/`) for:

| Marker file | Detected stack |
|------------|---------------|
| `pyproject.toml`, `requirements.txt`, `setup.py`, `Pipfile` | Python |
| `composer.json` | Laravel/PHP |
| `package.json` with `react`, `next`, `vue`, `svelte` in dependencies | React/JS/TS |

Produce a list of `(stack, root_path)` tuples. In monorepos with multiple apps of the same stack, each app is discovered separately.

If `--stack` was provided, use only those stacks. If `--path` was provided, scope detection to that path only.

#### Step 3: Logging Setup Discovery

For each detected `(stack, root_path)`, find the logging infrastructure:

**Python:** grep for `getLogger`, `get_logger`, `structlog`, `loguru`. Check for log config files, `LOGGING` dict in settings, custom logger modules.

**Laravel/PHP:** read `config/logging.php` for channels. Check for custom Log facades, Monolog config, exception handler in `bootstrap/app.php` or `app/Exceptions/Handler.php`.

**React/JS/TS:** grep for Sentry, Bugsnag, DataDog, LogRocket imports. Check for custom error hooks (`useError`, `useErrorHandler`), global `window.onerror` or `window.addEventListener('error')`, toast/notification system.

#### Step 4: Logging Health Evaluation

Rate the logging setup per detected app:

- **Solid** — a dedicated logger module/class exists and is imported by the majority (>50%) of source files. Proceed to audit using this logger as the standard.
- **Fragmented** — a logger exists but less than half of source files use it. Note the dominant pattern. Audit normalizes toward it.
- **Missing/Broken** — no identifiable logging setup beyond stdlib defaults, or a setup exists but most code bypasses it. **Stop and ask:**

> "I found [specific issues — e.g., '14 of 20 Python files use `print()` instead of any logger, and there is no centralized logger module']. The project would benefit from [specific proposal — e.g., 'a centralized `get_logger()` utility that writes to a file handler']. Want me to set this up first, then audit? Or audit as-is?"

#### Step 5: Check for Request Logging Middleware

Before applying entry-logging patterns (U5), check for existing request/response logging middleware:

**Python:** `@app.middleware("http")`, Starlette `BaseHTTPMiddleware`, request logging in `app.py` or `main.py`.

**Laravel:** scan `app/Http/Middleware/` for ANY middleware that logs requests or responses — not just `LogRequest`. Look for middleware classes that contain `Log::`, `logger()`, or `log(` calls combined with `$request` or `$response` access. Also check `bootstrap/app.php` and `Kernel.php` for middleware registration. Common names include `LogApiErrors`, `LogRequest`, `RequestLogger`, `AuditLog`, but always scan the actual middleware directory rather than matching names.

Additionally, check for request ID middleware (`RequestId`, `CorrelationId`) — these provide request tracing which partially satisfies the debugging goal of U5.

If any middleware-level request/response logging or tracing exists for a layer, skip U5 for that layer.

### Pass 1 — Find & Fix

Load the relevant `references/<stack>-patterns.md` files for each detected stack (read them now).

For each detected `(stack, root_path)`:

1. **Scan** — search all source files (excluding tests) for every pattern violation listed in the universal patterns below AND the loaded language-specific reference.
2. **Scope check** — skip if `--report-only` (nothing is changed, so a large scope needs no confirmation). Otherwise, if violations span more than 30 files, pause, present summary, ask user to confirm or narrow with `--path`.
3. **If `--report-only`:** skip steps 4–5. Record all findings with proposed fixes as recommendations. Proceed directly to output.
4. **Auto-fix** — apply all auto-fix mode patterns without asking. Track each change (file, pattern ID, what changed).
5. **Ask** — for ask-mode patterns, present each case with: file path, current code, proposed fix, and pattern ID. Apply only with user confirmation.

### Pass 2 — Re-scan

**Skip entirely if `--report-only`.**

Re-run the same pattern detection across the entire audit scope. Pass 1 fixes can introduce new issues:
- A new `try/catch` that itself has no logging
- A logger import added but the `logger` variable declaration missing
- An unused import left behind after replacing `print()` with `logger`

Fix any new violations found using the same auto-fix/ask rules.

**Termination:** Pass 2 is exactly one re-scan. No further fix passes occur regardless of what is found. Any remaining issues surface in Pass 3.

### Pass 3 — Verification

Run automated checks to confirm no regressions. Discover which tools are available first — do not assume any tool exists.

#### Tool Discovery

| Layer | Check for |
|-------|----------|
| Python | `pyproject.toml` or `Makefile` for pytest, flake8, pylint, mypy, black, isort commands. Check `uv`, `poetry`, `pip` as runners. |
| Laravel | `composer.json` scripts for test/lint, `vendor/bin/sail`, `vendor/bin/pest`, `vendor/bin/phpstan`, `vendor/bin/pint` |
| React | `package.json` scripts for test/lint, `node_modules/.bin/tsc`, `node_modules/.bin/eslint`, `node_modules/.bin/vitest` or `jest` |

Run only what exists. Skip gracefully with a note if not configured.

#### Verification Checks

**Linters & Type Checks** — run all available linters and type checkers for each detected layer.

**Tests** — run the test suite for each layer. If tests or linters fail on issues unrelated to audit changes, report them but don't count as audit failures.

**Zero-violation Grep Checks** — always run these regardless of tooling:

**Python** (excluding test files and `prompts.py`):
- `print(` — zero expected
- `logging.getLogger` outside the project's logger utility — zero expected
- Bare `except:` — zero expected
- `logger.error` inside except blocks — soft check (flag remaining, don't count as failure; legitimate for intentionally omitted tracebacks)

**Laravel** (excluding test files):
- `dd(` — zero expected
- `dump(` — zero expected
- `ray(` — zero expected
- `error_log(` — zero expected
- `catch` blocks without `Log::` — zero expected

**React** (excluding test files):
- `.catch(() => {})` or `.catch(() => null)` — zero expected
- Empty catch blocks — zero expected
- `console.log` in error handlers — zero expected

**Structural patterns** (RE4 error boundaries, LA5 `failed()` methods, RE10 useEffect cleanup) are not grep-verifiable — they were verified during Pass 2 re-scan.

## Universal Patterns

These patterns apply to every detected layer. Language-specific patterns in `references/` extend this list.

### Security Constraint

When adding or modifying log statements, **never log raw request bodies, full response payloads, user input, or authentication data**. Log identifiers (IDs, UUIDs, status codes, key names) and truncated error messages (max 500 chars). The goal: an engineer can find and reproduce the issue from the log line without exposing sensitive content.

When fixing a pattern violation that involves logging, always ask: "Does this log statement expose data that shouldn't be in logs?" If yes, log only the identifiers and metadata needed for debugging.

| # | Pattern | What's Wrong | Fix | Mode |
|---|---------|-------------|-----|------|
| U1 | Silent exception handlers | `catch`/`except` block with no logging | Add logger call with full traceback | auto-fix |
| U2 | Error logged without traceback | Only message string logged, stack trace lost | Use traceback-preserving method: Python `logger.exception()`, PHP `Log::error($msg, ['exception' => $e])`, JS `console.error(err)` | auto-fix |
| U3 | Debug output in production code | `print()`, `dd()`, `dump()`, `console.log()` used for error output | Replace with proper logger at appropriate level | auto-fix |
| U4 | HTTP error responses without body | Outgoing HTTP call gets 4xx/5xx, response body not logged | Log `response.text[:500]` or `$response->body()` (truncated) | auto-fix |
| U5 | Entry points without entry logging | Route handler with no debug log at entry (only if no request middleware — see Phase 0 Step 5) | Add `logger.debug()`/`Log::debug()` with key request params | ask |
| U6 | Unhandled error paths in UI | Frontend `catch` that does not surface anything to the user | Every error path must end with visible user feedback: toast, error message, fallback UI, or redirect. Never a silent swallow or stuck spinner. | ask |
| U7 | Stuck loading states | Error occurs but loading/spinner state never resolves | Ensure error handlers reset loading state (e.g., `finally { setLoading(false) }`) and show error | auto-fix |
| U8 | Missing error handling on async ops | Promises without `.catch()`, `async` without `try/catch`, fire-and-forget calls | Add error handling that logs and surfaces to user | ask |

## Output

After all three passes, print a concise terminal summary:

~~~
Error Handling Audit Complete
═══════════════════════════════

Stack detected: <list of (stack, root_path) tuples>

Pass 1 — Fix:          N changes across M files (auto-fix: X, user-confirmed: Y)
Pass 2 — Re-scan:      N additional fixes in M files
Pass 3 — Verification: All clear / N issues

  <Layer>   ✓/✗ <tool> (<detail>)  ...
  Skipped   <pattern> (<reason>)

Changes by category:
  <Category>:   N (PY: n, LA: n, RE: n)
  ...

No commit made. Review changes with: git diff
~~~

Do NOT commit. The user reviews changes via `git diff` first.

## Extensibility

To add a new language/framework:

1. Create `references/<language>-patterns.md` following the same table format (include Mode column and Detection Notes)
2. Add stack detection markers to Phase 0 Step 2
3. Add logging discovery rules to Phase 0 Step 3
4. Add verification grep checks to Pass 3
5. Add request middleware detection to Phase 0 Step 5

No changes to the core process needed.

**Future:** `--dry-run` flag to report findings without applying fixes.

**Framework-specific notes:** Some frameworks have unique error surfaces (e.g., Inertia.js version mismatch handling, Next.js `error.tsx` boundaries, Django middleware exception hooks). Add these as notes within the relevant language reference file.
