import { members } from "../data/members";
import type { FamilyMember, MemberId } from "../data/types";

const ownerMap = new Map<string, FamilyMember>();
for (const member of members) {
  for (const teamId of member.teamIds) ownerMap.set(teamId, member);
}

export function ownerOf(teamId: string) {
  return ownerMap.get(teamId) ?? null;
}

export function isOwnedBy(teamId: string, memberId: MemberId) {
  return ownerMap.get(teamId)?.id === memberId;
}
