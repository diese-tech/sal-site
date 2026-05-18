# Supabase Admin Setup

1. Run `supabase/schema.sql` in the Supabase SQL editor for `https://jsoxhhyveorbplcxqhqo.supabase.co`.
2. Set env vars from `.env.example`.
3. Run `npm run db:seed` to import the current SAL mock league data.
4. Deploy with the same env vars so public pages read Supabase and admin writes persist.

Admin editing supports schedule edits, roster assignments, and score-driven standings. Standings recalculate whenever a completed match score is saved.
