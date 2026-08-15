import { teamById } from "../data/teams";
import type { Match, MatchScore } from "../data/types";
import { ownerOf } from "./owners";
import { phaseLabel } from "./scorePhase";

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
