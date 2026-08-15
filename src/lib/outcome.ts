import { members } from "../data/members";
import { teamById } from "../data/teams";
import type { Match, MatchScore, Prediction } from "../data/types";
import { ownerOf } from "./owners";
import { predictionPoints, tipIsOnTime } from "./scoring";
import { isFullTime, phaseLabel } from "./scorePhase";

export function matchOutcome(match: Match, score?: MatchScore) {
  if (!score) return null;
  const home = teamById[match.homeId];
  const away = teamById[match.awayId];
  const homeOwner = ownerOf(match.homeId);
  const awayOwner = ownerOf(match.awayId);
  const finished = score.phase === "ft" || !score.phase;

  if (score.home === score.away) {
    const shared = homeOwner && awayOwner && homeOwner.id !== awayOwner.id;
    return {
      kind: "draw" as const,
      headline: finished ? "All square" : "Level",
      detail: shared
        ? `${homeOwner.emoji} ${homeOwner.name} and ${awayOwner.emoji} ${awayOwner.name} share the spoils`
        : "It's a draw",
      owner: null,
      phase: phaseLabel(score),
    };
  }

  const homeWins = score.home > score.away;
  const team = homeWins ? home : away;
  const owner = homeWins ? homeOwner : awayOwner;
  const otherOwner = homeWins ? awayOwner : homeOwner;
  const otherTeam = homeWins ? away : home;
  const verb = finished ? "wins it" : score.phase === "ht" ? "leads at the break" : "is up";
  const clash = Boolean(owner && otherOwner && owner.id !== otherOwner.id);

  return {
    kind: "win" as const,
    headline: owner ? `${owner.emoji} ${owner.name} ${verb}` : `${team?.name ?? "Winner"} ${verb}`,
    detail: clash
      ? `${team?.short ?? "Home"} beat ${otherOwner?.name}'s ${otherTeam?.short ?? "other side"}`
      : owner && otherOwner && owner.id === otherOwner.id
        ? `${owner.name} owns both shirts`
        : team?.name ?? "",
    owner,
    phase: phaseLabel(score),
  };
}

export function tipOutcome(score?: MatchScore, tips?: Prediction[], match?: Match) {
  if (!score || !isFullTime(score) || !tips?.length) return null;
  const ranked = tips.flatMap((tip) => {
    const member = members.find((item) => item.id === tip.memberId);
    if (!member) return [];
    if (match && !tipIsOnTime(match, tip)) return [];
    return [{ tip, member, points: predictionPoints(score, tip) }];
  });
  if (!ranked.length) return null;
  const best = Math.max(...ranked.map((row) => row.points));
  if (best <= 0) {
    return {
      kind: "none" as const,
      headline: "No one had the tips",
      detail: "The kitchen missed this one",
      owner: null,
    };
  }
  const winners = ranked.filter((row) => row.points === best);
  if (winners.length === 1) {
    const winner = winners[0];
    return {
      kind: "win" as const,
      headline: `${winner.member.emoji} ${winner.member.name} won the tips`,
      detail: best === 3
        ? `Exact ${winner.tip.home}–${winner.tip.away}`
        : `Correct result ${winner.tip.home}–${winner.tip.away}`,
      owner: winner.member,
    };
  }
  return {
    kind: "split" as const,
    headline: `${winners.map((row) => `${row.member.emoji} ${row.member.name}`).join(" and ")} split the tips`,
    detail: best === 3 ? "Exact score" : "Correct result",
    owner: null,
  };
}
