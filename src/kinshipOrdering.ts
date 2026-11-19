import type { FamilyData, Person } from "./model.ts";
import { deriveBranches, parentRoles } from "./kinship.ts";
import { siblingIdsFor } from "./familyRelations.ts";

export function kinshipOrdering(
  data: Pick<FamilyData, "people" | "families"> &
    Partial<Pick<FamilyData, "selfId">>,
) {
  const people = data.people
    .filter((p) => p.kind !== "friend")
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(people.map((p) => [p.id, p]));
  const siblingsById = new Map(
    people.map((p) => [p.id, siblingIdsFor(p, people)]),
  );
  const childrenById = new Map<string, Person[]>();
  for (const child of people)
    for (const id of child.parentIds) {
      if (!childrenById.has(id)) childrenById.set(id, []);
      childrenById.get(id)!.push(child);
    }
  const ranks = new Map<string, number>();
  const direct = new Set<string>();
  function ascend(id: string, rank: number, step: number) {
    const person = byId.get(id);
    if (!person || direct.has(id)) return;
    direct.add(id);
    ranks.set(id, rank);
    const roles = parentRoles(person, people);
    if (roles.father) ascend(roles.father, rank - step, step / 2);
    if (roles.mother) ascend(roles.mother, rank + step, step / 2);
    person.parentIds
      .filter((id) => id !== roles.father && id !== roles.mother)
      .forEach((id, i) => ascend(id, rank + (i ? step : -step), step / 2));
  }
  if (data.selfId) ascend(data.selfId, 0, 1);
  // A relative inherits the position of their blood branch; spouses stay beside it.
  for (let pass = 0; pass < people.length; pass++) {
    let changed = false;
    for (const p of people) {
      if (direct.has(p.id)) continue;
      const parents = p.parentIds.filter((id) => ranks.has(id));
      const sibling = siblingsById.get(p.id)?.find((id) => ranks.has(id));
      const next = parents.length
        ? parents.reduce((sum, id) => sum + ranks.get(id)!, 0) / parents.length
        : (ranks.get(p.partnerId) ??
          (sibling ? ranks.get(sibling) : undefined));
      if (next !== undefined && next !== ranks.get(p.id)) {
        ranks.set(p.id, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Newly recorded in-law ancestors also belong above their known descendants.
  // Only fill unanchored ranks: direct paternal/maternal branches stay stable.
  for (let pass = 0; pass < people.length; pass++) {
    let changed = false;
    for (const p of people) {
      if (ranks.has(p.id)) continue;
      const children = (childrenById.get(p.id) ?? []).filter((child) =>
        ranks.has(child.id),
      );
      const partner = ranks.get(p.partnerId);
      if (children.length || partner !== undefined) {
        ranks.set(
          p.id,
          children.length
            ? children.reduce((sum, c) => sum + ranks.get(c.id)!, 0) /
                children.length
            : partner!,
        );
        changed = true;
      }
    }
    if (!changed) break;
  }
  const branches = data.selfId
    ? deriveBranches({ ...data, selfId: data.selfId })
    : undefined;
  const baseRank = (p: Person) =>
    ranks.get(p.id) ??
    (branches?.get(p.id)?.has("father") ||
    data.families.find((f) => f.id === p.familyId)?.branch === "father"
      ? -2
      : branches?.get(p.id)?.has("mother") ||
          data.families.find((f) => f.id === p.familyId)?.branch === "mother"
        ? 2
        : 4);
  const birth = (p: Person) =>
    p.birthday ||
    (p.birthdayParts?.year ? `${p.birthdayParts.year}-12-31` : "9999");
  const siblingRanks = new Map<string, number>();
  const self = byId.get(data.selfId ?? "");
  const spouse = self && byId.get(self.partnerId);
  if (self && spouse) {
    const selfOnLeft =
      self.gender === "male" ||
      (spouse.gender !== "male" && self.gender !== "female");
    for (const id of siblingsById.get(self.id) ?? []) {
      siblingRanks.set(id, baseRank(self) + (selfOnLeft ? -0.2 : 0.2));
      const partner = byId.get(id)?.partnerId;
      if (partner) siblingRanks.set(partner, siblingRanks.get(id)!);
    }
  }
  const rank = (p: Person) =>
    siblingRanks.get(p.id) ??
    (p.id === spouse?.id && self ? baseRank(self) : baseRank(p));
  function automaticCompare(a: Person, b: Person) {
    return (
      rank(a) - rank(b) ||
      birth(a).localeCompare(birth(b)) ||
      a.id.localeCompare(b.id)
    );
  }
  const automatic = new Map<number, Person[]>();
  for (const p of [...people].sort(automaticCompare))
    automatic.set(p.generation, [...(automatic.get(p.generation) ?? []), p]);
  const manualRows = new Set(
    people.filter((p) => p.layoutOrder !== undefined).map((p) => p.generation),
  );
  const automaticIndex = new Map(
    [...automatic.values()].flatMap((row) =>
      row.map((p, i): [string, number] => [p.id, i * 1024]),
    ),
  );
  const insertedOrder = new Map<string, number>();
  for (const p of people) {
    if (p.layoutOrder !== undefined || !manualRows.has(p.generation)) continue;
    const anchors = people.filter(
      (m) => m.generation === p.generation && m.layoutOrder !== undefined,
    );
    const siblings = new Set(siblingsById.get(p.id));
    const kin = anchors.filter(
      (m) => siblings.has(m.id) || p.partnerId === m.id || m.partnerId === p.id,
    );
    const sameHome = anchors.filter((m) => m.familyId === p.familyId);
    // Manual indices are not automatic indices; an unmatched new relative must
    // still be placed beside the closest branch in the saved row.
    const nearestDistance = Math.min(
      ...anchors.map((m) => Math.abs(rank(m) - rank(p))),
    );
    const nearby = kin.length
      ? kin
      : sameHome.length
        ? sameHome
        : anchors.filter(
            (m) => Math.abs(rank(m) - rank(p)) === nearestDistance,
          );
    const sorted = nearby.toSorted(automaticCompare);
    const before = sorted.findLast((m) => automaticCompare(m, p) <= 0);
    const after = sorted.find((m) => automaticCompare(m, p) > 0);
    insertedOrder.set(
      p.id,
      before && after && before.layoutOrder! < after.layoutOrder!
        ? (before.layoutOrder! + after.layoutOrder!) / 2
        : before
          ? before.layoutOrder! + 0.5
          : after!.layoutOrder! - 0.5,
    );
  }
  const order = (p: Person) =>
    p.layoutOrder ?? insertedOrder.get(p.id) ?? automaticIndex.get(p.id) ?? 0;
  function compare(a: Person, b: Person) {
    return (
      (a.generation === b.generation && manualRows.has(a.generation)
        ? order(a) - order(b)
        : 0) || automaticCompare(a, b)
    );
  }
  function compareUnits(a: Person[], b: Person[]) {
    const score = (unit: Person[]) => {
      const manual = manualRows.has(unit[0].generation);
      const saved = manual
        ? unit.filter((p) => p.layoutOrder !== undefined)
        : [];
      const slots = saved.length ? saved : unit;
      return (
        slots.reduce((sum, p) => sum + (manual ? order(p) : rank(p)), 0) /
        slots.length
      );
    };
    return score(a) - score(b) || compare(a[0], b[0]);
  }
  function pair(a: Person, b: Person) {
    if (
      a.layoutOrder !== undefined &&
      b.layoutOrder !== undefined &&
      a.layoutOrder !== b.layoutOrder
    )
      return a.layoutOrder - b.layoutOrder;
    if (direct.has(a.id) && direct.has(b.id)) return compare(a, b);
    return (
      Number(b.gender === "male") - Number(a.gender === "male") ||
      Number(a.gender === "female") - Number(b.gender === "female") ||
      compare(a, b)
    );
  }
  return { rank, compare, pair, compareUnits, manualRows, order };
}
