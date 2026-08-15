import type { MemberId, MatchScore, Prediction } from "../data/types";
import type { CloudDoc } from "./cloud";

const KEY = "family-cup-2026-v2";

export interface AppState {
  scores: Record<string, MatchScore>;
  predictions: Record<string, Prediction[]>;
  notes: Record<string, string>;
  noteTimes: Record<string, number>;
  you: MemberId;
}

const empty: AppState = {
  scores: {},
  predictions: {},
  notes: {},
  noteTimes: {},
  you: "andrew",
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem("family-cup-2026-v1");
    if (!raw) return { ...empty };
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      scores: parsed.scores ?? {},
      predictions: parsed.predictions ?? {},
      notes: parsed.notes ?? {},
      noteTimes: parsed.noteTimes ?? {},
      you: parsed.you ?? "andrew",
    };
  } catch {
    return { ...empty };
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function stateToDoc(state: AppState): CloudDoc {
  const predictions: CloudDoc["predictions"] = {};
  for (const [id, tips] of Object.entries(state.predictions)) {
    predictions[id] = tips.map((tip) => ({
      ...tip,
      at: tip.at ?? 0,
    }));
  }
  const notes: CloudDoc["notes"] = {};
  for (const [id, text] of Object.entries(state.notes)) {
    notes[id] = { text, at: state.noteTimes[id] ?? 0 };
  }
  return {
    updatedAt: Date.now(),
    scores: Object.fromEntries(
      Object.entries(state.scores).map(([id, score]) => [
        id,
        { home: score.home, away: score.away, at: score.at ?? 0, by: score.by },
      ]),
    ),
    predictions,
    notes,
  };
}

export function docToState(doc: CloudDoc, you: MemberId): AppState {
  const notes: Record<string, string> = {};
  const noteTimes: Record<string, number> = {};
  for (const [id, note] of Object.entries(doc.notes)) {
    notes[id] = note.text;
    noteTimes[id] = note.at;
  }
  return {
    you,
    scores: doc.scores,
    predictions: doc.predictions,
    notes,
    noteTimes,
  };
}
