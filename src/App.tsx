import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { tournamentFacts, watchTips } from "./data/facts";
import { matches, venues } from "./data/matches";
import { members } from "./data/members";
import { teamById, teams } from "./data/teams";
import type { FamilyMember, Match, MatchScore, MemberId } from "./data/types";
import {
  canWriteLedger,
  emptyDoc,
  mergeDocs,
  applyKitchenPayload,
  postKitchenNote,
  postKitchenTip,
  pullKitchen,
  pullLedger,
  pushLedger,
  subscribeKitchen,
  type CloudStatus,
} from "./lib/cloud";
import { ownerOf } from "./lib/owners";
import { predictionPoints, scoreboard } from "./lib/scoring";
import { poolTable } from "./lib/standings";
import { docToState, loadState, saveState, stateToDoc, type AppState } from "./lib/storage";
import { dayKey, formatDate, formatDateTime, matchStatus } from "./lib/time";
import { isFullTime } from "./lib/scorePhase";
import { Flag, LocalNote, MatchCard, OfficialScore, TeamMark, TipCallout, WinnerCallout } from "./ui";

type Tab = "today" | "schedule" | "rosters" | "table" | "clashes" | "pools" | "facts" | "rules";

const tabs: { id: Tab; label: string }[] = [
  { id: "today", label: "Tonight" },
  { id: "schedule", label: "Fixtures" },
  { id: "rosters", label: "Houses" },
  { id: "table", label: "Ladder" },
  { id: "clashes", label: "Clashes" },
  { id: "pools", label: "Pools" },
  { id: "facts", label: "Briefing" },
  { id: "rules", label: "Rules" },
];

