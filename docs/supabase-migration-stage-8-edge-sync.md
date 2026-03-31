# Supabase Migration Stage 8

This stage adds a `Supabase Edge Function` that can mirror live browser writes from Firebase-authenticated users into Supabase.

Files:

- [firebase-sync index.ts](/d:/site/dota-project-site/supabase/functions/firebase-sync/index.ts)
- [config.toml](/d:/site/dota-project-site/supabase/config.toml)

What it supports:

- `upsert_profile`
- `upsert_presence`
- `upsert_comment`
- `delete_comment`

Security model:

- browser sends the current `Firebase ID token`
- function verifies the token against Firebase public keys
- function writes with `SUPABASE_SERVICE_ROLE_KEY`
- comments are additionally checked against actor ownership / target profile ownership / staff roles

Supabase function secrets required:

- `FIREBASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Suggested deploy flow:

1. Deploy the function:
   `supabase functions deploy firebase-sync`
2. Set secrets:
   `supabase secrets set FIREBASE_PROJECT_ID=sakura-bfa74 SUPABASE_SERVICE_ROLE_KEY=...`
3. After that, enable browser-side best-effort sync with:
   `NEXT_PUBLIC_SUPABASE_LIVE_SYNC_ENABLED=true`
4. Optionally set:
   `NEXT_PUBLIC_SUPABASE_SYNC_FUNCTION_URL=https://<project-ref>.functions.supabase.co/firebase-sync`

Important:

- keep [20260331_000003_lock_public_tables.sql](/d:/site/dota-project-site/supabase/migrations/20260331_000003_lock_public_tables.sql) for after the new frontend is deployed and verified
- this stage does not remove Firebase writes yet; it mirrors them into Supabase in parallel
- `firebase-sync` is configured with `verify_jwt = false`, because it verifies `Firebase ID token` itself rather than Supabase Auth JWT
