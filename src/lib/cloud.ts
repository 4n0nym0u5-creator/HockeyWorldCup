import type { MatchNote, MemberId, MatchScore, Prediction } from "../data/types";

const REPO = "4n0nym0u5-creator/HockeyWorldCup";
const PATH = "cloud/state.json";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/${PATH}`;
const API = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
function pageLedgerUrl() {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}ledger.json?t=${Date.now()}`;
}

const LEDGER_URLS = [
  () => pageLedgerUrl(),
  () => `${RAW}?t=${Date.now()}`,
  () => `https://media.githubusercontent.com/media/${REPO}/main/${PATH}?t=${Date.now()}`,
  () => `https://github.com/${REPO}/raw/refs/heads/main/${PATH}?t=${Date.now()}`,
  () => `${API}?ref=main&t=${Date.now()}`,
];
const KITCHEN = "https://ntfy.sh/fih-family-cup-2026-kitchen-notes";
const MEMBERS: MemberId[] = ["andrew", "nicole", "georgia", "emily", "hugo"];
export const MAX_NOTES_PER_MATCH = 100;

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
  return [...map.values()].sort((left, right) => left.at - right.at).slice(-MAX_NOTES_PER_MATCH);
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
    const home = Number(tip.home);
    const away = Number(tip.away);
    if (!memberId || !Number.isFinite(home) || !Number.isFinite(away)) continue;
    const stamped = { ...tip, memberId, home, away, at: Number(tip.at) || 0 };
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

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeScores(raw: unknown): Record<string, StampedScore> {
  if (!raw || typeof raw !== "object") return {};
  const scores: Record<string, StampedScore> = {};
  for (const [id, value] of Object.entries(raw as Record<string, Partial<StampedScore>>)) {
    if (!value || !Number.isFinite(Number(value.home)) || !Number.isFinite(Number(value.away))) continue;
    scores[id] = {
      ...value,
      home: Number(value.home),
      away: Number(value.away),
      htHome: value.htHome == null ? undefined : Number(value.htHome),
      htAway: value.htAway == null ? undefined : Number(value.htAway),
      at: Number(value.at) || 0,
    };
  }
  return scores;
}

function tidyDoc(doc: CloudDoc): CloudDoc {
  return {
    ...doc,
    scores: normalizeScores(doc.scores),
    notes: normalizeNotes(doc.notes),
    predictions: mergePredictionMaps(doc.predictions),
  };
}

async function readLedgerResponse(res: Response): Promise<CloudDoc | null> {
  if (!res.ok) return null;
  const data = (await res.json()) as CloudDoc & { content?: string; encoding?: string };
  if (data?.scores || data?.notes || data?.predictions) return data;
  if (data?.content) {
    const json = data.encoding === "base64" ? decodeBase64Utf8(data.content) : data.content;
    return JSON.parse(json) as CloudDoc;
  }
  return null;
}

async function fetchLedger(href: string, ms = 4000): Promise<CloudDoc | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const isApi = href.startsWith("https://api.github.com");
    const res = await fetch(href, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Cache-Control": "no-cache",
        Accept: isApi
          ? "application/vnd.github.raw+json, application/vnd.github+json"
          : "application/json",
      },
    });
    const doc = await readLedgerResponse(res);
    if (!doc || typeof doc !== "object") return null;
    return tidyDoc(doc);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function pullLedger(): Promise<CloudDoc | null> {
  // Same-origin ledger.json is a build snapshot. Score-sync commits to main do not
  // rebuild Pages (GITHUB_TOKEN), so GitHub raw can be hours newer — merge both.
  const primary = await Promise.all(
    LEDGER_URLS.slice(0, 3).map((url) => fetchLedger(url())),
  );
  const docs = primary.filter((doc): doc is CloudDoc => Boolean(doc));
  if (docs.length) return docs.reduce((acc, doc) => mergeDocs(acc, doc));
  for (const url of LEDGER_URLS.slice(3)) {
    const doc = await fetchLedger(url());
    if (doc) return doc;
  }
  return null;
}

type KitchenPayload = {
  kind?: string;
  matchId?: string;
  by?: string;
  memberId?: string;
  text?: string;
  id?: string;
  home?: number;
  away?: number;
  at?: number;
  phase?: MatchScore["phase"];
  source?: MatchScore["source"];
  status?: string;
  htHome?: number;
  htAway?: number;
  scores?: Record<string, StampedScore>;
};

