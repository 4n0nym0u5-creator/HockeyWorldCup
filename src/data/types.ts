export type Gender = "M" | "W";
export type VenueId = "wagener" | "wavre";
export type Round =
  | "pool"
  | "second"
  | "classification"
  | "placement"
  | "semifinal"
  | "third"
  | "final";

export type MemberId = "andrew" | "nicole" | "georgia" | "emily" | "hugo";

export interface Team {
  id: string;
  name: string;
  short: string;
  flag: string;
  gender: Gender;
  pool: "A" | "B" | "C" | "D";
  rank: number;
  points: number;
  titles: number;
  best: string;
  color: string;
  color2: string;
  blurb: string;
  players: { name: string; role: string; note: string }[];
  facts: string[];
}

export interface FamilyMember {
  id: MemberId;
  name: string;
  role: string;
  color: string;
  color2: string;
  accent: string;
  emoji: string;
  tagline: string;
  teamIds: string[];
}

export interface Match {
  id: string;
  gender: Gender;
  kickoff: string;
  venue: VenueId;
  homeId: string;
  awayId: string;
  pool?: string;
  round: Round;
  label: string;
  note?: string;
}

export interface MatchScore {
  home: number;
  away: number;
  at?: number;
  by?: MemberId;
}

export interface Prediction {
  memberId: MemberId;
  home: number;
  away: number;
  at?: number;
}
