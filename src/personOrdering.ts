import { householdPairs } from "./households.ts";
import type { Person } from "./model.ts";

export function applyPersonOrder(
  people: readonly Person[],
  ids: readonly string[],
) {
  const order = new Map(ids.map((id, index) => [id, index * 1024]));
  return people.map((p) =>
    order.has(p.id) ? { ...p, layoutOrder: order.get(p.id)! } : p,
  );
}

// Sorting changes positions only. Couples move together; crossing a household
// moves that generation's household block, keeping its boundary meaningful.
export function reorderPersonIds(
  people: readonly Person[],
  ids: readonly string[],
  movingId: string,
  targetId: string,
  after: boolean,
): string[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const moving = byId.get(movingId),
    target = byId.get(targetId);
  if (
    !moving ||
    !target ||
    moving.kind === "friend" ||
    target.kind === "friend" ||
    moving.generation !== target.generation
  )
    return [...ids];
  const row = ids.filter(
    (id) =>
      byId.get(id)?.generation === moving.generation &&
      byId.get(id)?.kind !== "friend",
  );
  const partner = householdPairs(people);
  if (
    row.includes(movingId) &&
    row.includes(targetId) &&
    partner.get(movingId) === targetId
  ) {
    const movingIndex = row.indexOf(movingId),
      targetIndex = row.indexOf(targetId);
    // Dragging a card across its partner reverses the two existing slots.
    if (after === movingIndex < targetIndex)
      [row[movingIndex], row[targetIndex]] = [
        row[targetIndex],
        row[movingIndex],
      ];
    return row;
  }
  const crossFamily = moving.familyId !== target.familyId;
  const unit = (p: Person) =>
    row.filter((id) => {
      const other = byId.get(id)!;
      if (!crossFamily) return id === p.id || partner.get(p.id) === id;
      return (
        other.familyId === p.familyId ||
        row.some((memberId) => {
          const member = byId.get(memberId)!;
          return member.familyId === p.familyId && partner.get(memberId) === id;
        })
      );
    });
  const from = unit(moving),
    to = unit(target);
  if (!from.length || to.some((id) => from.includes(id))) return row;
  const rest = row.filter((id) => !from.includes(id));
  const at = after
    ? Math.max(...to.map((id) => rest.indexOf(id))) + 1
    : Math.min(...to.map((id) => rest.indexOf(id)));
  rest.splice(at, 0, ...from);
  return rest;
}
