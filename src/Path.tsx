import type { Gender, MatchScore } from "./data/types";
import { teamById } from "./data/teams";
import { ownerOf } from "./lib/owners";
import { isFullTime } from "./lib/scorePhase";
import {
  crossoverFinished,
  crossoverTable,
  matchLoserId,
  matchWinnerId,
} from "./lib/standings";
import { Flag } from "./ui";

const KEYS = {
  W: { sf1: "w47", sf2: "w48", third: "w49", final: "w50" },
  M: { sf1: "m47", sf2: "m48", third: "m49", final: "m50" },
} as const;

function TeamChip({
  teamId,
  tag,
  out,
  cup,
}: {
  teamId?: string | null;
  tag?: string;
  out?: boolean;
  cup?: boolean;
}) {
  const team = teamId ? teamById[teamId] : undefined;
  const owner = team ? ownerOf(team.id) : null;
  return (
    <div
      className={`path-chip${out ? " out" : ""}${cup ? " cup" : ""}${team ? "" : " empty"}`}
      style={owner && !out ? { borderColor: owner.color } : undefined}
    >
      {team ? (
        <>
          <Flag code={team.flag} alt={team.name} />
          <div>
            <strong>{team.short}</strong>
            <span>{owner ? `${owner.emoji} ${owner.name}` : tag}</span>
          </div>
        </>
      ) : (
        <div>
          <strong>{tag ?? "TBD"}</strong>
          <span>Still to be decided</span>
        </div>
      )}
    </div>
  );
}

function ScoreLine({ score }: { score?: MatchScore }) {
  if (!score || !isFullTime(score)) return null;
  return <span className="path-score">{score.home}–{score.away}</span>;
}

function GenderPath({
  gender,
  scores,
}: {
  gender: Gender;
  scores: Record<string, MatchScore>;
}) {
  const keys = KEYS[gender];
  const tableE = crossoverTable(gender, "E", scores);
  const tableF = crossoverTable(gender, "F", scores);
  const doneE = crossoverFinished(gender, "E", scores);
  const doneF = crossoverFinished(gender, "F", scores);
  const firstE = doneE ? tableE[0]?.teamId : null;
  const secondE = doneE ? tableE[1]?.teamId : null;
  const firstF = doneF ? tableF[0]?.teamId : null;
  const secondF = doneF ? tableF[1]?.teamId : null;
  const sf1Score = scores[keys.sf1];
  const sf2Score = scores[keys.sf2];
  const sf1Winner = matchWinnerId(firstE ?? "tbd", secondF ?? "tbd", sf1Score);
  const sf2Winner = matchWinnerId(firstF ?? "tbd", secondE ?? "tbd", sf2Score);
  const sf1Loser = matchLoserId(firstE ?? "tbd", secondF ?? "tbd", sf1Score);
  const sf2Loser = matchLoserId(firstF ?? "tbd", secondE ?? "tbd", sf2Score);
  const champion = matchWinnerId(sf1Winner ?? "tbd", sf2Winner ?? "tbd", scores[keys.final]);
  const bronze = matchWinnerId(sf1Loser ?? "tbd", sf2Loser ?? "tbd", scores[keys.third]);

  return (
    <div className="path-track">
      <div className="path-col">
        <p className="path-round">Second round</p>
        <p className="path-sub">Pool E · top two to the semis</p>
        {tableE.map((row, idx) => (
          <TeamChip key={row.teamId} teamId={row.teamId} out={doneE && idx > 1} tag={idx < 2 ? "Semi track" : "5th–8th"} />
        ))}
        <p className="path-sub" style={{ marginTop: 16 }}>Pool F · top two to the semis</p>
        {tableF.map((row, idx) => (
          <TeamChip key={row.teamId} teamId={row.teamId} out={doneF && idx > 1} tag={idx < 2 ? "Semi track" : "5th–8th"} />
        ))}
      </div>

      <div className="path-col path-knock">
        <p className="path-round">Semi-finals</p>
        <p className="path-sub">1st E vs 2nd F</p>
        <div className="path-pair">
          <TeamChip teamId={firstE} tag="1st Pool E" out={Boolean(sf1Winner && sf1Winner !== firstE)} />
          <span className="path-vs">vs <ScoreLine score={sf1Score} /></span>
          <TeamChip teamId={secondF} tag="2nd Pool F" out={Boolean(sf1Winner && sf1Winner !== secondF)} />
        </div>
        <p className="path-sub" style={{ marginTop: 18 }}>1st F vs 2nd E</p>
        <div className="path-pair">
          <TeamChip teamId={firstF} tag="1st Pool F" out={Boolean(sf2Winner && sf2Winner !== firstF)} />
          <span className="path-vs">vs <ScoreLine score={sf2Score} /></span>
          <TeamChip teamId={secondE} tag="2nd Pool E" out={Boolean(sf2Winner && sf2Winner !== secondE)} />
        </div>
      </div>

      <div className="path-col path-knock">
        <p className="path-round">Bronze</p>
        <p className="path-sub">Semi-final losers</p>
        <div className="path-pair">
          <TeamChip teamId={sf1Loser} tag="SF 1 loser" out={Boolean(bronze && bronze !== sf1Loser)} />
          <span className="path-vs">vs <ScoreLine score={scores[keys.third]} /></span>
          <TeamChip teamId={sf2Loser} tag="SF 2 loser" out={Boolean(bronze && bronze !== sf2Loser)} />
        </div>
        {bronze && (
          <>
            <p className="path-sub" style={{ marginTop: 12 }}>Bronze medallist</p>
            <TeamChip teamId={bronze} tag="3rd place" />
          </>
        )}
      </div>

      <div className="path-col path-knock">
        <p className="path-round">Final</p>
        <p className="path-sub">Semi winners</p>
        <div className="path-pair">
          <TeamChip teamId={sf1Winner} tag="Winner SF 1" out={Boolean(champion && champion !== sf1Winner)} />
          <span className="path-vs">vs <ScoreLine score={scores[keys.final]} /></span>
          <TeamChip teamId={sf2Winner} tag="Winner SF 2" out={Boolean(champion && champion !== sf2Winner)} />
        </div>
      </div>

      <div className="path-col path-cup">
        <p className="path-round">The cup</p>
        <p className="path-sub">Far right, where it belongs</p>
        <TeamChip teamId={champion} tag="World champion" cup />
      </div>
    </div>
  );
}

export function PathToCup({ scores }: { scores: Record<string, MatchScore> }) {
  return (
    <>
      <div className="section-head">
        <div>
          <h2>To the cup</h2>
          <p className="lede">
            Left to right: how Pools E and F finished, the semi-finals and bronze medal match,
            then the final and the champion. Scores appear as official full-time results land.
            Classification for 9th–16th is a different fight — this is only the road to the final.
          </p>
        </div>
      </div>
      <div className="path-block">
        <p className="eyebrow">Women</p>
        <GenderPath gender="W" scores={scores} />
      </div>
      <div className="path-block">
        <p className="eyebrow">Men</p>
        <GenderPath gender="M" scores={scores} />
      </div>
    </>
  );
}
