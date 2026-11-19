import { checkGenerationSpan, selfGeneration } from "./generations.ts";
import type { Branch, FamilyData, Person } from "./model.ts";
import { siblingIdsFor } from "./familyRelations.ts";
import {
  completeKinship,
  explicitKinship,
  relationExclusions,
} from "./automaticKinship.ts";

type KinshipData = Pick<FamilyData, "people" | "families" | "selfId">;
const relative = (p: Person) => p.kind !== "friend";

// Explicit roles also work when a parent's gender has been left blank.
export function parentRoles(person: Person, people: readonly Person[]) {
  if (person.parentRoles)
    return {
      father: person.parentRoles.father ?? "",
      mother: person.parentRoles.mother ?? "",
    };
  const parents = person.parentIds
    .map((id) => people.find((p) => p.id === id))
    .filter((p) => p !== undefined);
  const father =
    parents.find(
      (p) => p.gender === "male" || /^(爸爸|父亲|爸)$/.test(p.relation),
    )?.id || "";
  const mother =
    parents.find(
      (p) =>
        p.id !== father &&
        (p.gender === "female" || /^(妈妈|母亲|妈)$/.test(p.relation)),
    )?.id || "";
  return { father, mother };
}

// Keep partner links reciprocal, including when replacing an existing partner.
export function upsertKinship(
  people: readonly Person[],
  person: Person,
  childIds?: readonly string[],
) {
  if (
    childIds?.some(
      (id) =>
        id === person.id || !people.some((p) => p.id === id && relative(p)),
    )
  )
    throw new Error("请为儿女选择已记录的家人，不能选择自己或朋友");
  const original = people;
  const previous = people.find((p) => p.id === person.id);
  const requestedSiblings = person.siblingIds ?? [];
  const requestedParents = person.parentIds;
  person = relationExclusions(
    relationExclusions(
      explicitKinship(person),
      "excludedParentIds",
      previous?.parentIds.filter((id) => !requestedParents.includes(id)) ?? [],
      requestedParents,
    ),
    "excludedSiblingIds",
    previous?.siblingIds?.filter((id) => !requestedSiblings.includes(id)) ?? [],
    requestedSiblings,
  );
  people = people.map(explicitKinship);
  const updated: Person[] = people
    .filter((p) => p.id !== person.id)
    .map((p) => {
      const before = original.find((other) => other.id === p.id)!;
      const selectedChild = relative(person) && childIds?.includes(p.id);
      const removeParent =
        !relative(person) || (childIds !== undefined && !selectedChild);
      const removedChild =
        childIds !== undefined &&
        !selectedChild &&
        before.parentIds.includes(person.id);
      const parentIds = removeParent
        ? (removedChild ? before.parentIds : p.parentIds).filter(
            (id) => id !== person.id,
          )
        : selectedChild
          ? [
              ...new Set([
                ...p.parentIds,
                ...(before.inferredParentIds?.includes(person.id)
                  ? []
                  : [person.id]),
              ]),
            ]
          : p.parentIds;
      if (parentIds.length > 2)
        throw new Error("这位儿女已有两位父母，请先调整已有的父母连接");
      let roles = removedChild ? before.parentRoles : p.parentRoles;
      if (removeParent && roles)
        roles = {
          father: roles.father === person.id ? "" : roles.father,
          mother: roles.mother === person.id ? "" : roles.mother,
        };
      if (selectedChild && parentIds.includes(person.id)) {
        const existing = parentRoles(p, people);
        if (person.gender === "male" && !existing.father)
          roles = { ...existing, father: person.id };
        else if (person.gender === "female" && !existing.mother)
          roles = { ...existing, mother: person.id };
      }
      const siblings = (p.siblingIds ?? []).filter((id) => id !== person.id);
      if (relative(person) && person.siblingIds?.includes(p.id))
        siblings.push(person.id);
      p = relationExclusions(
        p,
        "excludedSiblingIds",
        previous?.siblingIds?.includes(p.id) &&
          !requestedSiblings.includes(p.id)
          ? [person.id]
          : [],
        requestedSiblings.includes(p.id) ? [person.id] : [],
      );
      p = relationExclusions(
        p,
        "excludedParentIds",
        removedChild ? [person.id] : [],
        selectedChild ? [person.id] : [],
      );
      if (!relative(person))
        p = relationExclusions(
          relationExclusions(p, "excludedParentIds", [], [person.id]),
          "excludedSiblingIds",
          [],
          [person.id],
        );
      return {
        ...p,
        parentIds,
        ...(roles !== undefined ? { parentRoles: roles } : {}),
        ...(p.siblingIds !== undefined || siblings.length
          ? { siblingIds: siblings }
          : {}),
        partnerId:
          relative(person) && p.id === person.partnerId
            ? person.id
            : p.partnerId === person.id ||
                (person.partnerId && p.partnerId === person.partnerId)
              ? ""
              : p.partnerId,
        friendOfId:
          p.friendOfId === person.id && !relative(person) ? "" : p.friendOfId,
      };
    });
  // Editing must preserve the member's original position in lists and layouts.
  const index = people.findIndex((p) => p.id === person.id);
  updated.splice(index < 0 ? updated.length : index, 0, person);
  return completeKinship(updated);
}

