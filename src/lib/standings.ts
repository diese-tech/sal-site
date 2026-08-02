import type { DivisionId, LeagueData, OrgStanding } from "@/types/league";

function leaguePointsForScore(score: number, opponentScore: number): number {
  if (score === opponentScore) return 0;
  if (score > opponentScore) return opponentScore === 0 ? 3 : 2;
  return score === 0 ? 0 : 1;
}

export function sortStandings(standings: OrgStanding[]): OrgStanding[] {
  return [...standings].sort((left, right) => {
    const headToHead =
      (right.headToHeadWins[left.orgId] ?? 0) -
      (left.headToHeadWins[right.orgId] ?? 0);

    return (
      right.leaguePoints - left.leaguePoints ||
      right.wins - left.wins ||
      headToHead ||
      right.qualityOfLosses - left.qualityOfLosses ||
      left.orgId.localeCompare(right.orgId)
    );
  });
}

export function recalcStandings(data: Pick<LeagueData, "orgs" | "matches">, seasonId?: string): OrgStanding[] {
  const map = new Map<string, OrgStanding>();
  const lossesByOrg = new Map<string, string[]>();

  for (const org of data.orgs) {
    map.set(org.id, {
      orgId: org.id,
      divisionId: org.divisionId,
      wins: 0,
      losses: 0,
      draws: 0,
      matchesPlayed: 0,
      leaguePoints: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      headToHeadWins: {},
      qualityOfLosses: 0,
      streak: [],
      gamesBack: 0,
    });
    lossesByOrg.set(org.id, []);
  }

  const matches = seasonId ? data.matches.filter((match) => match.seasonId === seasonId) : data.matches;

  for (const match of matches) {
    if (
      (match.status !== "completed" && match.status !== "forfeit") ||
      match.homeScore === undefined ||
      match.awayScore === undefined
    ) continue;

    const home = map.get(match.homeOrgId);
    const away = map.get(match.awayOrgId);
    if (!home || !away) continue;

    home.matchesPlayed++;
    away.matchesPlayed++;
    home.leaguePoints += leaguePointsForScore(match.homeScore, match.awayScore);
    away.leaguePoints += leaguePointsForScore(match.awayScore, match.homeScore);

    // Forfeit scores are administrative results, so keep them out of game-score
    // aggregates while still awarding the normal Section 8 league points.
    if (match.status !== "forfeit") {
      home.pointsFor += match.homeScore;
      home.pointsAgainst += match.awayScore;
      away.pointsFor += match.awayScore;
      away.pointsAgainst += match.homeScore;
    }

    if (match.homeScore > match.awayScore) {
      home.wins++;
      away.losses++;
      home.headToHeadWins[away.orgId] = (home.headToHeadWins[away.orgId] ?? 0) + 1;
      lossesByOrg.get(away.orgId)?.push(home.orgId);
      home.streak = [...home.streak.slice(-4), "W"];
      away.streak = [...away.streak.slice(-4), "L"];
    } else if (match.awayScore > match.homeScore) {
      away.wins++;
      home.losses++;
      away.headToHeadWins[home.orgId] = (away.headToHeadWins[home.orgId] ?? 0) + 1;
      lossesByOrg.get(home.orgId)?.push(away.orgId);
      away.streak = [...away.streak.slice(-4), "W"];
      home.streak = [...home.streak.slice(-4), "L"];
    } else {
      home.draws++;
      away.draws++;
      home.streak = [...home.streak.slice(-4), "D"];
      away.streak = [...away.streak.slice(-4), "D"];
    }
  }

  // Operational definition for the rulebook's third tiebreak: average final
  // league points of the opponents a team lost to. An average avoids rewarding
  // a team merely for accumulating more losses.
  for (const standing of map.values()) {
    const opponents = lossesByOrg.get(standing.orgId) ?? [];
    if (opponents.length === 0) continue;
    const opponentPoints = opponents.reduce(
      (total, opponentId) => total + (map.get(opponentId)?.leaguePoints ?? 0),
      0,
    );
    standing.qualityOfLosses = opponentPoints / opponents.length;
  }

  // Retained for compatibility with the persisted pre-v1 standings contract;
  // the public table now ranks by league points instead of games back.
  for (const divisionId of ["terra", "solar", "lunar"] satisfies DivisionId[]) {
    const divisionStandings = [...map.values()].filter((standing) => standing.divisionId === divisionId);
    if (divisionStandings.length === 0) continue;
    const leader = divisionStandings.reduce((left, right) =>
      right.wins - right.losses > left.wins - left.losses ? right : left,
    );
    for (const standing of divisionStandings) {
      standing.gamesBack = ((leader.wins - leader.losses) - (standing.wins - standing.losses)) / 2;
    }
  }

  return [...map.values()];
}
