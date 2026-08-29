import type { MatchScore } from "../data/types";

export function isFullTime(score?: MatchScore) {
  return Boolean(score && (score.phase === "ft" || !score.phase));
}

/** Kick-off has happened, FIH has not written full-time, and we are still inside the live window. */
export function isInPlay(kickoff: string, score?: MatchScore, now = Date.now()) {
  if (isFullTime(score)) return false;
  const start = new Date(kickoff).getTime();
  if (Number.isNaN(start) || now < start) return false;
  if (score?.phase === "live" || score?.phase === "ht") return true;
  return now < start + 120 * 60_000;
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
    return {
      home: score.home,
      away: score.away,
      soHome: score.soHome,
      soAway: score.soAway,
    };
  }
  if (score.phase === "ht") {
    return { home: score.htHome ?? score.home, away: score.htAway ?? score.away };
  }
  if (score.phase === "live" && score.htHome != null && score.htAway != null) {
    return { home: score.htHome, away: score.htAway };
  }
  return null;
}

export function hasShootout(score?: MatchScore) {
  return Boolean(score && Number.isFinite(score.soHome) && Number.isFinite(score.soAway));
}

/** Who won the match, including a shootout after a regulation draw. */
export function decidedSide(score: MatchScore): "home" | "away" | "draw" {
  if (score.home > score.away) return "home";
  if (score.away > score.home) return "away";
  if (hasShootout(score) && score.soHome !== score.soAway) {
    return (score.soHome ?? 0) > (score.soAway ?? 0) ? "home" : "away";
  }
  return "draw";
}

export function formatScoreline(score: MatchScore) {
  const ft = `${score.home}–${score.away}`;
  return hasShootout(score) ? `${ft} (${score.soHome}–${score.soAway} SO)` : ft;
}

export function phaseLabel(score?: MatchScore) {
  if (!score) return "VS";
  if (score.phase === "live") return "LIVE";
  if (score.phase === "ht") return "HT";
  if (hasShootout(score)) return "SO";
  return "FT";
}
