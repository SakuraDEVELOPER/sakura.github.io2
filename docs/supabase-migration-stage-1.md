# Supabase Migration Stage 1

This is the first safe step of the Firebase -> Supabase migration.

Nothing in the site runtime uses these tables yet. The goal of this step is only:

- create the Supabase schema
- mirror the current Firebase data model
- prepare the project for phased read/write migration

## What this stage creates

- `public.profiles`
- `public.profile_presence`
- `public.profile_comments`
- a reusable `updated_at` trigger function
- indexes for profile lookups, comments, and presence

## Why this schema looks like this

The current site still authenticates with Firebase, so the schema keeps both:

- `firebase_uid`
- `auth_user_id`

This lets us migrate data first, then move auth later without rewriting the tables.

## How to apply it

1. Open `Supabase Dashboard`
2. Go to `SQL Editor`
3. Create a new query
4. Paste the file:
   - `supabase/migrations/20260331_000001_stage1_base_schema.sql`
5. Run it

## What is intentionally NOT done yet

- no RLS policies yet
- no live app reads from Supabase yet
- no data copy from Firebase yet
- no auth migration yet

We will do those in separate stages so the site does not break mid-migration.

## Next recommended step

Stage 2 should be a read-only migration for profiles:

- keep Firebase as source of truth
- copy profiles to Supabase
- add a small compatibility layer that can read profiles from Supabase
- do not switch writes yet
