import { createClient } from "@supabase/supabase-js";
import { MOCK_LEAGUE_DATA } from "../src/data/mock-league.ts";
import { recalcStandings } from "../src/lib/standings.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const data = MOCK_LEAGUE_DATA;
const standings = recalcStandings(data);

const mapOrg = (org) => ({
  id: org.id,
  name: org.name,
  tag: org.tag,
  division_id: org.divisionId,
  logo_initials: org.logoInitials,
  logo_gradient: org.logoGradient,
  primary_color: org.primaryColor,
  accent_gradient: org.accentGradient,
  captain_id: org.captainId ?? null,
  founded: org.founded ?? null,
  social_links: org.socialLinks ?? null,
});

const mapPlayer = (player) => ({
  id: player.id,
  org_id: player.orgId ?? null,
  discord_username: player.discordUsername,
  ign: player.ign,
  avatar_initials: player.avatarInitials,
  avatar_gradient: player.avatarGradient,
  primary_role: player.primaryRole,
  secondary_roles: player.secondaryRoles,
  is_starter: player.isStarter,
  is_captain: player.isCaptain,
  division_id: player.divisionId ?? null,
  status: player.status,
  stats: player.stats ?? null,
});

const mapMatch = (match) => ({
  id: match.id,
  division_id: match.divisionId,
  home_org_id: match.homeOrgId,
  away_org_id: match.awayOrgId,
  scheduled_date: match.scheduledDate,
  scheduled_time: match.scheduledTime,
  status: match.status,
  week: match.week,
  home_score: match.homeScore ?? null,
  away_score: match.awayScore ?? null,
  stream_url: match.streamUrl ?? null,
  vod_url: match.vodUrl ?? null,
});

const mapStanding = (standing) => ({
  org_id: standing.orgId,
  division_id: standing.divisionId,
  wins: standing.wins,
  losses: standing.losses,
  matches_played: standing.matchesPlayed,
  points_for: standing.pointsFor,
  points_against: standing.pointsAgainst,
  streak: standing.streak,
  games_back: standing.gamesBack,
});

async function checked(label, promise) {
  const { error } = await promise;
  if (error) {
    console.error(`${label} failed:`, error.message);
    process.exit(1);
  }
}

await checked("seed seasons", supabase.from("seasons").upsert({
  id: data.season.id,
  name: data.season.name,
  status: data.season.status,
  start_date: data.season.startDate,
  end_date: data.season.endDate,
  current_week: data.season.currentWeek,
}));
await checked("seed divisions", supabase.from("divisions").upsert(data.divisions.map((division) => ({
  id: division.id,
  name: division.name,
  description: division.description,
  tier: division.tier,
  accent_color: division.accentColor,
}))));
await checked("seed orgs without captains", supabase.from("orgs").upsert(data.orgs.map((org) => ({ ...mapOrg(org), captain_id: null }))));
await checked("seed players", supabase.from("players").upsert(data.players.map(mapPlayer)));
await checked("update org captains", supabase.from("orgs").upsert(data.orgs.map(mapOrg)));
await checked("seed matches", supabase.from("matches").upsert(data.matches.map(mapMatch)));
await checked("seed announcements", supabase.from("announcements").upsert(data.announcements.map((announcement) => ({
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  created_at: announcement.createdAt,
  category: announcement.category,
  pinned: announcement.pinned,
}))));
await checked("clear standings", supabase.from("standings").delete().neq("org_id", "__never__"));
await checked("seed standings", supabase.from("standings").upsert(standings.map(mapStanding)));

console.log("Seeded SAL Supabase league data.");