export function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState<Tab>("today");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [cloud, setCloud] = useState<CloudStatus>("offline");
  const skipPush = useRef(true);
  const refreshKitchen = useRef(async () => {});

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const applyIncoming = (incoming: ReturnType<typeof emptyDoc>) => {
      skipPush.current = true;
      setState((current) => docToState(mergeDocs(stateToDoc(current), incoming), current.you));
      setCloud("live");
    };
    const hydrate = async (withKitchen: boolean) => {
      try {
        const remote = await pullLedger();
        if (cancelled) return;
        applyIncoming(remote ?? emptyDoc());
      } catch {
        if (!cancelled) setCloud("offline");
      }
      if (!withKitchen || cancelled) return;
      try {
        const kitchen = await pullKitchen();
        if (cancelled) return;
        applyIncoming({
          ...emptyDoc(),
          notes: kitchen.notes,
          predictions: kitchen.predictions,
        });
      } catch {
        // ledger already painted; live kitchen is optional
      }
    };
    refreshKitchen.current = () => hydrate(true);
    void hydrate(true);
    const id = setInterval(() => void hydrate(false), 15_000);
    let stopLive = () => {};
    try {
      stopLive = subscribeKitchen((payload) => {
        if (cancelled) return;
        skipPush.current = true;
        setState((current) => docToState(applyKitchenPayload(stateToDoc(current), payload), current.you));
        setCloud("live");
      });
    } catch {
      // live stream is optional
    }
    return () => {
      cancelled = true;
      clearInterval(id);
      stopLive();
    };
  }, []);

  useEffect(() => {
    if (skipPush.current) {
      skipPush.current = false;
      return;
    }
    if (!canWriteLedger()) return;
    const id = window.setTimeout(() => {
      setCloud("saving");
      void pushLedger(stateToDoc(state))
        .then(() => setCloud("live"))
        .catch(() => setCloud("offline"));
    }, 700);
    return () => window.clearTimeout(id);
  }, [state.scores, state.predictions, state.notes]);

  const you = members.find((m) => m.id === state.you)!;
  const board = useMemo(
    () => scoreboard(state.scores, state.predictions),
    [state.scores, state.predictions],
  );
  const open = matches.find((m) => m.id === openId) ?? null;

  const patch = (partial: Partial<AppState>) => setState((s) => ({ ...s, ...partial }));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">🏑</div>
          <div>
            <p className="eyebrow">Family Cup · Belgium & Netherlands</p>
            <h1>FIH World Cup 2026</h1>
            <p className="lede">
              Andrew, Nicole, Georgia, Emily and Hugo split every team. Official scores land at
              half-time and full-time, and the family ladder moves with them.
            </p>
          </div>
        </div>
        <div className="you-box">
          <label>Watching as</label>
          <select value={state.you} onChange={(e) => patch({ you: e.target.value as MemberId })}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>
            ))}
          </select>
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
            Times follow this device. Pitch clocks are CEST.
          </div>
          <div className={`live-dot ${cloud === "offline" ? "off" : cloud === "saving" ? "saving" : ""}`}>
            <i />
            {cloud === "live" && "Live kitchen · shared with everyone"}
            {cloud === "saving" && "Live kitchen · saving…"}
            {cloud === "offline" && (canWriteLedger() ? "Live kitchen · retrying" : "Live kitchen · viewing the shared ladder")}
          </div>
          <button
            type="button"
            className="ghost"
            style={{ marginTop: 10, width: "100%" }}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("v", Date.now().toString());
              window.location.replace(url.toString());
            }}
          >
            Load latest
          </button>
        </div>
      </header>

      <nav className="nav">
        {tabs.map((item) => (
          <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "today" && <Today you={you} state={state} board={board} onOpen={setOpenId} onRefresh={() => refreshKitchen.current()} tick={tick} />}
      {tab === "schedule" && <Schedule you={you} state={state} onOpen={setOpenId} onRefresh={() => refreshKitchen.current()} />}
      {tab === "rosters" && <Rosters />}
      {tab === "table" && <Ladder board={board} />}
      {tab === "clashes" && <Clashes state={state} onOpen={setOpenId} onRefresh={() => refreshKitchen.current()} />}
      {tab === "pools" && <Pools scores={state.scores} />}
      {tab === "facts" && <Facts />}
      {tab === "rules" && <Rules cloud={cloud} />}

      {open && (
        <MatchModal
          match={open}
          state={state}
          onClose={() => setOpenId(null)}
          onTip={async (home, away) => {
            const tip = { memberId: state.you, home, away, at: Date.now() };
            const current = state.predictions[open.id]?.filter((p) => p.memberId !== state.you) ?? [];
            patch({
              predictions: {
                ...state.predictions,
                [open.id]: [...current, tip],
              },
            });
            try {
              await postKitchenTip(open.id, tip);
            } catch {
              setCloud("offline");
            }
          }}
          onNote={async (text) => {
            const note = {
              id: `${state.you}-${Date.now()}`,
              memberId: state.you,
              text,
              at: Date.now(),
            };
            patch({
              notes: {
                ...state.notes,
                [open.id]: [...(state.notes[open.id] ?? []), note],
              },
            });
            try {
              await postKitchenNote(open.id, note);
            } catch {
              setCloud("offline");
            }
          }}
        />
      )}
    </div>
  );
}

