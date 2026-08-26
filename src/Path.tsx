import type { Gender, MatchScore } from "./data/types";
import { teamById } from "./data/teams";
import { ownerOf } from "./lib/owners";
import {
  crossoverFinished,
  crossoverTable,
  matchWinnerId,
} from "./lib/standings";
import { Flag } from "./ui";

const KEYS = {
  W: { sf1: "w47", sf2: "w48", final: "w50" },
  M: { sf1: "m47", sf2: "m48", final: "m50" },
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
  const sf1Winner = matchWinnerId(firstE ?? "tbd", secondF ?? "tbd", scores[keys.sf1]);
  const sf2Winner = matchWinnerId(firstF ?? "tbd", secondE ?? "tbd", scores[keys.sf2]);
  const champion = matchWinnerId(sf1Winner ?? "tbd", sf2Winner ?? "tbd", scores[keys.final]);

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
          <TeamChip teamId={firstE} tag="1st Pool E" />
          <span className="path-vs">vs</span>
          <TeamChip teamId={secondF} tag="2nd Pool F" />
        </div>
        <p className="path-sub" style={{ marginTop: 18 }}>1st F vs 2nd E</p>
        <div className="path-pair">
          <TeamChip teamId={firstF} tag="1st Pool F" />
          <span className="path-vs">vs</span>
          <TeamChip teamId={secondE} tag="2nd Pool E" />
        </div>
      </div>

      <div className="path-col path-knock">
        <p className="path-round">Final</p>
        <p className="path-sub">Semi winners</p>
        <div className="path-pair">
          <TeamChip teamId={sf1Winner} tag="Winner SF 1" />
          <span className="path-vs">vs</span>
          <TeamChip teamId={sf2Winner} tag="Winner SF 2" />
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
            Left to right: how Pools E and F finished, who they play in the semis, and who lifts the
            little gold trophy. Blanks stay blank until that round is decided. Classification for
            9th–16th is a different fight — this is only the road to the final.
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
