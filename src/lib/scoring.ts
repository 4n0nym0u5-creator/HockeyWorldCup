import { matches } from "../data/matches";
import { members } from "../data/members";
import { teamById } from "../data/teams";
import type { MemberId, Match, MatchScore, Prediction } from "../data/types";
import { ownerOf } from "./owners";
import { isFullTime, isProvisional, ladderScore } from "./scorePhase";
import { poolFinished, poolTable } from "./standings";

export interface ScoreLine {
  label: string;
  points: number;
}

export interface MemberScore {
  memberId: MemberId;
  total: number;
  teamPoints: number;
  predPoints: number;
  bonusPoints: number;
  provisional: boolean;
  lines: ScoreLine[];
}

function resultPoints(gf: number, ga: number) {
  if (gf > ga) return 3;
  if (gf === ga) return 1;
  return 0;
}

function award(lines: ScoreLine[], label: string, points: number) {
  if (!points) return;
  lines.push({ label, points });
}

export function matchOwnerPoints(match: Match, score: MatchScore, teamId: string) {
  const isHome = match.homeId === teamId;
  const gf = isHome ? score.home : score.away;
  const ga = isHome ? score.away : score.home;
  const oppId = isHome ? match.awayId : match.homeId;
  const team = teamById[teamId];
  const opp = teamById[oppId];
  let pts = resultPoints(gf, ga) + gf;
  if (ga === 0 && gf >= ga) pts += 2;
  if (opp && team && gf > ga && team.rank > opp.rank) pts += 2;
  const myOwner = ownerOf(teamId);
  const theirOwner = ownerOf(oppId);
  if (myOwner && theirOwner && myOwner.id !== theirOwner.id && gf > ga) pts += 2;
  if (match.round === "semifinal") pts += 8;
  if (match.round === "final") pts += 12;
  if (match.round === "third") pts += 4;
  if (match.round === "final" && gf > ga) pts += 20;
  if (match.round === "third" && gf > ga) pts += 6;
  if (match.round === "placement" && gf > ga) pts += 2;
  return pts;
}

const TIP_GRACE_MS = 60_000;

export function tipIsOnTime(match: Match, tip: Prediction) {
  const at = Number(tip.at) || 0;
  if (!at) return true;
  return at < new Date(match.kickoff).getTime() + TIP_GRACE_MS;
}

export function predictionPoints(score: MatchScore, tip: Prediction) {
  const home = Number(score.home);
  const away = Number(score.away);
  const tipHome = Number(tip.home);
  const tipAway = Number(tip.away);
  if (![home, away, tipHome, tipAway].every(Number.isFinite)) return 0;
  if (tipHome === home && tipAway === away) return 3;
  const actual = Math.sign(home - away);
  const guessed = Math.sign(tipHome - tipAway);
  return actual === guessed ? 1 : 0;
}

export function scoreboard(
  scores: Record<string, MatchScore>,
  predictions: Record<string, Prediction[]>,
): MemberScore[] {
  return members.map((member) => {
    const lines: ScoreLine[] = [];
    let teamPoints = 0;
    let predPoints = 0;
    let bonusPoints = 0;

    for (const match of matches) {
      const raw = scores[match.id];
      const score = ladderScore(raw);
      if (!score || match.homeId === "tbd") continue;
      for (const teamId of [match.homeId, match.awayId]) {
        if (!member.teamIds.includes(teamId)) continue;
        const pts = matchOwnerPoints(match, score, teamId);
        const team = teamById[teamId];
        const tag = isProvisional(raw) ? "HT" : "FT";
        award(lines, `${tag} ${team?.short ?? teamId} ${score.home}–${score.away} ${match.label}`, pts);
        teamPoints += pts;
      }
    }

    for (const match of matches) {
      const raw = scores[match.id];
      const tip = (predictions[match.id] ?? []).find((item) => item.memberId === member.id);
      if (!raw || !tip || !isFullTime(raw) || !tipIsOnTime(match, tip)) continue;
      const pts = predictionPoints(raw, tip);
      predPoints += pts;
      if (!pts) continue;
      const home = teamById[match.homeId]?.short ?? "Home";
      const away = teamById[match.awayId]?.short ?? "Away";
      award(lines, `Tip ${home} ${raw.home}–${raw.away} ${away} · ${pts === 3 ? "exact" : "result"}`, pts);
    }

    for (const gender of ["M", "W"] as const) {
      for (const pool of ["A", "B", "C", "D"] as const) {
        if (!poolFinished(gender, pool, scores)) continue;
        const table = poolTable(gender, pool, scores);
        table.slice(0, 2).forEach((row, idx) => {
          if (!member.teamIds.includes(row.teamId)) return;
          const pts = idx === 0 ? 5 : 4;
          bonusPoints += pts;
          award(lines, `${teamById[row.teamId]?.short} advance from Pool ${pool}`, pts);
        });
      }
    }

    return {
      memberId: member.id,
      total: teamPoints + predPoints + bonusPoints,
      teamPoints,
      predPoints,
      bonusPoints,
      provisional: Object.values(scores).some(isProvisional),
      lines,
    };
  }).sort((a, b) => b.total - a.total);
}
