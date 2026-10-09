# Local engineering reference

This backend is a new reference contract derived from the frontend at
`f34dc9a9eddad8fd5aa132b133fd3e564ce4fe87`. It is not a recovered production
schema and must not be applied to an existing/live project.

## Requirements and setup

Use Node 22.12+, 24, or 26 (validation used Node 26.4.0), npm, and a running
Docker Desktop or compatible Podman environment. Tool versions are locked in
`package-lock.json`; no Supabase login, linked project, or hosted credentials
are needed. The Edge Function has its own Deno configuration and frozen dependency
lockfile. Use this checkout, not an old folder with existing `.env` values.

```sh
npm ci
npm run backend:start
npm run backend:reset
npx supabase status
cp .env.example .env
```

Set `VITE_SUPABASE_ANON_KEY` to the **local public anon/publishable key** from
the local status output. Keep `VITE_SUPABASE_URL=http://127.0.0.1:54321`.
Never copy the local service-role key into `.env`, a VITE variable, the frontend,
or documentation. Only the two documented VITE variables are accepted; unknown
public variables are rejected before bundling. The Edge runtime supplies its server environment internally.
Do not use hosted credentials for this reference.

In one terminal run `npm run backend:functions`; in another run `npm run dev`.
Open `http://127.0.0.1:5173`. The server boundary accepts the two default local
Vite origins. A custom local origin can be listed in server-only
`ALLOWED_ORIGINS` (comma-separated) in an ignored function `.env` file.

All fixture names and records are synthetic. The local seed and integration
harness define a synthetic-only fixture password; do not reuse it outside this
local reference backend:

| Account | Initial role |
| --- | --- |
| admin@techdesk.example | admin |
| staff@techdesk.example | it_staff |
| user@techdesk.example | user |
| other@techdesk.example | user |

The reserved `.example` domain prevents real email delivery. Local email
confirmation is disabled only in this synthetic environment. Never deploy
these fixtures or settings unchanged. Reset deletes the isolated local
database contents. Stop local containers with `npx supabase stop` when finished.

## Verification

```sh
npm test
npm run check:edge
npm run build
npm run verify:bundle
npm run test:integration
npx supabase db advisors --local
npx supabase migration list --local
```

`npm test` does not require Docker. It runs the repository migration and seed
on PostgreSQL through PGlite with test-only stand-ins for Supabase's managed
Auth tables/functions, actual SQL roles, grants, RLS, triggers and transactions.
It also tests Pinia state races, credential validation, SDK transport behavior,
and the Edge handler with injected clients. Auth shims are never migrations.

`test:integration` requires the real local stack and running function server.
It reads only local status, refuses non-loopback endpoints, signs in the four
synthetic users, tests REST/RPC denial and persistence, and creates/deletes a
synthetic Auth account via the real Edge boundary. It restores the fixture
staff role and leaves a synthetic test ticket until the next local reset.
It does not accept remote URLs or externally supplied privileged credentials.
It does not replace browser interaction or Realtime delivery testing.

## Contract and authorization

The migration defines profiles, assets, tickets, comments, ratings,
notifications, articles, announcements and logs; foreign keys, validation,
indexes, profile bootstrap, audit triggers, policies, and RPC implementations
are included. The seed supplies Auth identities and linked example records.
Only `public` is exposed through the Data API. RLS is enabled on every table.

| Area | Ordinary user | IT staff | Admin |
| --- | --- | --- | --- |
| Profiles | own profile | names/roles | names/roles and RPC email list |
| Tickets, assets, ratings | own/assigned records | all reads | all reads |
| Ticket transitions/support notes | denied | transactional RPC | transactional RPC |
| Rating submission | own resolved ticket only | own resolved ticket only | own resolved ticket only |
| Notifications | own read/read-status/delete | own only | own only |
| Articles | shared read | create/edit/delete | create/edit/delete |
| Announcements | active read | active read | create/edit/delete/all read |
| Assets | no direct writes | no direct writes | validated CRUD |
| Roles/accounts | denied | denied | role RPC / server Auth boundary |
| Audit logs | denied | denied | read |

`private.current_role()` checks the current profile, non-anonymous Auth user,
and JWT session ID against a live Auth session. User-editable metadata and
cached JWT application roles do not authorize access. Demotion, deletion and
session revocation take effect on the next database request, without token
refresh. These checks depend on Supabase's managed `auth.sessions` contract.

Public RPCs use SECURITY INVOKER wrappers. The minimal privileged implementations
live in the unexposed private schema, pin an empty search path, explicitly
authorize their caller, and have their default PUBLIC execute grants revoked.
Anonymous callers cannot execute them. Ordinary callers have no direct role,
ticket, comment, notification-insert, or audit-write privileges.

## Write boundaries and failure semantics

`create_ticket(payload)` checks the assigned asset and uses a caller-scoped
request UUID. Ticket, derived asset fault and audit commit together. The same
UUID/input returns the existing ticket; changed input with a used UUID fails.

`update_ticket_status(target_ticket_id, target_status, expected_updated_at,
note)` locks asset before ticket and rejects a stale ticket version. Status,
optional note, asset reconciliation, notification and audit commit together.
An asset stays faulty while any linked ticket is unresolved. Admin edits
cannot override that derived fault. Account deletion reconciles remaining
asset state and nulls assignments through foreign keys/triggers.

Role updates serialize the last-admin invariant, persist every permitted role
(including `user`), verify the returned row and write an audit record. The
last admin cannot be demoted. Admin deletion requires prior demotion; a database
trigger also blocks a target promoted concurrently with an Auth deletion.
The Edge handler blocks self deletion.

The `admin-users` Edge Function validates the caller with Auth and a fresh,
RLS-scoped admin profile before creating a service client. It uses the supported
Auth Admin API for create/delete and returns no tokens, credentials or Auth
user object. Account creation always bootstraps an ordinary profile, then
finalizes its selected role through the caller's authorized RPC. Failure
attempts compensating Auth deletion; failed compensation returns explicit
`partial` and account ID information for reconciliation. No account mutation
is automatically retried.

Auth Admin APIs and database role changes cannot share one transaction. A
process crash or ambiguous HTTP outcome can leave an account requiring
review (the bootstrap is always unprivileged); refresh the user list before
retrying. Caller authorization is checked immediately before privileged
deletion, but concurrent revocation between that check and the external Auth
API call is not a globally serializable guarantee. Full cross-service
idempotency/reconciliation would be a separate design decision.

Browser fetches have a bounded deadline and no replay loop. SDK database retries
are disabled explicitly. Deadline expiry is an uncertain write outcome, never
proof of failure. Ticket creation has request idempotency; transitions require
reload after a stale/ambiguous response. Direct edits/deletes require a returned
single row, so zero-row RLS writes cannot produce optimistic success.

Session changes invalidate in-flight profile/notification responses, stop old
subscriptions/pollers, clear account state, and remount account-specific views.
Failed profile reads remove client authority. Logout clears state before
network work, removes the local token entry, and persists a logout block to
prevent focus/reload from restoring a failed logout. Client guards improve UI
behavior; the database always enforces authorization.

## References

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Auth Admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)
- [Local database seeding](https://supabase.com/docs/guides/local-development/seeding-your-database)
- [SheetJS upstream package installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