export function synchronizeGenerations(
  people: readonly Person[],
  selfId: string,
  editedId: string,
) {
  const relatives = people.filter(relative);
  const links = new Map(
    relatives.map((p) => [p.id, [] as { id: string; step: number }[]]),
  );
  for (const p of relatives) {
    for (const id of p.parentIds) {
      links.get(p.id)!.push({ id, step: -1 });
      links.get(id)?.push({ id: p.id, step: 1 });
    }
    if (links.has(p.partnerId)) {
      links.get(p.id)!.push({ id: p.partnerId, step: 0 });
      links.get(p.partnerId)!.push({ id: p.id, step: 0 });
    }
    for (const id of p.siblingIds ?? []) {
      if (!links.has(id)) continue;
      links.get(p.id)!.push({ id, step: 0 });
      links.get(id)!.push({ id: p.id, step: 0 });
    }
  }
  if (!links.has(editedId)) return [...people];
  const offsets = new Map([[editedId, 0]]);
  const queue = [editedId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const link of links.get(id) ?? []) {
      const offset = offsets.get(id)! + link.step;
      if (offsets.has(link.id)) {
        if (offsets.get(link.id) !== offset)
          throw new Error(
            "亲属关系的辈分有冲突，请检查父母、伴侣、兄弟姐妹和儿女的连接",
          );
      } else {
        offsets.set(link.id, offset);
        queue.push(link.id);
      }
    }
  }
  const edited = relatives.find((p) => p.id === editedId)!;
  const anchor = offsets.has(selfId)
    ? relatives.find((p) => p.id === selfId)!
    : (relatives.find((p) => p.id === edited.partnerId) ??
      relatives.find((p) => p.id === edited.parentIds[0]) ??
      relatives.find((p) => p.id !== editedId && offsets.has(p.id)) ??
      edited);
  const base =
    (anchor.id === selfId ? selfGeneration : anchor.generation) -
    offsets.get(anchor.id)!;
  checkGenerationSpan(
    relatives.map((p) =>
      offsets.has(p.id) ? base + offsets.get(p.id)! : p.generation,
    ),
  );
  return people.map((p) =>
    offsets.has(p.id) ? { ...p, generation: base + offsets.get(p.id)! } : p,
  );
}

