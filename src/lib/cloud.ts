import type { MatchNote, MemberId, MatchScore, Prediction } from "../data/types";

const REPO = "4n0nym0u5-creator/HockeyWorldCup";
const PATH = "cloud/state.json";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/${PATH}`;
const API = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
const KITCHEN = "https://ntfy.sh/fih-family-cup-2026-kitchen-notes";
const MEMBERS: MemberId[] = ["andrew", "nicole", "georgia", "emily", "hugo"];

export type CloudStatus = "live" | "saving" | "offline";

export interface StampedScore extends MatchScore {
  at: number;
  by?: MemberId;
}

export interface StampedPrediction extends Prediction {
  at: number;
}

export interface CloudDoc {
  updatedAt: number;
  scores: Record<string, StampedScore>;
  predictions: Record<string, StampedPrediction[]>;
  notes: Record<string, MatchNote[]>;
}

export const emptyDoc = (): CloudDoc => ({
  updatedAt: 0,
  scores: {},
  predictions: {},
  notes: {},
});

function ledgerToken() {
  return (
    (import.meta.env.VITE_LEDGER_TOKEN as string | undefined) ||
    localStorage.getItem("family-cup-ledger-token") ||
    ""
  );
}

export function canWriteLedger() {
  return Boolean(ledgerToken());
}

export function noteKey(note: Pick<MatchNote, "id" | "memberId" | "text" | "at">) {
  return note.id || `${note.memberId}:${note.at}:${note.text}`;
}

export function mergeNoteLists(a: MatchNote[] = [], b: MatchNote[] = []) {
  const map = new Map<string, MatchNote>();
  for (const note of [...a, ...b]) {
    const key = noteKey(note);
    if (!map.has(key)) map.set(key, { ...note, id: key });
  }
  return [...map.values()].sort((left, right) => left.at - right.at);
}

function asMember(value: unknown): MemberId | null {
  return MEMBERS.includes(value as MemberId) ? (value as MemberId) : null;
}

export function mergeNoteMaps(
  a: Record<string, MatchNote[]> = {},
  b: Record<string, MatchNote[]> = {},
) {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  const notes: Record<string, MatchNote[]> = {};
  for (const id of ids) notes[id] = mergeNoteLists(a[id], b[id]);
  return notes;
}

export function mergePredictionLists(a: StampedPrediction[] = [], b: StampedPrediction[] = []) {
  const map = new Map<MemberId, StampedPrediction>();
  for (const tip of [...a, ...b]) {
    const memberId = asMember(tip.memberId);
    if (!memberId || !Number.isFinite(tip.home) || !Number.isFinite(tip.away)) continue;
    const stamped = { ...tip, memberId, at: tip.at ?? 0 };
    const current = map.get(memberId);
    if (!current || stamped.at >= current.at) map.set(memberId, stamped);
  }
  return [...map.values()];
}

export function mergePredictionMaps(
  a: Record<string, StampedPrediction[]> = {},
  b: Record<string, StampedPrediction[]> = {},
) {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  const predictions: Record<string, StampedPrediction[]> = {};
  for (const id of ids) predictions[id] = mergePredictionLists(a[id], b[id]);
  return predictions;
}

export function normalizeNotes(raw: unknown): Record<string, MatchNote[]> {
  if (!raw || typeof raw !== "object") return {};
  const notes: Record<string, MatchNote[]> = {};
  for (const [matchId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      notes[matchId] = mergeNoteLists(
        value.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as Partial<MatchNote>;
          const memberId = asMember(row.memberId);
          const text = String(row.text ?? "").trim();
          if (!memberId || !text) return [];
          return [{
            id: String(row.id || `${memberId}:${row.at ?? 0}:${text}`),
            memberId,
            text,
            at: Number(row.at) || 0,
          }];
        }),
      );
      continue;
    }
    if (value && typeof value === "object" && "text" in value) {
      const text = String((value as { text?: string }).text ?? "").trim();
      if (!text) continue;
      notes[matchId] = [{
        id: `legacy-${matchId}`,
        memberId: "andrew",
        text,
        at: Number((value as { at?: number }).at) || 0,
      }];
    }
  }
  return notes;
}

export async function pullLedger(): Promise<CloudDoc | null> {
  const res = await fetch(`${RAW}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  const doc = (await res.json()) as CloudDoc;
  return { ...doc, notes: normalizeNotes(doc.notes), predictions: mergePredictionMaps(doc.predictions) };
}

