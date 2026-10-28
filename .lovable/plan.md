# Phase 1, Step 2A: Sign-in, roles and private document storage (proposal only)

Nothing below has been applied. Lovable Cloud is not enabled. No database, storage or sign-in exists yet.

## What needs your action or approval

1. **Enable Lovable Cloud.** This adds a private database, a sign-in system and file storage to this project. It can't be cleanly undone: the backend stays attached to the project.
2. **Google sign-in.** Lovable's managed Google sign-in needs no Google Cloud account or keys from you. Using your own Google OAuth app (custom branding on the consent screen) is optional and would need a client ID and secret from Google Cloud Console.
3. **First administrator.** After you sign in once, I assign the admin role to your account with a one-time database change. No one can make themselves admin from inside the app.
4. **Billing.** I won't change any billing settings.

## Usage limits and costs

- Every workspace gets **20 free Cloud credits a month** (database, storage, server code) and 4 free AI credits. This project uses no AI.
- Usage beyond that comes out of your workspace credit balance. If credits run out, Cloud pauses the backend after a grace period. The current demo pages keep working.
- I can't predict exact usage. A small prototype with a few users and PDFs normally stays within the free allowance, but I haven't measured it.
- Optional: in Workspace settings, under Usage limits & alerts, you can set a monthly Cloud cap or low-balance alert.

## Sign-in (one system)

- Google sign-in only, through Lovable's managed setup. No email/password unless you ask for it.
- A public sign-in page at `/auth`. Signed-in pages go behind one protected section; the existing public pages stay public and unchanged.
- The header shows the signed-in user and a sign-out button. BridgeKey wallet connection stays separate: a wallet is not a login.

## Roles

| Role | Can do |
|---|---|
| investor (given to everyone at sign-up) | view approved properties and approved document metadata; no uploads |
| registrar | create properties, upload documents and new versions for properties assigned to them |
| reviewer (auditor) | read all documents through short-lived links; record approve/reject decisions; cannot upload |
| admin | assign and remove roles, assign registrars to properties; cannot edit review decisions |

- Roles live in their own table, never on the profile.
- Only admins can write to it, enforced by database security rules. Every permission check runs in the database and on the server, not just by hiding buttons.

## Tables (minimum set)

| Table | Purpose | Access rules |
|---|---|---|
| profiles | display name and avatar from Google, one row per user, created automatically at sign-up | user reads/edits own row; reviewers/admins read |
| user_roles | user, role | read own roles; only admins write |
| properties | property ID (e.g. PRP-PUN-0142), title, location, status, assigned registrar | signed-in users read approved; assigned registrar writes own; admin all |
| documents | one row per document type per property (sale deed, mutation entry, etc.) | same as properties |
| document_versions | file path, SHA-256 hash, size, file type, uploader, timestamp, optional on-chain tx reference | registrar inserts (never updates/deletes); reviewers/admins read; investors read hash + status only for approved versions |
| review_decisions | version, reviewer, decision, notes, timestamp | reviewers insert own; never edited; registrars read decisions on their properties |

- Records are append-only, so history can't be rewritten.
- Every row has `source = 'verified_upload'`. The existing demo data stays in code with `source = "demo"` and the "Simulated" label, and is never mixed into these tables.

## Private document storage

- One **private** bucket, `property-documents`, laid out by property and version.
- Uploads go through a server function that checks the user's role and assignment, accepts only PDF, PNG and JPEG (checked by the file's first bytes as well as the browser's file type), allows at most 10 MB, and recomputes the SHA-256 hash on the server and rejects the upload if it doesn't match the browser's.
- Viewing uses **signed links that expire after 5 minutes**, issued only after a permission check. There are no public links.
- Storage security rules mirror the table rules.

## Document integrity wording

- Hashes stay SHA-256. Files stay off-chain.
- Registering a hash on-chain stays an optional, manual registrar action using the **existing** PropertyDocumentRegistry on testnet only. I won't add it now. In 2A I only add a field to record the transaction reference if one is supplied later.
- Everywhere the app shows a match, it reads: "File contents match the recorded hash. This does not prove ownership, authenticity or legal title."

## Not in scope

No token contract, no transactions, no Mainnet, no payments, no private keys. PropertyDocumentRegistry is untouched.

## Testing

- Re-run all 24 app tests, contract compilation, the 8 contract tests and the production build.
- New unit tests: file type and size checks, server hash matching, role checks (an investor can't upload; a registrar can't upload to an unassigned property; a non-admin can't grant a role).
- Database-rule checks run as real test users: an investor reading another user's private document is denied, a user self-granting admin is denied, a signed link expires.
- Sign in once with Google in the preview and confirm the protected page loads.

## Order of work after approval

1. Enable Cloud.
2. Turn on managed Google sign-in.
3. One database change: the tables, rules and sign-up trigger, shown to you before I apply it.
4. Create the private bucket and its rules.
5. Add the server functions, the `/auth` page, the protected section and a basic registrar upload page and reviewer queue.
6. Tests and the full check run.
7. Ask you to sign in once so I can make you admin.

## Technical details

- Roles: `app_role` enum plus `user_roles` and a security-definer `has_role()`, used in all row and storage security rules.
- Grants: authenticated users only. The anon role gets no access to any new table.
- Server code: `createServerFn` with `requireSupabaseAuth`. The service-role client is used only for the storage upload after the role check, loaded inside the handler.
- Routes: `src/routes/_authenticated/`. The public routes stay at the top level.
