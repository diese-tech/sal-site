-- Pin search_path on all SECURITY DEFINER functions.
-- Without this, a malicious schema in search_path could shadow pg_catalog
-- functions used inside these RPCs. Exposure is low (execute is already
-- revoked from anon/authenticated) but pinning is the correct posture.
ALTER FUNCTION public.undo_last_pick(text) SET search_path = public;
ALTER FUNCTION public.submit_draft_pick(text, text, text, integer, integer) SET search_path = public;
ALTER FUNCTION public.replace_match_report_stats(uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.replace_standings(jsonb) SET search_path = public;
ALTER FUNCTION public.complete_god_draft(text, text, integer, jsonb, jsonb, jsonb) SET search_path = public;
