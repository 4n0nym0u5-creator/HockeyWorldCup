import type { MemberId, MatchScore, Prediction } from "../data/types";

const KEY = "family-cup-2026-v1";

export interface AppState {
  scores: Record<string, MatchScore>;
  predictions: Record<string, Prediction[]>;
  notes: Record<string, string>;
  you: MemberId;
}

const empty: AppState = {
  scores: {},
  predictions: {},
  notes: {},
  you: "andrew",
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...empty };
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      scores: parsed.scores ?? {},
      predictions: parsed.predictions ?? {},
      notes: parsed.notes ?? {},
      you: parsed.you ?? "andrew",
    };
  } catch {
    return { ...empty };
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function exportState(state: AppState) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

export function importState(code: string): AppState | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(code)))) as AppState;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      scores: parsed.scores ?? {},
      predictions: parsed.predictions ?? {},
      notes: parsed.notes ?? {},
      you: parsed.you ?? "andrew",
    };
  } catch {
    return null;
  }
}
