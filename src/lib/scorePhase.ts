import type { MatchScore } from "../data/types";

export function isFullTime(score?: MatchScore) {
  return Boolean(score && (score.phase === "ft" || !score.phase));
}

export function isProvisional(score?: MatchScore) {
  return Boolean(
    score &&
      (score.phase === "ht" || (score.phase === "live" && score.htHome != null && score.htAway != null)),
  );
}

/** Score the family ladder should use: HT snapshot, then FT. Live first-half does not count yet. */
export function ladderScore(score?: MatchScore) {
  if (!score) return null;
  if (score.phase === "ft" || !score.phase) {
    return { home: score.home, away: score.away };
  }
  if (score.phase === "ht") {
    return { home: score.htHome ?? score.home, away: score.htAway ?? score.away };
  }
  if (score.phase === "live" && score.htHome != null && score.htAway != null) {
    return { home: score.htHome, away: score.htAway };
  }
  return null;
}

export function phaseLabel(score?: MatchScore) {
  if (!score) return "VS";
  if (score.phase === "live") return "LIVE";
  if (score.phase === "ht") return "HT";
  return "FT";
}
