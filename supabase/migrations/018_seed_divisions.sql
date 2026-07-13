-- The three divisions are fixed reference data — the DivisionId type is the
-- hardcoded union "terra" | "solar" | "lunar" and orgs/matches/draft_rooms all
-- FK to divisions(id). Without these rows, no team or match can be created
-- (admin team creation failed on the FK in a fresh database).
INSERT INTO divisions (id, name, description, tier, accent_color) VALUES
  ('terra',  'Terra Division',  'Top-tier competitive play. The pinnacle where champions are forged.', 1, 'emerald'),
  ('solar', 'Solar Division', 'High-level competition where elite players contest for supremacy.',   2, 'orange'),
  ('lunar', 'Lunar Division', 'The proving grounds. Rise through the roots and earn your place.',    3, 'cyan')
ON CONFLICT (id) DO NOTHING;
