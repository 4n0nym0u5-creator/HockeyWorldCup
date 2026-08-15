import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = join(root, "cloud/state.json");
const matchesPath = join(root, "src/data/matches.ts");

const TMS = {
  m01: 22334, m02: 22335, m03: 22336, m04: 22337, m05: 22338, m06: 22339, m07: 22340, m08: 22341,
  m09: 22342, m10: 22343, m11: 22344, m12: 22345, m13: 22346, m14: 22347, m15: 22348, m16: 22349,
  m17: 22350, m18: 22351, m19: 22352, m20: 22353, m21: 22354, m22: 22355, m23: 22356, m24: 22357,
  m25: 22358, m26: 22359, m27: 22360, m28: 22361, m29: 22362, m30: 22363, m31: 22364, m32: 22365,
  m33: 22366, m34: 22367, m35: 22368, m36: 22369, m37: 22370, m38: 22371, m39: 22372, m40: 22373,
  m41: 22374, m42: 22375, m43: 22376, m44: 22377, m45: 22378, m46: 22383, m47: 22379, m48: 22380,
  m49: 22381, m50: 22382,
  w01: 22384, w02: 22385, w03: 22386, w04: 22387, w05: 22388, w06: 22389, w07: 22390, w08: 22391,
  w09: 22392, w10: 22393, w11: 22394, w12: 22395, w13: 22396, w14: 22397, w15: 22398, w16: 22399,
  w17: 22400, w18: 22401, w19: 22402, w20: 22403, w21: 22404, w22: 22405, w23: 22406, w24: 22407,
  w25: 22408, w26: 22409, w27: 22410, w28: 22411, w29: 22412, w30: 22413, w31: 22414, w32: 22415,
  w33: 22416, w34: 22417, w35: 22418, w36: 22419, w37: 22420, w38: 22421, w39: 22422, w40: 22423,
  w41: 22424, w42: 22425, w43: 22426, w44: 22427, w45: 22428, w46: 22429, w47: 22430, w48: 22431,
  w49: 22432, w50: 22433,
};

const PRE_KICKOFF_MS = 30 * 60_000;
const POST_KICKOFF_MS = 4 * 60 * 60_000;

function kickoffs() {
  const src = readFileSync(matchesPath, "utf8");
  const map = {};
  for (const match of src.matchAll(/m\("(w\d+|m\d+)",\s*"[MW]",\s*"([^"]+)"/g)) {
    map[match[1]] = match[2];
  }
  return map;
}

function parseScoreline(value) {
  if (!value) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text || text === "-" || text === "–" || text === "v" || /upcoming/i.test(text)) return null;
  const match = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

