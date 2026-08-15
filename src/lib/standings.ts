import { matches } from "../data/matches";
import { teamById } from "../data/teams";
import type { Gender, MatchScore } from "../data/types";

export interface Row {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
}

function emptyRow(teamId: string): Row {
  return { teamId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
}

function apply(row: Row, gf: number, ga: number) {
  row.played += 1;
  row.gf += gf;
  row.ga += ga;
  if (gf > ga) {
    row.won += 1;
    row.pts += 3;
  } else if (gf === ga) {
    row.drawn += 1;
    row.pts += 1;
  } else {
    row.lost += 1;
  }
}

export function sortRows(rows: Row[]) {
  return [...rows].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.won !== a.won) return b.won - a.won;
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return (teamById[a.teamId]?.rank ?? 99) - (teamById[b.teamId]?.rank ?? 99);
  });
}

export function poolTable(gender: Gender, pool: string, scores: Record<string, MatchScore>) {
  const rows = new Map<string, Row>();
  for (const match of matches) {
    if (match.gender !== gender || match.round !== "pool" || match.pool !== pool) continue;
    if (!rows.has(match.homeId)) rows.set(match.homeId, emptyRow(match.homeId));
    if (!rows.has(match.awayId)) rows.set(match.awayId, emptyRow(match.awayId));
    const score = scores[match.id];
    if (!score) continue;
    apply(rows.get(match.homeId)!, score.home, score.away);
    apply(rows.get(match.awayId)!, score.away, score.home);
  }
  return sortRows([...rows.values()]);
}

export function poolFinished(gender: Gender, pool: string, scores: Record<string, MatchScore>) {
  return matches
    .filter((m) => m.gender === gender && m.round === "pool" && m.pool === pool)
    .every((m) => scores[m.id]);
}
