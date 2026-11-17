import type { Person } from "./model.ts";

// Inferred edges stay separate from user choices, so changing a source relation
// removes its old consequences instead of turning guesses into permanent data.
export function explicitKinship(person: Person): Person {
  const { inferredParentIds = [], inferredSiblingIds = [], ...rest } = person;
  return {
    ...rest,
    parentIds: person.parentIds.filter((id) => !inferredParentIds.includes(id)),
    ...(person.siblingIds !== undefined
      ? {
          siblingIds: person.siblingIds.filter(
            (id) => !inferredSiblingIds.includes(id),
          ),
        }
      : {}),
    ...(person.parentRoles
      ? {
          parentRoles: {
            ...person.parentRoles,
            ...(inferredParentIds.includes(person.parentRoles.father ?? "")
              ? { father: "" }
              : {}),
            ...(inferredParentIds.includes(person.parentRoles.mother ?? "")
              ? { mother: "" }
              : {}),
          },
        }
      : {}),
  };
}

export function relationExclusions(
  person: Person,
  field: "excludedParentIds" | "excludedSiblingIds",
  removed: readonly string[],
  selected: readonly string[],
): Person {
  const ids = [...new Set([...(person[field] ?? []), ...removed])].filter(
    (id) => !selected.includes(id),
  );
  return ids.length || person[field] !== undefined
    ? { ...person, [field]: ids }
    : person;
}