function phaseFromStatus(status) {
  const text = String(status ?? "").toLowerCase();
  if (text.includes("official") || text.includes("complete")) return "ft";
  if (text.includes("half")) return "ht";
  if (text.includes("upcoming") || text.includes("warmup")) return null;
  if (
    text.includes("quarter") ||
    text.includes("q1") ||
    text.includes("q2") ||
    text.includes("q3") ||
    text.includes("q4")
  ) {
    return "live";
  }
  return null;
}

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseMatchPage(html) {
  const pusher = html.match(/data-pusher-realtime="([^"]+)"/);
  let scoreline = null;
  let status = "";
  if (pusher) {
    try {
      const data = JSON.parse(decodeEntities(pusher[1]));
      const match = data?.data?.match ?? data?.match ?? {};
      scoreline = parseScoreline(match.scoreline);
      status = String(match.status ?? match.statusminute ?? "").trim();
    } catch {
      // fall through to HTML
    }
  }
  if (!status) {
    status = (html.match(/class="match_status[^"]*">([^<]+)/)?.[1] ?? "").replace(/\s+/g, " ").trim();
  }
  if (!scoreline) {
    scoreline = parseScoreline(html.match(/class="match_scoreline[^"]*">([^<]+)/)?.[1] ?? "");
  }
  const phase = phaseFromStatus(status);
  return { scoreline, status, phase };
}

function shouldPoll(matchId, kickoff, existing) {
  if (existing?.source === "fih" && existing.phase === "ft") return false;
  const start = new Date(kickoff).getTime();
  if (Number.isNaN(start)) return false;
  const now = Date.now();
  if (now < start - PRE_KICKOFF_MS) return false;
  if (now > start + POST_KICKOFF_MS && existing?.phase === "ft") return false;
  if (now > start + POST_KICKOFF_MS && !existing) return false;
  return now <= start + POST_KICKOFF_MS || existing?.phase === "ht" || existing?.phase === "live";
}

function sameScore(a, b) {
  return (
    a.home === b.home &&
    a.away === b.away &&
    a.htHome === b.htHome &&
    a.htAway === b.htAway &&
    a.phase === b.phase &&
    a.source === b.source &&
    a.status === b.status
  );
}

function applyOfficial(existing, incoming) {
  if (!incoming.scoreline || !incoming.phase) return existing;
  const next = {
    home: incoming.scoreline.home,
    away: incoming.scoreline.away,
    htHome: existing?.htHome,
    htAway: existing?.htAway,
    phase: incoming.phase,
    source: "fih",
    status: incoming.status,
    at: Date.now(),
  };
  if (incoming.phase === "ht") {
    next.htHome = incoming.scoreline.home;
    next.htAway = incoming.scoreline.away;
  } else if (
    (incoming.phase === "live" || incoming.phase === "ft") &&
    next.htHome == null &&
    existing?.phase === "live"
  ) {
    next.htHome = existing.home;
    next.htAway = existing.away;
  }
  if (existing?.source === "fih" && existing.phase === "ft" && incoming.phase !== "ft") {
    return existing;
  }
  return next;
}

async function fetchMatch(tmsId) {
  const res = await fetch(`https://tms.fih.ch/matches/${tmsId}`, {
    headers: { "User-Agent": "FamilyCupScoreSync/1.0" },
  });
  if (!res.ok) throw new Error(`TMS ${tmsId} HTTP ${res.status}`);
  return parseMatchPage(await res.text());
}

const MEMBERS = new Set(["andrew", "nicole", "georgia", "emily", "hugo"]);
const KITCHEN = "https://ntfy.sh/fih-family-cup-2026-kitchen-notes";

function noteKey(note) {
  return note.id || `${note.memberId}:${note.at}:${note.text}`;
}

function mergeNoteLists(a = [], b = []) {
  const map = new Map();
  for (const note of [...a, ...b]) {
    const key = noteKey(note);
    if (!map.has(key)) map.set(key, { ...note, id: key });
  }
  return [...map.values()].sort((left, right) => left.at - right.at);
}

function normalizeNotes(raw = {}) {
  const notes = {};
  for (const [matchId, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      notes[matchId] = mergeNoteLists(value.filter((item) => item?.text && MEMBERS.has(item.memberId)));
    } else if (value?.text) {
      notes[matchId] = [{ id: `legacy-${matchId}`, memberId: "andrew", text: value.text, at: value.at ?? 0 }];
    }
  }
  return notes;
}

function mergePredictionLists(a = [], b = []) {
  const map = new Map();
  for (const tip of [...a, ...b]) {
    if (!MEMBERS.has(tip.memberId) || !Number.isFinite(tip.home) || !Number.isFinite(tip.away)) continue;
    const stamped = { ...tip, at: tip.at ?? 0 };
    const current = map.get(tip.memberId);
    if (!current || stamped.at >= current.at) map.set(tip.memberId, stamped);
  }
  return [...map.values()];
}

async function pullKitchen() {
  const res = await fetch(`${KITCHEN}/json?poll=1&since=all`);
  if (!res.ok) return { notes: {}, predictions: {} };
  const notes = {};
  const predictions = {};
  for (const line of (await res.text()).split("\n").map((row) => row.trim()).filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      const payload = JSON.parse(event.message ?? "{}");
      const memberId = payload.by ?? payload.memberId;
      const matchId = String(payload.matchId ?? "");
      if (!MEMBERS.has(memberId) || !matchId) continue;
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
      const note = {
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
  return { notes, predictions };
}

function notesChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function main() {
  const times = kickoffs();
  const doc = JSON.parse(readFileSync(ledgerPath, "utf8"));
  doc.scores ??= {};
  doc.predictions ??= {};
  doc.notes = normalizeNotes(doc.notes);

  const jobs = Object.entries(TMS).filter(([matchId, tmsId]) => {
    void tmsId;
    return shouldPoll(matchId, times[matchId], doc.scores[matchId]);
  });

  let changed = 0;
  for (const [matchId, tmsId] of jobs) {
    try {
      const incoming = await fetchMatch(tmsId);
      const next = applyOfficial(doc.scores[matchId], incoming);
      if (next && !sameScore(doc.scores[matchId] ?? {}, next)) {
        doc.scores[matchId] = next;
        changed += 1;
        console.log(`${matchId} TMS ${tmsId} ${incoming.status} ${incoming.scoreline?.home}-${incoming.scoreline?.away}`);
      }
    } catch (error) {
      console.error(`${matchId} failed:`, error.message);
    }
  }

  const beforeNotes = JSON.stringify(doc.notes);
  const beforeTips = JSON.stringify(doc.predictions);
  try {
    const kitchen = await pullKitchen();
    for (const [matchId, list] of Object.entries(kitchen.notes)) {
      doc.notes[matchId] = mergeNoteLists(doc.notes[matchId], list);
    }
    for (const [matchId, list] of Object.entries(kitchen.predictions)) {
      doc.predictions[matchId] = mergePredictionLists(doc.predictions[matchId], list);
    }
  } catch (error) {
    console.error("Kitchen sync failed:", error.message);
  }
  const noteUpdates = notesChanged(JSON.parse(beforeNotes), doc.notes);
  const tipUpdates = notesChanged(JSON.parse(beforeTips), doc.predictions);

  if (!changed && !noteUpdates && !tipUpdates) {
    console.log(`No official score, tip or note changes (${jobs.length} matches polled)`);
    return;
  }

  doc.updatedAt = Date.now();
  writeFileSync(ledgerPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`Wrote ${changed} official score(s), ${tipUpdates ? "new tips" : "no new tips"}, ${noteUpdates ? "new notes" : "no new notes"} to cloud/state.json`);
}

await main();
