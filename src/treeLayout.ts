import type { FamilyData, Person } from "./model";
import { isFriend, familyName } from "./model.ts";
import { kinshipOrdering } from "./kinshipOrdering.ts";
import {
  friendSpacing,
  generationSpacing,
  householdHeight,
  partnerSpacing,
  personCardWidth,
  relativeSpacing,
} from "./mapGeometry.ts";

const halfW = personCardWidth / 2;
export interface GenerationRow {
  generation: number;
  y: number;
  count: number;
}
interface Unit {
  people: Person[];
  slots: { id: string; familyId: string; offset: number; friend: boolean }[];
  x: number;
  width: number;
}

// Pool neighbouring conflicts to share displacement on both sides, rather than
// pushing every new card to the right. This is a least-squares spacing projection.
function place(row: Unit[], targets: number[]) {
  const offsets: number[] = [];
  row.forEach((unit, i) => {
    offsets[i] = i
      ? offsets[i - 1] +
        (row[i - 1].width + unit.width) / 2 +
        relativeSpacing -
        personCardWidth
      : 0;
  });
  const pools: { start: number; end: number; sum: number; count: number }[] =
    [];
  targets.forEach((target, i) => {
    pools.push({ start: i, end: i, sum: target - offsets[i], count: 1 });
    while (pools.length > 1) {
      const a = pools.at(-2)!,
        b = pools.at(-1)!;
      if (a.sum / a.count <= b.sum / b.count) break;
      pools.splice(-2, 2, {
        start: a.start,
        end: b.end,
        sum: a.sum + b.sum,
        count: a.count + b.count,
      });
    }
  });
  pools.forEach((pool) => {
    for (let i = pool.start; i <= pool.end; i++)
      row[i].x = pool.sum / pool.count + offsets[i];
  });
}

