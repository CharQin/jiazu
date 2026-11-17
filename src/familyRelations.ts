import type { Person } from "./model.ts";

export function siblingIdsFor(person: Person, people: readonly Person[]) {
  if (person.kind === "friend") return [];
  return people
    .filter(
      (p) =>
        p.id !== person.id &&
        p.kind !== "friend" &&
        !person.excludedSiblingIds?.includes(p.id) &&
        !p.excludedSiblingIds?.includes(person.id) &&
        ((person.siblingIds ?? []).includes(p.id) ||
          (p.siblingIds ?? []).includes(person.id) ||
          p.parentIds.some((id) => person.parentIds.includes(id))),
    )
    .map((p) => p.id);
}

export function siblingGroups(people: readonly Person[]) {
  const members = people.filter((p) => p.kind !== "friend");
  const adjacency = new Map(
    members.map((p) => [p.id, siblingIdsFor(p, members)]),
  );
  const visited = new Set<string>();
  const groups: { id: string; members: string[]; pairs: [string, string][] }[] =
    [];
  for (const person of members) {
    if (visited.has(person.id)) continue;
    const ids = [person.id];
    visited.add(person.id);
    for (let i = 0; i < ids.length; i++)
      for (const id of adjacency.get(ids[i]) ?? [])
        if (!visited.has(id)) {
          visited.add(id);
          ids.push(id);
        }
    if (ids.length < 2) continue;
    ids.sort();
    groups.push({
      id: ids.join("|"),
      members: ids,
      pairs: ids.flatMap((id) =>
        (adjacency.get(id) ?? [])
          .filter((other) => id < other)
          .map((other): [string, string] => [id, other]),
      ),
    });
  }
  return groups;
}