export function inferPlacement(
  data: KinshipData,
  draft: Person,
  childIds?: readonly string[],
  details = false,
) {
  if (!relative(draft))
    return { familyId: draft.familyId, generation: draft.generation };
  const people = synchronizeGenerations(
    upsertKinship(data.people, draft, childIds),
    data.selfId,
    draft.id,
  );
  const partner = data.people.find(
    (p) => p.id === draft.partnerId && relative(p),
  );
  const roles = parentRoles(draft, data.people);
  const parent = data.people.find(
    (p) =>
      p.id === (roles.father || roles.mother || draft.parentIds[0]) &&
      relative(p),
  );
  const hasChildren = people.some(
    (p) => relative(p) && p.parentIds.includes(draft.id),
  );
  const sibling = data.people.find(
    (p) => draft.siblingIds?.includes(p.id) && relative(p),
  );
  const child = !data.people.some((p) => p.id === draft.id)
    ? data.people.find((p) => childIds?.includes(p.id))
    : undefined;
  return {
    familyId:
      partner?.familyId ??
      (!hasChildren ? parent?.familyId : undefined) ??
      (!hasChildren ? sibling?.familyId : undefined) ??
      child?.familyId ??
      draft.familyId,
    generation: people.find((p) => p.id === draft.id)!.generation,
    ...(details ? { person: people.find((p) => p.id === draft.id)! } : {}),
  };
}

export function deriveBranches(data: KinshipData) {
  const members = data.people.filter(relative);
  const byId = new Map(members.map((p) => [p.id, p]));
  const result = new Map(data.people.map((p) => [p.id, new Set<Branch>()]));
  const self = byId.get(data.selfId);
  const children = new Map<string, string[]>();
  for (const p of members)
    for (const id of p.parentIds) {
      children.set(id, [...(children.get(id) ?? []), p.id]);
    }
  const home = new Set<string>();
  function descendants(
    id: string,
    target: Set<string>,
    blocked: Set<string>,
    siblings = false,
  ) {
    if (!byId.has(id) || target.has(id) || blocked.has(id)) return;
    target.add(id);
    for (const child of children.get(id) ?? [])
      descendants(child, target, blocked, siblings);
    if (siblings)
      for (const sibling of siblingIdsFor(byId.get(id)!, members))
        descendants(sibling, target, blocked, true);
  }
  if (self) {
    descendants(self.id, home, new Set());
    for (const id of [...home]) {
      const partnerId = byId.get(id)?.partnerId;
      if (partnerId) home.add(partnerId);
    }
    const roles = parentRoles(self, members);
    for (const [side, root, opposite] of [
      ["father", roles.father, roles.mother],
      ["mother", roles.mother, roles.father],
    ] as const) {
      if (!root) continue;
      const ancestors = new Set<string>();
      function ascend(id: string) {
        if (
          !byId.has(id) ||
          ancestors.has(id) ||
          home.has(id) ||
          id === opposite
        )
          return;
        ancestors.add(id);
        byId.get(id)!.parentIds.forEach(ascend);
      }
      ascend(root);
      const sideMembers = new Set<string>();
      const blocked = new Set([...home, opposite]);
      for (const id of ancestors) descendants(id, sideMembers, blocked, true);
      // In-laws join this side, but their ancestors do not leak into it.
      for (const id of [...sideMembers]) {
        const partnerId = byId.get(id)?.partnerId;
        if (partnerId && !blocked.has(partnerId)) sideMembers.add(partnerId);
      }
      for (const id of sideMembers) result.get(id)?.add(side);
    }
  }
  for (const p of members) {
    if (home.has(p.id)) result.get(p.id)!.add("home");
    if (!result.get(p.id)!.size)
      result
        .get(p.id)!
        .add(data.families.find((f) => f.id === p.familyId)?.branch ?? "other");
  }
  for (const p of data.people.filter((p) => !relative(p))) {
    const sides = result.get(p.id)!;
    const host = byId.get(p.friendOfId ?? "");
    for (const side of (host && result.get(host.id)) || []) sides.add(side);
    if (!sides.size) sides.add("other");
  }
  return result;
}
