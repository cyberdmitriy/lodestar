# What is not reported

Shared by the finders and the verifiers. A candidate that matches an item here is not reported, unless it also matches **Always in scope** at the end.

## Out of scope

1. Denial of service: resource exhaustion, ReDoS, large payloads, missing rate limits, brute force against a login without a bypass.
2. Vulnerable or outdated dependencies. The package manager's audit covers them.
3. Missing hardening that is not itself a hole: security headers (CSP, HSTS, X-Frame-Options), cookie flags, password policies, missing audit logs.
4. Race conditions and timing side channels, unless you can name the two concurrent requests and what the attacker gains (a coupon redeemed twice, a balance spent twice).
5. Memory safety issues in memory-safe languages.
6. Tests, fixtures, factories and seeders for local data, documentation, examples.
7. Log injection and log spoofing.
8. Untrusted input placed in a regular expression.
9. User content placed in an LLM prompt. When the model's output then drives a privileged action without a check (a tool call, a query, a shell command, a write), report that action instead.

## Trusted input

10. Environment variables, CLI arguments, and config or settings files written by the operator. An attacker cannot change them, so they are not an injection source.
11. Content that only trusted administrators can enter, when they already hold the power the "attack" would give them.
12. UUIDv4 values (122 random bits) and other CSPRNG tokens of 122 bits or more cannot be guessed. UUIDv1 can (timestamp and MAC). UUIDv7 and ULIDs (Laravel's `HasUuids` default from 12, `HasUlids`) carry a timestamp and step a counter within one millisecond, so IDs made together by one process are close: treat them as hard to guess, not secret. Sequential IDs can be guessed, so IDOR applies to them.
13. Shell scripts, CI jobs, build scripts, Dockerfiles: report injection only when untrusted input demonstrably reaches them (a pull request title, a branch name from a fork, a webhook payload).

## Client side

14. Missing authorization checks in browser code. The server must enforce them: report the server-side gap instead. An Electron main process is server side; its renderer is client side.
15. React, Vue and Angular escape output. XSS there needs a raw-HTML API (`dangerouslySetInnerHTML`, `v-html`, `bypassSecurityTrust*`), a URL that reaches a `javascript:`-accepting sink (Vue `:href`, `location.href`, `window.open`; React 19+ neutralizes JSX `href`, `src`, `action`, `formAction`), or a direct DOM write.
16. Tabnabbing, XS-Leaks, clickjacking, prototype pollution without a concrete gadget, open redirects that leak no token or code.
17. SSRF that controls only the path or query of a fixed host.

## Always in scope

- Secrets, passwords, tokens or personal data written to logs, error pages or responses. URLs in logs are fine unless they carry a token.
- A real secret committed in code or in a committed config file. Item 10 makes config a trusted input; it does not make a committed secret safe.
