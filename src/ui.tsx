import { useState } from "react";
import { venues } from "./data/matches";
import { teamById } from "./data/teams";
import type { Match, MatchNote, MatchScore, Prediction, Team } from "./data/types";
import { phaseLabel } from "./lib/scorePhase";
import { ownerOf } from "./lib/owners";
import { countdown, formatDate, formatTime, matchStatus, venueZone } from "./lib/time";

export function Flag({ code, alt }: { code: string; alt: string }) {
  return <img className="flag" src={`https://flagcdn.com/w80/${code}.png`} alt={alt} />;
}

export function TeamMark({ team, big, fact }: { team?: Team; big?: boolean; fact?: boolean }) {
  if (!team) {
    return (
      <div className="side">
        <div className="flag" style={{ background: "#234" }} />
        <div>
          <strong>TBD</strong>
          <div className="italic" style={{ fontSize: 13 }}>Waiting on results</div>
        </div>
      </div>
    );
  }
  const owner = ownerOf(team.id);
  return (
    <div className="side">
      <Flag code={team.flag} alt={team.name} />
      <span className="owner-dot" style={{ background: owner?.color ?? "#888" }} title={owner?.name} />
      <div>
        <strong style={{ fontSize: big ? 20 : 15 }}>{team.name}</strong>
        <div style={{ fontSize: 12, opacity: 0.65 }}>
          {team.gender === "M" ? "Men" : "Women"} · WR {team.rank} · {owner?.name ?? "Unowned"}
        </div>
        {fact && (
          <p className="team-fact">
            {team.facts[0]}
            {team.players[0] && ` Watch ${team.players[0].name}: ${team.players[0].note}`}
          </p>
        )}
      </div>
    </div>
  );
}

export function MatchCard({
  match,
  score,
  notes,
  tips,
  timeZone,
  onOpen,
  onRefresh,
}: {
  match: Match;
  score?: MatchScore;
  notes?: MatchNote[];
  tips?: Prediction[];
  timeZone?: string;
  onOpen: () => void;
  onRefresh: () => Promise<void>;
}) {
  const home = teamById[match.homeId];
  const away = teamById[match.awayId];
  const venue = venues[match.venue];
  const status = matchStatus(match.kickoff);
  const homeOwner = home ? ownerOf(home.id) : null;
  const awayOwner = away ? ownerOf(away.id) : null;
  const clash = homeOwner && awayOwner && homeOwner.id !== awayOwner.id;
  const left = countdown(match.kickoff);
  const [refreshing, setRefreshing] = useState(false);
  const familyNotes = Array.isArray(notes) ? notes : [];
  const familyTips = Array.isArray(tips) ? tips : [];

  return (
    <div
      className="card match"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      style={{ width: "100%", textAlign: "left" }}
    >
      <div className="when">
        <div className="clock">{formatTime(match.kickoff, timeZone)}</div>
        <small>{formatDate(match.kickoff, timeZone)}</small>
        <small>{venue.short}</small>
      </div>
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span className="badge">{match.gender === "M" ? "Men" : "Women"}</span>
          <span className="badge">{match.label}</span>
          {score?.phase === "live" && <span className="badge live">Live</span>}
          {score?.phase === "ht" && <span className="badge live">Half time</span>}
          {status === "live" && !score && <span className="badge live">Live window</span>}
          {clash && <span className="badge clash">Family clash</span>}
          {familyTips.length ? <span className="badge">{familyTips.length} {familyTips.length === 1 ? "tip" : "tips"}</span> : null}
          {familyNotes.length ? <span className="badge">{familyNotes.length} {familyNotes.length === 1 ? "note" : "notes"}</span> : null}
          {left && status === "upcoming" && <span className="badge">{left}</span>}
          <button
            type="button"
            className="refresh-btn"
            disabled={refreshing}
            onClick={(event) => {
              event.stopPropagation();
              setRefreshing(true);
              void onRefresh().finally(() => setRefreshing(false));
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="sides">
          <TeamMark team={home} fact />
          <TeamMark team={away} fact />
        </div>
        {match.note && <p className="italic" style={{ margin: "10px 0 0", fontSize: 14 }}>{match.note}</p>}
        {familyNotes.length > 0 && (
          <div className="card-notes">
            {familyNotes.slice(-3).map((item) => (
              <p key={item.id}>{item.text}</p>
            ))}
          </div>
        )}
      </div>
      <div className="score-box">
        {score ? (
          <>
            {score.home}
            <div className="vs">{phaseLabel(score)}</div>
            {score.away}
            {score.phase !== "ht" && score.htHome != null && score.htAway != null && (
              <div className="ht-line">HT {score.htHome}–{score.htAway}</div>
            )}
          </>
        ) : (
          <div className="vs">VS</div>
        )}
      </div>
    </div>
  );
}

export function LocalNote({ iso }: { iso: string }) {
  return (
    <div style={{ fontSize: 13, opacity: 0.7 }}>
      Local pitch time {formatTime(iso, venueZone)} in Belgium / the Netherlands
    </div>
  );
}
