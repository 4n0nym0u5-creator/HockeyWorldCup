import type { MatchNote, MemberId, MatchScore, Prediction } from "../data/types";
import { normalizeNotes, type CloudDoc } from "./cloud";

const KEY = "family-cup-2026-v2";

export interface AppState {
  scores: Record<string, MatchScore>;
  predictions: Record<string, Prediction[]>;
  notes: Record<string, MatchNote[]>;
  you: MemberId;
}

const empty: AppState = {
  scores: {},
  predictions: {},
  notes: {},
  you: "andrew",
};

function readLocalNotes(parsed: Partial<AppState> & { noteTimes?: Record<string, number> }) {
  if (!parsed.notes) return {};
  const first = Object.values(parsed.notes)[0];
  if (Array.isArray(first) || first == null) return normalizeNotes(parsed.notes);
  const legacy: Record<string, MatchNote[]> = {};
  for (const [id, text] of Object.entries(parsed.notes as unknown as Record<string, string>)) {
    if (!String(text ?? "").trim()) continue;
    legacy[id] = [{
      id: `legacy-${id}`,
      memberId: parsed.you ?? "andrew",
      text: String(text),
      at: parsed.noteTimes?.[id] ?? 0,
    }];
  }
  return legacy;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem("family-cup-2026-v1");
    if (!raw) return { ...empty };
    const parsed = JSON.parse(raw) as Partial<AppState> & { noteTimes?: Record<string, number> };
    return {
      scores: parsed.scores ?? {},
      predictions: parsed.predictions ?? {},
      notes: readLocalNotes(parsed),
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
  return {
    updatedAt: Date.now(),
    scores: Object.fromEntries(
      Object.entries(state.scores).map(([id, score]) => [
        id,
        {
          home: score.home,
          away: score.away,
          htHome: score.htHome,
          htAway: score.htAway,
          phase: score.phase,
          source: score.source,
          status: score.status,
          at: score.at ?? 0,
          by: score.by,
        },
      ]),
    ),
    predictions,
    notes: state.notes,
  };
}

export function docToState(doc: CloudDoc, you: MemberId): AppState {
  return {
    you,
    scores: doc.scores,
    predictions: doc.predictions,
    notes: normalizeNotes(doc.notes),
  };
}