// Couples remain adjacent across household IDs. Household frames follow the
// resulting branches, rather than constraining a large family to one rigid block.
export function makeGenerationLayout(
  data: Pick<FamilyData, "people" | "families"> &
    Partial<Pick<FamilyData, "selfId">>,
) {
  const relatives = data.people.filter((p) => !isFriend(p));
  const ordering = kinshipOrdering(data);
  const friendGenerations = new Map(
    data.families
      .filter((f) =>
        data.people.some((p) => isFriend(p) && p.familyId === f.id),
      )
      .map((f) => [
        f.id,
        Math.min(
          ...relatives
            .filter((p) => p.familyId === f.id)
            .map((p) => p.generation),
          4,
        ),
      ]),
  );
  for (const [id] of friendGenerations)
    if (!relatives.some((p) => p.familyId === id)) friendGenerations.set(id, 2);
  const first = Math.min(
    ...relatives.map((p) => p.generation),
    ...friendGenerations.values(),
  );
  const last = Math.max(
    ...relatives.map((p) => p.generation),
    ...friendGenerations.values(),
  );
  const generations: GenerationRow[] = [];
  const rows: Unit[][] = [];
  const owners = new Map<string, { unit: Unit; offset: number }>();
  // A number of records only connect a child to both parents and leave the
  // parents' partnerId fields blank. Treat the strongest shared-parent pair
  // as one layout unit so adding children expands their row instead of pulling
  // the two parents apart. This is a presentation fallback only; it does not
  // create or display a partner relationship by itself.
  const peopleById = new Map(relatives.map((p) => [p.id, p]));
  const hasExplicitPartnerLink = (person: Person) =>
    Boolean(
      person.partnerId &&
        (peopleById.has(person.partnerId) ||
          relatives.some((p) => p.partnerId === person.id)),
    );
  const sharedParentCounts = new Map<
    string,
    { left: string; right: string; count: number }
  >();
  for (const child of relatives) {
    const parentIds = [...new Set(child.parentIds)].filter((id) => {
      const parent = peopleById.get(id);
      return Boolean(parent && parent.generation !== child.generation);
    });
    for (let i = 0; i < parentIds.length; i++) {
      for (let j = i + 1; j < parentIds.length; j++) {
        const left = peopleById.get(parentIds[i])!;
        const right = peopleById.get(parentIds[j])!;
        if (left.generation !== right.generation) continue;
        const [a, b] = [left.id, right.id].sort();
        const key = `${a}\u0000${b}`;
        const edge = sharedParentCounts.get(key) ?? {
          left: a,
          right: b,
          count: 0,
        };
        edge.count++;
        sharedParentCounts.set(key, edge);
      }
    }
  }
  const fallbackPartners = new Map<string, string>();
  const fallbackReserved = new Set<string>();
  [...sharedParentCounts.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.left.localeCompare(b.left) ||
        a.right.localeCompare(b.right),
    )
    .forEach(({ left, right }) => {
      if (
        fallbackReserved.has(left) ||
        fallbackReserved.has(right) ||
        hasExplicitPartnerLink(peopleById.get(left)!) ||
        hasExplicitPartnerLink(peopleById.get(right)!)
      )
        return;
      fallbackPartners.set(left, right);
      fallbackPartners.set(right, left);
      fallbackReserved.add(left);
      fallbackReserved.add(right);
    });
  for (let generation = first; generation <= last; generation++) {
    const people = relatives
      .filter((p) => p.generation === generation)
      .sort(ordering.compare);
    const placed = new Set<string>();
    const row: Unit[] = [];
    for (const p of people) {
      if (placed.has(p.id)) continue;
      const partner = people.find(
        (m) =>
          !placed.has(m.id) &&
          m.id !== p.id &&
          (m.id === p.partnerId || m.partnerId === p.id),
      ) ??
        people.find(
          (m) =>
            !placed.has(m.id) &&
            m.id === fallbackPartners.get(p.id) &&
            !hasExplicitPartnerLink(p) &&
            !hasExplicitPartnerLink(m),
        );
      const members = partner ? [p, partner].sort(ordering.pair) : [p];
      members.forEach((m) => placed.add(m.id));
      row.push({
        people: members,
        x: 0,
        width: personCardWidth + (partner ? partnerSpacing : 0),
        slots: members.map((m, i) => ({
          id: m.id,
          familyId: m.familyId,
          friend: false,
          offset: partner ? (i - 0.5) * partnerSpacing : 0,
        })),
      });
    }
    row.sort((a, b) => ordering.compareUnits(a.people, b.people));
    for (const [familyId, friendGeneration] of friendGenerations) {
      if (friendGeneration !== generation) continue;
      const owner = row.findLast((u) =>
        u.people.some((p) => p.familyId === familyId),
      );
      if (owner) {
        owner.slots.forEach((s) => {
          s.offset -= friendSpacing / 2;
        });
        owner.slots.push({
          id: familyId,
          familyId,
          friend: true,
          offset: owner.width / 2 - halfW + friendSpacing / 2,
        });
        owner.width += friendSpacing;
      } else
        row.push({
          people: [],
          slots: [{ id: familyId, familyId, friend: true, offset: 0 }],
          x: 0,
          width: personCardWidth,
        });
    }
    const total = row.reduce(
      (sum, u) => sum + u.width + relativeSpacing - personCardWidth,
      -(relativeSpacing - personCardWidth),
    );
    let left = -total / 2;
    for (const u of row) {
      u.x = left + u.width / 2;
      left += u.width + relativeSpacing - personCardWidth;
      u.slots
        .filter((s) => !s.friend)
        .forEach((s) => owners.set(s.id, { unit: u, offset: s.offset }));
    }
    generations.push({
      generation,
      y: 88 + rows.length * generationSpacing,
      count: people.length,
    });
    rows.push(row);
  }
  const x = (id: string) => {
    const owner = owners.get(id);
    return owner ? owner.unit.x + owner.offset : undefined;
  };
  const center = (values: number[]) =>
    (Math.min(...values) + Math.max(...values)) / 2;
  const average = (values: number[]) =>
    values.reduce((sum, n) => sum + n, 0) / values.length;
  const bundles = new Map<string, { parents: string[]; children: string[] }>();
  const hasChildren = new Set(relatives.flatMap((p) => p.parentIds));
  for (const p of relatives) {
    const parents = p.parentIds.filter((id) => owners.has(id)).sort();
    if (!parents.length) continue;
    const key = JSON.stringify(parents);
    const bundle = bundles.get(key) ?? { parents, children: [] };
    bundle.children.push(p.id);
    bundles.set(key, bundle);
  }
  function parentTarget(u: Unit, offsets: boolean) {
    const values = u.people.flatMap((p) => {
      const points = p.parentIds.map(x).filter((v) => v !== undefined);
      return points.length
        ? [center(points) - (offsets ? owners.get(p.id)!.offset : 0)]
        : [];
    });
    if (values.length) return average(values);
    // A record without kinship links still belongs near its selected household,
    // rather than drifting to the far right until its relationships are filled.
    if (u.people.some((p) => hasChildren.has(p.id))) return undefined;
    const familyIds = new Set(u.people.map((p) => p.familyId));
    const relativesInFamily = relatives.filter(
      (p) => familyIds.has(p.familyId) && owners.get(p.id)?.unit !== u,
    );
    if (!relativesInFamily.length || !u.people.length) return undefined;
    const generation = u.people[0].generation;
    const distance = Math.min(
      ...relativesInFamily.map((p) => Math.abs(p.generation - generation)),
    );
    const points = relativesInFamily
      .filter((p) => Math.abs(p.generation - generation) === distance)
      .map((p) => x(p.id)!);
    return center(points);
  }
  // Alternate alignment of descendants and ancestors. Each parent pair centres
  // over its own children, including separate branches inside a single household.
  for (let pass = 0; pass < 32; pass++) {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!ordering.manualRows.has(generations[i].generation)) {
        const targets = new Map(
          row.map((u) => [u, parentTarget(u, false) ?? u.x]),
        );
        row.sort(
          (a, b) =>
            targets.get(a)! - targets.get(b)! ||
            (a.people.length && b.people.length
              ? ordering.compareUnits(a.people, b.people)
              : 0),
        );
      }
      place(
        row,
        row.map((u) => parentTarget(u, true) ?? u.x),
      );
    }
    for (let i = rows.length - 2; i >= 0; i--) {
      const row = rows[i];
      const targets = new Map<Unit, number[]>();
      for (const bundle of bundles.values()) {
        const children = bundle.children.map(x).filter((v) => v !== undefined);
        if (!children.length) continue;
        const parents = bundle.parents.map((id) => owners.get(id)!);
        const parentCenter = center(bundle.parents.map((id) => x(id)!));
        for (const u of new Set(parents.map((p) => p.unit))) {
          if (!row.includes(u)) continue;
          targets.set(u, [
            ...(targets.get(u) ?? []),
            center(children) - (parentCenter - u.x),
          ]);
        }
      }
      place(
        row,
        row.map((u) => (targets.has(u) ? average(targets.get(u)!) : u.x)),
      );
    }
  }
  const nodes = new Map<string, { x: number; y: number }>();
  const friendGroups = new Map<string, { x: number; y: number }>();
  rows.forEach((row, i) =>
    row.forEach((u) =>
      u.slots.forEach((s) => {
        (s.friend ? friendGroups : nodes).set(s.id, {
          x: u.x + s.offset,
          y: generations[i].y,
        });
      }),
    ),
  );
  const positions = [...nodes.values(), ...friendGroups.values()];
  const left = Math.min(...positions.map((p) => p.x - halfW));
  const right = Math.max(...positions.map((p) => p.x + halfW));
  const width = Math.max(500, right - left + 80);
  const offset = (width - (right - left)) / 2 - left;
  positions.forEach((p) => {
    p.x += offset;
  });
  const seen = new Set<string>();
  const groups = rows.flatMap((row, i) => {
    const runs: { familyId: string; points: number[] }[] = [];
    row
      .flatMap((u) =>
        u.slots.map((s) => ({ ...s, x: u.x + s.offset + offset })),
      )
      .sort((a, b) => a.x - b.x)
      .forEach((s) => {
        if (runs.at(-1)?.familyId === s.familyId) runs.at(-1)!.points.push(s.x);
        else runs.push({ familyId: s.familyId, points: [s.x] });
      });
    return runs.flatMap((run, j) => {
      const family = data.families.find((f) => f.id === run.familyId);
      if (!family) return [];
      const friendAnchor = !seen.has(family.id);
      seen.add(family.id);
      return [
        {
          id: `${generations[i].generation}-${family.id}-${j}`,
          familyId: family.id,
          friendAnchor,
          name: familyName(family, data.people),
          branch: family.branch,
          x: center(run.points),
          y: generations[i].y + 12,
          width:
            Math.max(...run.points) -
            Math.min(...run.points) +
            personCardWidth +
            20,
          height: householdHeight,
        },
      ];
    });
  });
  return {
    nodes,
    friendGroups,
    groups,
    generations,
    width,
    height: (generations.at(-1)?.y ?? 88) + householdHeight / 2 + 20,
  };
}