export function parseKitchenPayload(payload: KitchenPayload) {
  if (payload.kind === "scores" && payload.scores && typeof payload.scores === "object") {
    return { scores: payload.scores };
  }
  if (payload.kind === "score" && payload.matchId && Number.isFinite(Number(payload.home))) {
    return {
      matchId: String(payload.matchId),
      score: {
        home: Number(payload.home),
        away: Number(payload.away),
        htHome: payload.htHome,
        htAway: payload.htAway,
        phase: payload.phase ?? "ft",
        source: payload.source ?? "fih",
        status: payload.status,
        at: Number(payload.at) || Date.now(),
      } satisfies StampedScore,
    };
  }
  const memberId = asMember(payload.by ?? payload.memberId);
  const matchId = String(payload.matchId ?? "");
  if (!memberId || !matchId) return null;
  const at = Number(payload.at) || Date.now();
  if (payload.kind === "tip" || (payload.kind !== "note" && Number.isFinite(payload.home) && Number.isFinite(payload.away) && !payload.text)) {
    return {
      matchId,
      tip: { memberId, home: Number(payload.home), away: Number(payload.away), at } satisfies StampedPrediction,
    };
  }
  const text = String(payload.text ?? "").trim();
  if (!text || text === "probe") return null;
  return {
    matchId,
    note: {
      id: String(payload.id || `${memberId}:${at}:${text}`),
      memberId,
      text,
      at,
    } satisfies MatchNote,
  };
}

export function applyKitchenPayload(doc: CloudDoc, payload: KitchenPayload): CloudDoc {
  const parsed = parseKitchenPayload(payload);
  if (!parsed) return doc;
  if (parsed.scores) {
    const scores = { ...doc.scores };
    for (const [id, score] of Object.entries(parsed.scores)) {
      const incoming = { ...score, at: score.at ?? Date.now() };
      scores[id] = scores[id] ? pickScore(scores[id], incoming) : incoming;
    }
    return { ...doc, scores };
  }
  if (parsed.score && parsed.matchId) {
    const current = doc.scores[parsed.matchId];
    return {
      ...doc,
      scores: {
        ...doc.scores,
        [parsed.matchId]: current ? pickScore(current, parsed.score) : parsed.score,
      },
    };
  }
  if (parsed.note) {
    return {
      ...doc,
      notes: {
        ...doc.notes,
        [parsed.matchId]: mergeNoteLists(doc.notes[parsed.matchId], [parsed.note]),
      },
    };
  }
  if (parsed.tip) {
    return {
      ...doc,
      predictions: {
        ...doc.predictions,
        [parsed.matchId]: mergePredictionLists(doc.predictions[parsed.matchId], [parsed.tip]),
      },
    };
  }
  return doc;
}

export function subscribeKitchen(onPayload: (payload: KitchenPayload) => void) {
  if (typeof EventSource === "undefined") return () => {};
  let source: EventSource;
  try {
    source = new EventSource(`${KITCHEN}/sse`);
  } catch {
    return () => {};
  }
  const handle = (event: MessageEvent) => {
    try {
      const ev = JSON.parse(event.data) as { event?: string; message?: string };
      if (ev.event && ev.event !== "message") return;
      if (!ev.message) return;
      onPayload(JSON.parse(ev.message) as KitchenPayload);
    } catch {
      // ignore a broken live event
    }
  };
  source.addEventListener("message", handle);
  source.onmessage = handle;
  return () => source.close();
}

export async function pullKitchen(): Promise<{
  notes: Record<string, MatchNote[]>;
  predictions: Record<string, StampedPrediction[]>;
  scores: Record<string, StampedScore>;
}> {
  const notes: Record<string, MatchNote[]> = {};
  const predictions: Record<string, StampedPrediction[]> = {};
  const scores: Record<string, StampedScore> = {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${KITCHEN}/json?poll=1&since=all`, {
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return { notes, predictions, scores };
    const lines = (await res.text()).split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as { time?: number; message?: string };
        const payload = JSON.parse(event.message ?? "{}") as KitchenPayload;
        if (!payload.at && event.time) payload.at = event.time * 1000;
        const parsed = parseKitchenPayload(payload);
        if (!parsed) continue;
        if (parsed.scores) {
          for (const [id, score] of Object.entries(parsed.scores)) {
            const incoming = { ...score, at: score.at ?? Date.now() };
            scores[id] = scores[id] ? pickScore(scores[id], incoming) : incoming;
          }
        }
        if (parsed.score && parsed.matchId) {
          scores[parsed.matchId] = scores[parsed.matchId]
            ? pickScore(scores[parsed.matchId], parsed.score)
            : parsed.score;
        }
        if (parsed.note) notes[parsed.matchId] = mergeNoteLists(notes[parsed.matchId], [parsed.note]);
        if (parsed.tip) predictions[parsed.matchId] = mergePredictionLists(predictions[parsed.matchId], [parsed.tip]);
      } catch {
        // skip a bad live kitchen item
      }
    }
  } catch {
    // live kitchen is a bonus; the ledger still holds
  }
  return { notes, predictions, scores };
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
