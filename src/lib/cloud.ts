import type { MemberId, MatchScore, Prediction } from "../data/types";

const REPO = "4n0nym0u5-creator/HockeyWorldCup";
const PATH = "cloud/state.json";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/${PATH}`;
const API = `https://api.github.com/repos/${REPO}/contents/${PATH}`;

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
  notes: Record<string, { text: string; at: number }>;
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

export async function pullLedger(): Promise<CloudDoc | null> {
  const res = await fetch(`${RAW}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as CloudDoc;
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

  const predictions: CloudDoc["predictions"] = { ...remote.predictions };
  const matchIds = new Set([...Object.keys(local.predictions), ...Object.keys(remote.predictions)]);
  for (const matchId of matchIds) {
    const map = new Map<MemberId, StampedPrediction>();
    for (const tip of remote.predictions[matchId] ?? []) map.set(tip.memberId, tip);
    for (const tip of local.predictions[matchId] ?? []) {
      const current = map.get(tip.memberId);
      if (!current || tip.at >= current.at) map.set(tip.memberId, tip);
    }
    predictions[matchId] = [...map.values()];
  }

  const notes = { ...remote.notes };
  for (const [id, note] of Object.entries(local.notes)) {
    if (!notes[id] || note.at >= notes[id].at) notes[id] = note;
  }

  return {
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    scores,
    predictions,
    notes,
  };
}