export function completeKinship(input: readonly Person[]): Person[] {
  const people = input.map(explicitKinship);
  const byId = new Map(
    people.filter((p) => p.kind !== "friend").map((p) => [p.id, p]),
  );
  const inferredParents = new Map<string, string[]>();
  const inferredSiblings = new Map<string, string[]>();
  function blockedSibling(a: Person, b: Person) {
    return (
      a.excludedSiblingIds?.includes(b.id) ||
      b.excludedSiblingIds?.includes(a.id)
    );
  }
  function addSibling(a: Person, b: Person) {
    if (
      a.id === b.id ||
      blockedSibling(a, b) ||
      a.partnerId === b.id ||
      b.partnerId === a.id ||
      a.parentIds.includes(b.id) ||
      b.parentIds.includes(a.id)
    )
      return;
    for (const [left, right] of [
      [a, b],
      [b, a],
    ]) {
      if (left.siblingIds?.includes(right.id)) continue;
      left.siblingIds = [...(left.siblingIds ?? []), right.id];
      inferredSiblings.set(left.id, [
        ...(inferredSiblings.get(left.id) ?? []),
        right.id,
      ]);
    }
  }
  // Check graph offsets before adding a parent. This also rejects ancestors,
  // descendants and same-generation relatives even when their rows are stale.
  function compatibleParent(child: Person, parent: Person) {
    if (
      child.id === parent.id ||
      child.parentIds.length >= 2 ||
      child.excludedParentIds?.includes(parent.id)
    )
      return false;
    const offsets = new Map([[child.id, 0]]),
      queue = [child.id];
    for (let i = 0; i < queue.length; i++) {
      const p = byId.get(queue[i])!;
      const links: [string, number][] = [
        ...p.parentIds.map((id): [string, number] => [id, -1]),
        ...[...byId.values()]
          .filter((c) => c.parentIds.includes(p.id))
          .map((c): [string, number] => [c.id, 1]),
        ...[p.partnerId, ...(p.siblingIds ?? [])].map(
          (id): [string, number] => [id, 0],
        ),
      ];
      for (const [id, step] of links) {
        if (!byId.has(id) || offsets.has(id)) continue;
        offsets.set(id, offsets.get(p.id)! + step);
        queue.push(id);
      }
    }
    return !offsets.has(parent.id) || offsets.get(parent.id) === -1;
  }
  function addParent(child: Person, id: string, role?: "father" | "mother") {
    const parent = byId.get(id);
    if (
      !parent ||
      child.parentIds.includes(id) ||
      !compatibleParent(child, parent)
    )
      return false;
    child.parentIds = [...child.parentIds, id];
    inferredParents.set(child.id, [
      ...(inferredParents.get(child.id) ?? []),
      id,
    ]);
    const slot =
      role ??
      (parent.gender === "male"
        ? "father"
        : parent.gender === "female"
          ? "mother"
          : undefined);
    const roles = { ...child.parentRoles };
    if (slot && !roles[slot]) roles[slot] = id;
    for (const parentId of child.parentIds) {
      const gender = byId.get(parentId)?.gender;
      if (gender === "male" && !roles.father && roles.mother !== parentId)
        roles.father = parentId;
      if (gender === "female" && !roles.mother && roles.father !== parentId)
        roles.mother = parentId;
    }
    if (child.parentIds.length === 2) {
      if (roles.father && !roles.mother)
        roles.mother = child.parentIds.find((id) => id !== roles.father);
      if (roles.mother && !roles.father)
        roles.father = child.parentIds.find((id) => id !== roles.mother);
    }
    if (Object.keys(roles).length) child.parentRoles = roles;
    return true;
  }
  // Only explicit sibling links imply full siblings. Sharing one parent alone
  // must never spread the unrelated parent's family through half siblings.
  const components: Person[][] = [],
    visited = new Set<string>();
  for (const start of byId.values()) {
    if (visited.has(start.id)) continue;
    const group = [start];
    visited.add(start.id);
    for (let i = 0; i < group.length; i++) {
      const p = group[i];
      for (const other of byId.values()) {
        if (
          visited.has(other.id) ||
          blockedSibling(p, other) ||
          !(
            p.siblingIds?.includes(other.id) || other.siblingIds?.includes(p.id)
          )
        )
          continue;
        visited.add(other.id);
        group.push(other);
      }
    }
    if (group.length > 1) components.push(group);
  }
  for (let pass = 0; pass <= people.length; pass++) {
    let changed = false;
    for (const group of components) {
      const parents = [...new Set(group.flatMap((p) => p.parentIds))];
      const fathers = new Set(
        group.map((p) => p.parentRoles?.father).filter(Boolean),
      );
      const mothers = new Set(
        group.map((p) => p.parentRoles?.mother).filter(Boolean),
      );
      if (
        parents.length > 2 ||
        fathers.size > 1 ||
        mothers.size > 1 ||
        [...fathers].some((id) => mothers.has(id))
      )
        continue;
      for (const p of group) {
        for (const other of group) addSibling(p, other);
        for (const id of parents) {
          const role = fathers.has(id)
            ? "father"
            : mothers.has(id)
              ? "mother"
              : undefined;
          changed = addParent(p, id, role) || changed;
        }
      }
    }
    for (const child of byId.values()) {
      if (child.parentIds.length !== 1) continue;
      const parent = byId.get(child.parentIds[0])!;
      const partner = byId.get(parent?.partnerId);
      if (!partner || (partner.partnerId && partner.partnerId !== parent.id))
        continue;
      const role =
        child.parentRoles?.father === parent.id
          ? "mother"
          : child.parentRoles?.mother === parent.id
            ? "father"
            : parent.gender === "male"
              ? "mother"
              : parent.gender === "female"
                ? "father"
                : undefined;
      changed = addParent(child, partner.id, role) || changed;
    }
    if (!changed) break;
  }
  const children = new Map<string, Person[]>();
  for (const p of byId.values())
    for (const id of p.parentIds)
      children.set(id, [...(children.get(id) ?? []), p]);
  for (const group of children.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) addSibling(group[i], group[j]);
  return people.map((p) => ({
    ...p,
    ...(inferredParents.has(p.id)
      ? { inferredParentIds: inferredParents.get(p.id) }
      : {}),
    ...(inferredSiblings.has(p.id)
      ? { inferredSiblingIds: inferredSiblings.get(p.id) }
      : {}),
  }));
}