function Today({
  you,
  state,
  board,
  onOpen,
  onRefresh,
  tick,
}: {
  you: FamilyMember;
  state: AppState;
  board: ReturnType<typeof scoreboard>;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<void>;
  tick: number;
}) {
  void tick;
  const now = Date.now();
  const upcoming = matches
    .filter((m) => new Date(m.kickoff).getTime() + 90 * 60_000 > now)
    .slice(0, 6);
  const yours = upcoming.filter(
    (m) => you.teamIds.includes(m.homeId) || you.teamIds.includes(m.awayId),
  );
  const fact = tournamentFacts[new Date().getDate() % tournamentFacts.length];
  const youRow = board.find((b) => b.memberId === you.id);

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="kicker">15–30 August · Opening festival</div>
            <h2 style={{ fontSize: "clamp(42px, 8vw, 84px)", marginTop: 10 }}>
              Five houses.<br />Thirty-two nations.
            </h2>
            <p className="lede">
              {you.name}, you own {you.teamIds.length} sides. Your next watch is highlighted below.
              Family clashes pay extra. Official FIH scores lock in at half-time and full-time.
            </p>
          </div>
          <div className="card fact">{fact}</div>
        </div>
        <div className="stat-row">
          <div className="stat"><b>{youRow?.total ?? 0}</b><span>{you.name}'s points</span></div>
          <div className="stat"><b>{Object.keys(state.scores).length}</b><span>Official results</span></div>
          <div className="stat"><b>{yours.length}</b><span>Your next matches</span></div>
          <div className="stat"><b>{board[0] ? members.find((m) => m.id === board[0].memberId)?.name : "—"}</b><span>Current leader</span></div>
        </div>
      </section>

      <button className="card spotlight" onClick={() => onOpen("m18")} style={{ width: "100%", textAlign: "left", marginBottom: 18 }}>
        <p className="eyebrow">Must watch · 19 August</p>
        <h3>India vs Pakistan · the rivalry</h3>
        <p className="lede">
          Nicole's India against Emily's Pakistan at Wagener Stadium. Harmanpreet's drag-flick vs a four-time world champion
          in green. Family clash bonus is live. Tap to tip it now.
        </p>
      </button>

      <div className="grid-2">
        <div>
          <div className="section-head"><h2>Up next</h2></div>
          <div className="stack">
            {upcoming.map((match) => (
              <MatchCard key={match.id} match={match} score={state.scores[match.id]} notes={state.notes[match.id]} tips={state.predictions[match.id]} onOpen={() => onOpen(match.id)} onRefresh={onRefresh} />
            ))}
          </div>
        </div>
        <div className="stack">
          <MiniLadder board={board} />
          <YourHouse you={you} />
        </div>
      </div>
    </>
  );
}

function MiniLadder({ board }: { board: ReturnType<typeof scoreboard> }) {
  return (
    <div className="panel" style={{ padding: 8 }}>
      <div className="section-head" style={{ padding: "8px 8px 0" }}>
        <h3>Live ladder</h3>
        {board.some((row) => row.provisional) && <p className="lede">Includes half-time points</p>}
      </div>
      {board.map((row, i) => {
        const member = members.find((m) => m.id === row.memberId)!;
        return (
          <div className="leader" key={row.memberId}>
            <div className="rank-num">{i + 1}</div>
            <div style={{ flex: 1 }}>
              <strong>{member.emoji} {member.name}</strong>
              <div style={{ fontSize: 12, opacity: 0.65 }}>{row.teamPoints} team · {row.predPoints} tips · {row.bonusPoints} bonus</div>
            </div>
            <b style={{ fontFamily: "Bebas Neue", fontSize: 32 }}>{row.total}</b>
          </div>
        );
      })}
    </div>
  );
}

