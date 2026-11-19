import type { Person } from "./model.ts";
import {
  friendSpacing,
  partnerSpacing,
  personCardWidth,
} from "./mapGeometry.ts";

export function groupFriends(people: readonly Person[]) {
  const relatives = new Set(
    people.filter((p) => p.kind !== "friend").map((p) => p.id),
  );
  const byHost = new Map<string, Person[]>();
  const unassigned: Person[] = [];
  const friends = people.filter((p) => p.kind === "friend");
  for (const friend of friends) {
    const host = friend.friendOfId;
    if (!host || !relatives.has(host)) {
      unassigned.push(friend);
      continue;
    }
    const entries = byHost.get(host) ?? [];
    entries.push(friend);
    byHost.set(host, entries);
  }
  return { byHost, unassigned };
}

// Keep partners adjacent, with each host's friends on their outside edge.
export function mapCardUnit(
  members: Person[],
  byHost: ReadonlyMap<string, Person[]>,
) {
  const a = members[0],
    b = members[1];
  const first = byHost.get(a.id) ?? [];
  const last = b ? (byHost.get(b.id) ?? []) : [];
  const cards = b ? [...first.toReversed(), a, b, ...last] : [a, ...first];
  const width =
    personCardWidth +
    (b ? partnerSpacing : 0) +
    (first.length + last.length) * friendSpacing;
  return {
    width,
    slots: cards.map((p, i) => {
      const position =
        i * friendSpacing +
        (b && i > first.length ? partnerSpacing - friendSpacing : 0);
      return {
        id: p.id,
        familyId: p.familyId,
        friend: p.kind === "friend",
        offset: position - (width - personCardWidth) / 2,
      };
    }),
  };
}
