# TechDesk stabilization review

**Status:** Engineering stabilization acceptance complete. This records a validated reference-backend checkpoint, not a production release.

## Scope

The stabilization adds a public-only browser Supabase client, checked runtime/build configuration, safer account/session handling, transactional ticket and asset workflows, and a server-side `admin-users` boundary. The new Supabase schema is an isolated reference backend assembled from repository source; it is not a copy or migration plan for the live project.

Validation used synthetic fixtures in a disposable hosted Supabase staging project. The staging project is not production. No hosted project identifier, URL, credentials, password, token, publishable key, or service-role value is recorded here. The live TechDesk Supabase project was not inspected, modified, or deployed to.

## Backend and implementation

The reference database migration defines nine public tables with RLS, explicit column grants, triggers, and invoker RPC wrappers. Limited privileged implementations are held in a private schema with fixed search paths and revoked default execution grants. The seed contains synthetic users and related example data.

The browser has one public Supabase client. Configuration rejects missing, privileged, or unrecognized public variables; no service-role client is bundled. The `admin-users` Edge Function uses the Auth Admin API only after checking the caller's authenticated identity and live database role.

Ticket creation and transitions use caller-scoped RPCs and transactional database work for related asset state, notifications, and audit records. Role changes are persisted through the database RPC; the last administrator is protected. Account deletion blocks self/admin deletion and relies on database constraints and triggers for dependent data.

Logout and account switching clear account-specific notification state, stop subscriptions and polling, invalidate stale asynchronous responses, and remount account views. Failed profile retrieval removes client authorization. Logout clears local state even if server communication fails.

## Validation evidence

| Check | Result | Scope |
| --- | --- | --- |
| Automated suite | PASS | `npm test`: 73 tests in 7 files; 72 at the approved stabilization checkpoint plus the portfolio follow-up regression below |
| PostgreSQL policies and transactions | PASS | Repository migration and seed exercised through PGlite; Auth objects in this layer are test shims |
| Hosted migration and RLS | PASS | Reference migration applied successfully; all nine public tables had RLS enabled |
| Managed Auth | PASS | Real Supabase Auth sign-in worked for synthetic user, admin, and IT staff accounts |
| Authorization and protected data | PASS | Anonymous and ordinary-user admin access was rejected; IT staff were rejected by the admin boundary; protected cross-account data access was denied |
| Ticket, RPC, and role flows | PASS | Hosted ticket/RPC flows passed; role demotion persisted and took effect for an existing session |
| Realtime | PASS, limited scope | A synthetic notification INSERT was observed through Supabase Realtime |
| `admin-users` Edge Function | PASS | Deployed only to disposable staging with JWT verification enabled; admin create, role finalization, and delete passed; ordinary user and IT staff were rejected |
| Admin protections and failures | PASS | Self-delete, admin deletion, and last-admin protections held; tested failures return explicit errors. Handler tests cover role-finalization rollback and explicit partial-cleanup reporting |
| Credential and response exposure | PASS | Function responses exposed no tokens, passwords, service-role material, or unnecessary Auth data; frontend bundle scan found no privileged key, JWT, or build canary |
| Browser account state | PASS | User/IT/admin flows and logout/account switching were exercised; stale account-specific state did not carry across accounts |
| Edge type-check | PASS | `npm run check:edge`, exit 0 |
| Production build | PASS | `npm run build` with synthetic staging URL and public publishable configuration, exit 0 |
| Bundle isolation | PASS | `npm run verify:bundle`, exit 0 |
| Diff whitespace | PASS | `git diff --check`, exit 0 |
| Dependency audit | PASS at time checked | No known advisories were reported by the candidate's audit run; this does not rule out unknown defects |

The local containerized Supabase stack was not run; Docker and Podman were intentionally not installed. Hosted staging acceptance used synthetic fixtures only. Two-browser Realtime delivery was not separately verified.

## Portfolio browser follow-up

Screenshot collection reproduced a development-mode sign-in navigation failure: Auth and profile access succeeded, but overlapping profile requests could make sign-in return a stale failure and leave the page at login. Pinia devtools creates a fresh store proxy for each action, so the request-deduplication WeakMap could not use action `this` as a stable identity. It now uses the store's shared `$state`; account/generation and stale-response checks remain intact.

A regression using distinct action proxies failed before the fix and passed afterward. The full suite now has 73 tests in 7 files. Fresh synthetic user, IT staff, and admin sign-ins each reached the dashboard automatically, and role-specific views plus logout/account switching were exercised again. No old header, menu, or notification state was observed across those switches. Edge type-check, production-mode build with inert public configuration, bundle verification, and diff whitespace checks passed after the fix. The hosted acceptance matrix above was not repeated in full; no migration or function redeployment was needed.

Browser console observations remain narrower than error-free runtime acceptance: logout can remount an account view briefly before redirection, logging caught null-user errors or rejected profile-RPC requests after identity has been cleared. These observations were left unchanged because they did not block the presentation or expose stale account data. Production operation and broader UI cleanup remain outside this phase.

## Remaining limits and review boundary

- Disposable hosted staging is not production; behavior can differ across project configuration and data.
- Two-browser Realtime delivery remains unverified.
- Supabase leaked-password protection is unavailable on the staging project's Free plan. The Auth advisor reports this limitation; Supabase documents the feature as Pro and above: [Password security](https://supabase.com/docs/guides/auth/password-security).
- Compatibility with the live TechDesk Supabase project and any production schema/data migration remain deliberately untested and deferred. Do not apply the reference migration to the live project without a separate compatibility and migration review.
- Auth Admin calls and role RPCs span services. Creation uses ordinary-user bootstrap followed by authorization-checked role finalization and compensation. If compensation itself fails, the function reports the partial account for review. Durable cross-service idempotency is not implemented, and revocation racing after the final authorization check cannot be globally serialized.

The stabilization work uses synthetic fixtures, public source, and pinned public packages. Do not include `.env` files, dependency directories, generated build output, or unrelated Desktop work in the stabilization commit.