function YourHouse({ you }: { you: FamilyMember }) {
  return (
    <div className="member-card card" style={{ "--member": you.color } as CSSProperties}>
      <p className="eyebrow">{you.role}</p>
      <h3>{you.emoji} {you.name}</h3>
      <p className="italic" style={{ marginTop: 6 }}>{you.tagline}</p>
      <div className="stack" style={{ marginTop: 12 }}>
        {you.teamIds.map((id) => {
          const team = teamById[id];
          return (
            <div className="team-chip" key={id}>
              <Flag code={team.flag} alt={team.name} />
              <div>
                <strong>{team.name}</strong>
                <div style={{ fontSize: 12, opacity: 0.65 }}>{team.gender === "M" ? "Men" : "Women"} · Pool {team.pool} · WR {team.rank}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Schedule({
  you,
  state,
  onOpen,
  onRefresh,
}: {
  you: FamilyMember;
  state: AppState;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [gender, setGender] = useState<"all" | "M" | "W">("all");
  const [mine, setMine] = useState(false);
  const [clashes, setClashes] = useState(false);

  const filtered = matches.filter((match) => {
    if (gender !== "all" && match.gender !== gender) return false;
    if (mine && !you.teamIds.includes(match.homeId) && !you.teamIds.includes(match.awayId)) return false;
    if (clashes) {
      const a = ownerOf(match.homeId);
      const b = ownerOf(match.awayId);
      if (!a || !b || a.id === b.id) return false;
    }
    return true;
  });

  const groups = new Map<string, Match[]>();
  for (const match of filtered) {
    const key = dayKey(match.kickoff);
    groups.set(key, [...(groups.get(key) ?? []), match]);
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Every fixture</h2>
          <p className="lede">Pool games are locked in. Later rounds fill as you enter results — or stay as labelled ties.</p>
        </div>
      </div>
      <div className="filters" style={{ marginBottom: 16 }}>
        {(["all", "M", "W"] as const).map((g) => (
          <button key={g} className={`chip ${gender === g ? "active" : ""}`} onClick={() => setGender(g)}>
            {g === "all" ? "All" : g === "M" ? "Men" : "Women"}
          </button>
        ))}
        <button className={`chip ${mine ? "active" : ""}`} onClick={() => setMine((v) => !v)}>My teams</button>
        <button className={`chip ${clashes ? "active" : ""}`} onClick={() => setClashes((v) => !v)}>Family clashes</button>
      </div>
      {[...groups.entries()].map(([key, dayMatches]) => (
        <div key={key}>
          <div className="day-label">{formatDate(dayMatches[0].kickoff)}</div>
          <div className="stack">
            {dayMatches.map((match) => (
              <MatchCard key={match.id} match={match} score={state.scores[match.id]} notes={state.notes[match.id]} tips={state.predictions[match.id]} onOpen={() => onOpen(match.id)} onRefresh={onRefresh} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Rosters() {
  const max = Math.max(...members.map((m) => m.teamIds.reduce((sum, id) => sum + teamById[id].points, 0)));
  return (
    <>
      <div className="section-head">
        <div>
          <h2>The five houses</h2>
          <p className="lede">
            Rosters were balanced on current FIH rankings, then shuffled so almost nobody owns two sides in the same pool.
            Andrew and Hugo carry the leftover seventh team — weaker sides — so the quality still lands even.
          </p>
        </div>
      </div>
      <div className="grid-5">
        {members.map((member) => {
          const strength = member.teamIds.reduce((sum, id) => sum + teamById[id].points, 0);
          return (
            <div key={member.id} className="member-card card" style={{ "--member": member.color } as CSSProperties}>
              <p className="eyebrow">{member.role}</p>
              <h3>{member.emoji} {member.name}</h3>
              <p className="italic" style={{ fontSize: 14, margin: "8px 0 12px" }}>{member.tagline}</p>
              <div className="strength"><span style={{ width: `${(strength / max) * 100}%` }} /></div>
              <div style={{ fontSize: 12, opacity: 0.6, margin: "8px 0 12px" }}>Strength index {strength.toLocaleString()}</div>
              <div className="stack">
                {member.teamIds.map((id) => {
                  const team = teamById[id];
                  return (
                    <div className="team-chip" key={id}>
                      <Flag code={team.flag} alt={team.name} />
                      <div>
                        <strong>{team.short} {team.gender}</strong>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>WR {team.rank} · {team.best}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid-2" style={{ marginTop: 22 }}>
        {teams.map((team) => (
          <article key={team.id} className="card" style={{ padding: 16 }}>
            <div className="side">
              <Flag code={team.flag} alt={team.name} />
              <div>
                <h3>{team.name} {team.gender === "M" ? "Men" : "Women"}</h3>
                <div style={{ opacity: 0.65, fontSize: 13 }}>
                  Pool {team.pool} · World ranking {team.rank} · {ownerOf(team.id)?.name}
                </div>
              </div>
            </div>
            <p className="lede">{team.blurb}</p>
            <div className="stack" style={{ marginTop: 10 }}>
              {team.players.map((p) => (
                <div key={p.name}><strong>{p.name}</strong> · {p.role}<div style={{ opacity: 0.7, fontSize: 13 }}>{p.note}</div></div>
              ))}
              {team.facts.map((f) => <p key={f} className="italic" style={{ margin: 0, fontSize: 15 }}>{f}</p>)}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function Ladder({ board }: { board: ReturnType<typeof scoreboard> }) {
  return (
    <>
      <div className="section-head">
        <div>
          <h2>The family ladder</h2>
          <p className="lede">
            Half-time scores count as they land; full-time replaces them. Tips wait for the final whistle.
            {board.some((row) => row.provisional) ? " Some points are still provisional until full-time." : ""}
          </p>
        </div>
      </div>
      <div className="stack">
        {board.map((row, i) => {
          const member = members.find((m) => m.id === row.memberId)!;
          return (
            <div className="card leader" key={row.memberId} style={{ borderColor: member.color }}>
              <div className="rank-num">{i + 1}</div>
              <div style={{ flex: 1 }}>
                <h3>{member.emoji} {member.name}</h3>
                <div style={{ opacity: 0.7, fontSize: 13 }}>{row.lines.length} scoring events</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "Bebas Neue", fontSize: 48, lineHeight: 1 }}>{row.total}</div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>{row.teamPoints} / {row.predPoints} / {row.bonusPoints}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Clashes({ state, onOpen, onRefresh }: { state: AppState; onOpen: (id: string) => void; onRefresh: () => Promise<void> }) {
  const clashMatches = matches.filter((match) => {
    const a = ownerOf(match.homeId);
    const b = ownerOf(match.awayId);
    return a && b && a.id !== b.id;
  });
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Family clashes</h2>
          <p className="lede">When two houses meet, the winner banks a +2 sibling bonus. These are the nights that decide the kitchen table.</p>
        </div>
      </div>
      <div className="stack">
        {clashMatches.map((match) => (
          <MatchCard key={match.id} match={match} score={state.scores[match.id]} notes={state.notes[match.id]} tips={state.predictions[match.id]} onOpen={() => onOpen(match.id)} onRefresh={onRefresh} />
        ))}
      </div>
    </>
  );
}

function Pools({ scores }: { scores: Record<string, MatchScore> }) {
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Pool tables</h2>
          <p className="lede">Pool tables use full-time results only. Top two from each pool go to the second group stage; bottom two play classification.</p>
        </div>
      </div>
      {(["M", "W"] as const).map((gender) => (
        <div key={gender} style={{ marginBottom: 28 }}>
          <h3 style={{ marginBottom: 12 }}>{gender === "M" ? "Men" : "Women"}</h3>
          <div className="grid-2">
            {(["A", "B", "C", "D"] as const).map((pool) => {
              const rows = poolTable(gender, pool, scores);
              return (
                <div className="card" key={pool} style={{ padding: 12, overflow: "auto" }}>
                  <h3>Pool {pool}</h3>
                  <table className="table">
                    <thead>
                      <tr><th>Team</th><th>House</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const team = teamById[row.teamId];
                        return (
                          <tr key={row.teamId}>
                            <td><strong>{team.short}</strong></td>
                            <td>{ownerOf(team.id)?.name}</td>
                            <td>{row.played}</td>
                            <td>{row.won}</td>
                            <td>{row.drawn}</td>
                            <td>{row.lost}</td>
                            <td>{row.gf - row.ga}</td>
                            <td><strong>{row.pts}</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function Facts() {
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Tournament briefing</h2>
          <p className="lede">Enough to sound dangerous at dinner. The real gold is on each team card in Houses.</p>
        </div>
      </div>
      <div className="stack">
        {tournamentFacts.map((fact) => <div className="card fact" key={fact}>{fact}</div>)}
      </div>
      <h3 style={{ margin: "28px 0 12px" }}>How to watch</h3>
      <div className="stack">
        {watchTips.map((tip) => <div className="card" key={tip} style={{ padding: 16 }}>{tip}</div>)}
      </div>
      <div className="grid-2" style={{ marginTop: 22 }}>
        {Object.values(venues).map((venue) => (
          <div className="card" key={venue.id} style={{ padding: 18 }}>
            <p className="eyebrow">{venue.country}</p>
            <h3>{venue.name}</h3>
            <p className="lede">{venue.city} · {venue.capacity} · Pools {venue.id === "wagener" ? "A & D" : "B & C"} live here through the first week.</p>
          </div>
        ))}
      </div>
    </>
  );
}

function Rules({ cloud }: { cloud: CloudStatus }) {
  const [token, setToken] = useState(() => localStorage.getItem("family-cup-ledger-token") ?? "");
  return (
    <div className="grid-2">
      <div className="card" style={{ padding: 20 }}>
        <h2>How you score</h2>
        <ul className="lede">
          <li>Win 3 · draw 1 · plus 1 point per goal your team scores</li>
          <li>Clean sheet +2 · beat a higher-ranked side +2</li>
          <li>Family clash win +2 — the sibling tax</li>
          <li>Top of a pool +5 · second +4</li>
          <li>Semi-final appearance +8 · final +12 · champion +20 · bronze +6</li>
          <li>Everyone tips: exact score +3 · correct result +1 — scored at full-time</li>
          <li>Official FIH scores write themselves at half-time and full-time, and the ladder updates at the same moment</li>
        </ul>
        <p className="italic">Andrew and Hugo have seven teams because 32 does not divide by five. Their extras are the leftover lower-ranked sides, so the quality split stays honest.</p>
      </div>
      <div className="share card">
        <h3>Live kitchen</h3>
        <p className="lede">
          Official scores, tips and family notes live in the shared kitchen ledger. Open a match on
          any phone and everyone sees the same tips and thread. Status: {cloud === "live" ? "connected" : cloud === "saving" ? "saving" : "viewing"}.
        </p>
        <p className="italic">
          If saving ever fails on a new phone, paste the family ledger key once. Andrew can send it
          in the chat. Everyone else can ignore this box.
        </p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Family ledger key"
        />
        <button
          className="ghost"
          onClick={() => {
            localStorage.setItem("family-cup-ledger-token", token.trim());
            window.location.reload();
          }}
        >
          Save key on this phone
        </button>
      </div>
    </div>
  );
}

function MatchModal({
  match,
  state,
  onClose,
  onTip,
  onNote,
}: {
  match: Match;
  state: AppState;
  onClose: () => void;
  onTip: (home: number, away: number) => void | Promise<void>;
  onNote: (note: string) => void | Promise<void>;
}) {
  const home = teamById[match.homeId];
  const away = teamById[match.awayId];
  const existing = state.scores[match.id];
  const yourTip = state.predictions[match.id]?.find((p) => p.memberId === state.you);
  const familyNotes = Array.isArray(state.notes[match.id]) ? state.notes[match.id] : [];
  const [homeTip, setHomeTip] = useState(String(yourTip?.home ?? 0));
  const [awayTip, setAwayTip] = useState(String(yourTip?.away ?? 0));
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savingTip, setSavingTip] = useState(false);
  const matchTips = state.predictions[match.id] ?? [];
  const status = matchStatus(match.kickoff);
  const clash = home && away && ownerOf(home.id)?.id !== ownerOf(away.id)?.id;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">{match.gender === "M" ? "Men" : "Women"} · {venues[match.venue].name}</p>
            <h2>{match.label}</h2>
          </div>
          <button className="close-x" onClick={onClose} aria-label="Close match">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="lede">{formatDateTime(match.kickoff)}</p>
          <LocalNote iso={match.kickoff} />
          {match.note && <p className="italic">{match.note}</p>}
          {clash && <p className="badge clash" style={{ marginTop: 10 }}>Family clash</p>}

          <div className="modal-teams">
            <TeamMark team={home} big />
            <TeamMark team={away} big />
          </div>

          <OfficialScore match={match} score={existing} big />
          <WinnerCallout match={match} score={existing} />
          <TipCallout score={existing} tips={matchTips} />
          {existing?.status && <p className="lede">{existing.source === "fih" ? "Official FIH" : "Family"} · {existing.status}</p>}

          {home && away && (
            <>
              <div className="score-inputs">
                <input inputMode="numeric" value={homeTip} onChange={(e) => setHomeTip(e.target.value)} />
                <span className="vs">TIP</span>
                <input inputMode="numeric" value={awayTip} onChange={(e) => setAwayTip(e.target.value)} />
              </div>
              <div className="actions">
                <button
                  className="primary"
                  disabled={savingTip}
                  onClick={() => {
                    setSavingTip(true);
                    void Promise.resolve(onTip(Number(homeTip) || 0, Number(awayTip) || 0)).finally(() => setSavingTip(false));
                  }}
                >
                  {savingTip ? "Sharing…" : `Lock ${members.find((m) => m.id === state.you)?.name}'s tip`}
                </button>
              </div>
              <div className="family-tips">
                <p className="lede">Everyone's tips · scored at full-time</p>
                {members.map((member) => {
                  const tip = matchTips.find((item) => item.memberId === member.id);
                  const pts = tip && isFullTime(existing) ? predictionPoints(existing, tip) : null;
                  return (
                    <div className="family-tip" key={member.id}>
                      <strong>{member.emoji} {member.name}</strong>
                      <span>{tip ? `${tip.home}–${tip.away}` : "No tip yet"}</span>
                      {pts != null && <small>{pts === 3 ? "Exact +3" : pts === 1 ? "Result +1" : "Miss"}</small>}
                    </div>
                  );
                })}
              </div>
              {existing?.phase === "ht" && <p className="badge live">Half-time is on the ladder — full-time will replace it</p>}
              {existing?.phase === "live" && <p className="badge live">Live from FIH — family points lock at half-time and full-time</p>}
              {status === "live" && !existing && <p className="badge live">Inside the live window — official score lands at half-time</p>}
            </>
          )}

          {(home || away) && (
            <div className="card watch-box">
              <strong>Watch this</strong>
              <div className="watch-list">
                {(home?.players ?? []).map((player) => (
                  <p key={`h-${player.name}`}>
                    <b>{home?.name} — {player.name}</b>
                    <span>{player.role}. {player.note}</span>
                  </p>
                ))}
                {(away?.players ?? []).map((player) => (
                  <p key={`a-${player.name}`}>
                    <b>{away?.name} — {player.name}</b>
                    <span>{player.role}. {player.note}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {(home?.facts.length || away?.facts.length) ? (
            <div className="stack modal-facts">
              {home?.facts.map((item) => (
                <p key={item} className="team-fact">{home.short}: {item}</p>
              ))}
              {away?.facts.map((item) => (
                <p key={item} className="team-fact">{away.short}: {item}</p>
              ))}
            </div>
          ) : null}

          <div className="note-box">
            <h3>Family notes</h3>
            <p className="lede">Shared with every phone. Up to 100 notes stay on each match.</p>
            {familyNotes.length ? (
              <div className="family-notes">
                {familyNotes.map((item) => {
                  const author = members.find((member) => member.id === item.memberId);
                  return (
                    <div className="family-note" key={item.id}>
                      <strong>{author?.emoji} {author?.name ?? item.memberId}</strong>
                      <span>{new Date(item.at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
                      <p>{item.text}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="italic">Nothing on this match yet. Leave the first note.</p>
            )}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pub bets, who fell asleep, the drag-flick that ruined Hugo..." />
            <button
              className="primary"
              style={{ marginTop: 10 }}
              disabled={savingNote || !note.trim()}
              onClick={() => {
                const text = note.trim();
                if (!text) return;
                setSavingNote(true);
                void Promise.resolve(onNote(text)).finally(() => {
                  setNote("");
                  setSavingNote(false);
                });
              }}
            >
              {savingNote ? "Sharing…" : "Share with the family"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