export async function pullKitchen(): Promise<{
  notes: Record<string, MatchNote[]>;
  predictions: Record<string, StampedPrediction[]>;
}> {
  const notes: Record<string, MatchNote[]> = {};
  const predictions: Record<string, StampedPrediction[]> = {};
  try {
    const res = await fetch(`${KITCHEN}/json?poll=1&since=2d`, { cache: "no-store" });
    if (!res.ok) return { notes, predictions };
    const lines = (await res.text()).split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as { id?: string; time?: number; message?: string };
        const payload = JSON.parse(event.message ?? "{}") as {
          kind?: string;
          matchId?: string;
          by?: string;
          memberId?: string;
          text?: string;
          id?: string;
          home?: number;
          away?: number;
          at?: number;
        };
        const memberId = asMember(payload.by ?? payload.memberId);
        const matchId = String(payload.matchId ?? "");
        if (!memberId || !matchId) continue;
        const at = Number(payload.at) || Number(event.time) * 1000 || Date.now();
        if (payload.kind === "tip" || (payload.kind !== "note" && Number.isFinite(payload.home) && Number.isFinite(payload.away) && !payload.text)) {
          predictions[matchId] = mergePredictionLists(predictions[matchId], [{
            memberId,
            home: Number(payload.home),
            away: Number(payload.away),
            at,
          }]);
          continue;
        }
        const text = String(payload.text ?? "").trim();
        if (!text || text === "probe") continue;
        const note: MatchNote = {
          id: String(payload.id || event.id || `${memberId}:${at}:${text}`),
          memberId,
          text,
          at,
        };
        notes[matchId] = mergeNoteLists(notes[matchId], [note]);
      } catch {
        // skip a bad live kitchen item
      }
    }
  } catch {
    // live kitchen is a bonus; the ledger still holds
  }
  return { notes, predictions };
}

export async function postKitchenNote(matchId: string, note: MatchNote) {
  const res = await fetch(KITCHEN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Title: `${note.memberId} ${matchId}` },
    body: JSON.stringify({
      kind: "note",
      matchId,
      id: note.id,
      by: note.memberId,
      memberId: note.memberId,
      text: note.text,
      at: note.at,
    }),
  });
  if (!res.ok) throw new Error("Could not share that note");
}

export async function postKitchenTip(matchId: string, tip: StampedPrediction) {
  const res = await fetch(KITCHEN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Title: `tip ${tip.memberId} ${matchId}` },
    body: JSON.stringify({
      kind: "tip",
      matchId,
      memberId: tip.memberId,
      by: tip.memberId,
      home: tip.home,
      away: tip.away,
      at: tip.at,
    }),
  });
  if (!res.ok) throw new Error("Could not share that tip");
}

async function latestSha(token: string) {
  const res = await fetch(`${API}?ref=main`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Could not read the family ledger");
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

export async function pushLedger(doc: CloudDoc) {
  const token = ledgerToken();
  if (!token) throw new Error("no-token");
  const sha = await latestSha(token);
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(doc))));
  const res = await fetch(API, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "Update Family Cup ledger",
      content,
      sha,
      branch: "main",
    }),
  });
  if (!res.ok) throw new Error("Could not save the family ledger");
}

function newer(a: StampedScore, b: StampedScore) {
  return a.at >= b.at ? a : b;
}

function officialOf(phase: StampedScore["phase"], a: StampedScore, b: StampedScore) {
  const hits = [a, b].filter((score) => score.source === "fih" && score.phase === phase);
  return hits.length ? newer(hits[0], hits[hits.length - 1]) : null;
}

/** Official FIH snapshots beat manual entries. Never drop a later official phase. */
export function pickScore(remote: StampedScore, local: StampedScore): StampedScore {
  return (
    officialOf("ft", remote, local) ??
    officialOf("ht", remote, local) ??
    officialOf("live", remote, local) ??
    newer(local, remote)
  );
}

export function mergeDocs(local: CloudDoc, remote: CloudDoc): CloudDoc {
  const scores = { ...remote.scores };
  for (const [id, score] of Object.entries(local.scores)) {
    scores[id] = scores[id] ? pickScore(scores[id], score) : score;
  }

  return {
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    scores,
    predictions: mergePredictionMaps(remote.predictions, local.predictions),
    notes: mergeNoteMaps(remote.notes, local.notes),
  };
}
