-- Pin search_path on advance_pick_on_timeout, added in migration 020 without
-- a pin (020 postdates the 019 sweep). Same rationale as
-- 019_pin_function_search_path.sql. Found by scripts/check-security-definer.sh (#146).
ALTER FUNCTION public.advance_pick_on_timeout(text, integer, integer) SET search_path = public;
