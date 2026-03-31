# Supabase Migration Stage 10

This stage adds a `Supabase -> Firebase` auth bridge for existing profile/data flows.

Files:

- [firebase-auth-bridge index.ts](/d:/site/dota-project-site/supabase/functions/firebase-auth-bridge/index.ts)
- [firebase-auth-script.ts](/d:/site/dota-project-site/src/app/firebase-auth-script.ts)
- [config.toml](/d:/site/dota-project-site/supabase/config.toml)

What it does:

- adds a new `firebase-auth-bridge` Edge Function
- verifies the current `Supabase Auth` session server-side
- looks up the linked profile row in `public.profiles`
- auto-links `auth_user_id` by email when there is a single safe match
- issues a `Firebase custom token` for the linked `firebase_uid`
- lets the existing browser `Firebase` runtime rehydrate itself from a `Supabase` session

Why this matters:

- Google is no longer the only `Supabase -> Firebase` bridge path
- future `Supabase Auth` flows can keep the current Firebase-backed profile/comment/presence runtime alive during migration
- this is the missing compatibility layer for a deeper auth cutover

Supabase function secrets required:

- either:
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - or:
    - `FIREBASE_SERVICE_ACCOUNT_EMAIL`
    - `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`

Hosted Supabase Edge Functions already expose these by default, so you do **not** set them manually with `supabase secrets set`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Deploy flow:

1. Deploy the function:
   `npx supabase functions deploy firebase-auth-bridge`
2. Set secrets if they are not already present:
   `npx supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON=...`
3. Optionally set a frontend override:
   `NEXT_PUBLIC_SUPABASE_AUTH_BRIDGE_FUNCTION_URL=https://<project-ref>.functions.supabase.co/firebase-auth-bridge`

Important:

- the function returns `409` until a `Supabase Auth` user can be matched to exactly one profile row
- when possible it links `profiles.auth_user_id` automatically by email
- this stage still does not remove `Firebase Auth`; it makes the cutover path safer
