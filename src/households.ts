import type { Branch, FamilyData, Person } from "./model.ts";
import { deriveBranches, parentRoles } from "./kinship.ts";
import { selfGeneration } from "./generations.ts";

const familyMember = (p: Person) => p.kind !== "friend";
const byIdOrder = (a: Person, b: Person) => a.id.localeCompare(b.id);
const birth = (p: Person) =>
  p.birthday ||
  (p.birthdayParts?.year
    ? `${p.birthdayParts.year}-${p.birthdayParts.month || "99"}-${p.birthdayParts.day || "99"}`
    : "9999");
const byAge = (a: Person, b: Person) =>
  birth(a).localeCompare(birth(b)) || byIdOrder(a, b);

// Explicit partners always take precedence over pairing by shared children.
// The latter changes grouping only, without creating marriage records.
export function householdPairs(people: readonly Person[]) {
  const members = new Map(people.filter(familyMember).map((p) => [p.id, p]));
  const pairs = new Map<string, string>();
  const reserved = new Set<string>();
  const pair = (a: string, b: string) => {
    if (pairs.has(a) || pairs.has(b)) return;
    pairs.set(a, b);
    pairs.set(b, a);
  };
  const explicit = [...members.values()]
    .filter((p) => p.partnerId !== p.id && members.has(p.partnerId))
    .sort(
      (a, b) =>
        Number(members.get(b.partnerId)?.partnerId === b.id) -
          Number(members.get(a.partnerId)?.partnerId === a.id) ||
        byIdOrder(a, b),
    );
  for (const p of explicit) {
    reserved.add(p.id);
    reserved.add(p.partnerId);
    if (members.get(p.partnerId)!.generation === p.generation)
      pair(p.id, p.partnerId);
  }
  const shared = new Map<string, { ids: string[]; count: number }>();
  for (const child of members.values()) {
    const parents = [...new Set(child.parentIds)].map((id) => members.get(id));
    const [a, b] = parents;
    if (
      parents.length !== 2 ||
      !a ||
      !b ||
      a.generation !== b.generation ||
      a.generation >= child.generation ||
      reserved.has(a.id) ||
      reserved.has(b.id)
    )
      continue;
    const ids = [a.id, b.id].sort();
    const key = JSON.stringify(ids);
    const entry = shared.get(key) ?? { ids, count: 0 };
    entry.count++;
    shared.set(key, entry);
  }
  for (const [
    ,
    {
      ids: [a, b],
    },
  ] of [...shared].sort(
    ([a, left], [b, right]) => right.count - left.count || a.localeCompare(b),
  ))
    pair(a, b);
  return pairs;
}

export function automaticHouseholds(
  data: FamilyData,
  network = false,
): FamilyData {
  const members = data.people.filter(familyMember).sort(byIdOrder);
  const byId = new Map(members.map((p) => [p.id, p]));
  const pairs = householdPairs(members);
  const assignment = new Map<string, string>();
  const roots = new Map<string, Person[]>();
  const children = new Map<string, Person[]>();
  const groupId = (people: Person[]) =>
    `household:${JSON.stringify(people.map((p) => p.id).sort())}`;
  const addGroup = (root: Person[]) => {
    const key = groupId(root);
    roots.set(key, root);
    for (const p of root) assignment.set(p.id, key);
    return key;
  };
  for (const p of members)
    for (const id of p.parentIds) {
      if (!children.has(id)) children.set(id, []);
      children.get(id)!.push(p);
    }
  for (const p of members) {
    if (assignment.has(p.id)) continue;
    const partner = byId.get(pairs.get(p.id) ?? "");
    if (partner) addGroup([p, partner]);
    else if (children.has(p.id) || p.maritalStatus === "married") addGroup([p]);
  }
  function parentHousehold(p: Person) {
    const { father, mother } = parentRoles(p, members);
    return [...new Set([father, mother, ...p.parentIds.toSorted()])]
      .filter((id) => p.parentIds.includes(id))
      .map((id) => assignment.get(id))
      .find(Boolean);
  }
  for (const p of members) {
    const home = parentHousehold(p);
    if (!assignment.has(p.id) && home) assignment.set(p.id, home);
  }
  const siblings = new Map<string, Set<string>>();
  for (const p of members)
    for (const id of p.siblingIds ?? []) {
      if (
        byId.get(id)?.generation !== p.generation ||
        p.excludedSiblingIds?.includes(id) ||
        byId.get(id)?.excludedSiblingIds?.includes(p.id)
      )
        continue;
      if (!siblings.has(p.id)) siblings.set(p.id, new Set());
      if (!siblings.has(id)) siblings.set(id, new Set());
      siblings.get(p.id)!.add(id);
      siblings.get(id)!.add(p.id);
    }
  for (const p of members) {
    if (assignment.has(p.id)) continue;
    const group = new Set([p]);
    const parentalHomes = new Set<string>();
    for (const relative of group)
      for (const id of siblings.get(relative.id) ?? []) {
        const sibling = byId.get(id)!;
        if (!assignment.has(id)) group.add(sibling);
        else {
          const home = parentHousehold(sibling);
          if (home) parentalHomes.add(home);
        }
      }
    if (parentalHomes.size === 1) {
      for (const sibling of group)
        assignment.set(sibling.id, [...parentalHomes][0]);
    } else addGroup([...group]);
  }
  if (network) {
    // Process from younger to older: a great-grandparent follows only their
    // eldest child's final household as well. Never duplicate elder cards.
    const elderGeneration =
      (byId.get(data.selfId)?.generation ?? selfGeneration) - 2;
    for (const root of [...roots.values()].sort(
      (a, b) => b[0].generation - a[0].generation,
    )) {
      if (root[0].generation > elderGeneration) continue;
      const eldest = root
        .flatMap((p) => children.get(p.id) ?? [])
        .filter((p) => p.generation > root[0].generation)
        .sort(byAge)[0];
      const target = eldest && assignment.get(eldest.id);
      if (target) for (const p of root) assignment.set(p.id, target);
    }
  }
  const branches = deriveBranches(data);
  const oldFamilies = new Map(data.families.map((f) => [f.id, f]));
  const oldAnchors = new Map<string, Person>();
  for (const p of [...members].sort(
    (a, b) => a.generation - b.generation || byAge(a, b),
  ))
    if (!oldAnchors.has(p.familyId)) oldAnchors.set(p.familyId, p);
  const selfFamily = assignment.get(data.selfId);
  const families = new Map<string, FamilyData["families"][number]>();
  const people = data.people.map((p) => {
    const host = !familyMember(p) ? byId.get(p.friendOfId ?? "") : undefined;
    const fallback = !familyMember(p) ? oldAnchors.get(p.familyId) : undefined;
    const familyId =
      assignment.get(p.id) ??
      assignment.get((host ?? fallback)?.id ?? "") ??
      p.familyId;
    if (!families.has(familyId)) {
      const root = roots.get(familyId) ?? [];
      const sides = new Set(
        root.flatMap((m) => [...(branches.get(m.id) ?? [])]),
      );
      const branch: Branch =
        familyId === selfFamily
          ? "home"
          : sides.has("father") && !sides.has("mother")
            ? "father"
            : sides.has("mother") && !sides.has("father")
              ? "mother"
              : sides.has("home")
                ? "home"
                : root.length
                  ? "other"
                  : (oldFamilies.get(p.familyId)?.branch ?? "other");
      families.set(familyId, { id: familyId, name: "", branch });
    }
    return p.familyId === familyId ? p : { ...p, familyId };
  });
  return { ...data, people, families: [...families.values()] };
}
