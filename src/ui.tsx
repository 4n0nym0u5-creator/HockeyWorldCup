import { venues } from "./data/matches";
import { teamById } from "./data/teams";
import type { Match, MatchScore, Team } from "./data/types";
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
  timeZone,
  onOpen,
}: {
  match: Match;
  score?: MatchScore;
  timeZone?: string;
  onOpen: () => void;
}) {
  const home = teamById[match.homeId];
  const away = teamById[match.awayId];
  const venue = venues[match.venue];
  const status = matchStatus(match.kickoff);
  const homeOwner = home ? ownerOf(home.id) : null;
  const awayOwner = away ? ownerOf(away.id) : null;
  const clash = homeOwner && awayOwner && homeOwner.id !== awayOwner.id;
  const left = countdown(match.kickoff);

  return (
    <button className="card match" onClick={onOpen} style={{ width: "100%", textAlign: "left" }}>
      <div className="when">
        <div className="clock">{formatTime(match.kickoff, timeZone)}</div>
        <small>{formatDate(match.kickoff, timeZone)}</small>
        <small>{venue.short}</small>
      </div>
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span className="badge">{match.gender === "M" ? "Men" : "Women"}</span>
          <span className="badge">{match.label}</span>
          {status === "live" && <span className="badge live">Live window</span>}
          {clash && <span className="badge clash">Family clash</span>}
          {left && status === "upcoming" && <span className="badge">{left}</span>}
        </div>
        <div className="sides">
          <TeamMark team={home} fact />
          <TeamMark team={away} fact />
        </div>
        {match.note && <p className="italic" style={{ margin: "10px 0 0", fontSize: 14 }}>{match.note}</p>}
      </div>
      <div className="score-box">
        {score ? (
          <>
            {score.home}
            <div className="vs">FT</div>
            {score.away}
          </>
        ) : (
          <div className="vs">{status === "upcoming" ? "VS" : "ENTER"}</div>
        )}
      </div>
    </button>
  );
}

export function LocalNote({ iso }: { iso: string }) {
  return (
    <div style={{ fontSize: 13, opacity: 0.7 }}>
      Local pitch time {formatTime(iso, venueZone)} in Belgium / the Netherlands
    </div>
  );
}
