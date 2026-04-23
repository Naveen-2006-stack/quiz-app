# Pre-Deploy SQL Bundle Notes

Bundle file: supabase/predeploy_bundle_2026_04_23.sql

## Why this bundle exists

There are multiple historical redefinitions of the same anti-cheat RPC (`public.log_violation`) across older migrations.
If migrations are applied out of order, the final behavior can regress.

This bundle sets the final canonical behavior in one place:

- Supports question images via `questions.image_url`
- Supports detailed anti-cheat logs via `participants.violation_logs`
- Keeps `participant_violations` table/RLS/realtime in sync
- Ensures host-only access RPCs remain secure

## Apply order recommendation

1. Apply your baseline migrations as usual.
2. Apply `supabase/predeploy_bundle_2026_04_23.sql` last.

## Verification queries

```sql
-- Confirm new columns
select column_name from information_schema.columns
where table_schema = 'public'
  and table_name = 'questions'
  and column_name = 'image_url';

select column_name from information_schema.columns
where table_schema = 'public'
  and table_name = 'participants'
  and column_name = 'violation_logs';

-- Confirm final RPC exists
select routine_name from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('log_violation', 'fetch_violations_for_host', 'ban_participant');

-- Confirm storage bucket exists
select id, public from storage.buckets where id = 'quiz-images';
```
