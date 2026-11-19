import { groupFriends, mapCardUnit } from "./mapFriends.ts";
import { householdPairs } from "./households.ts";
import { selfGeneration } from "./generations.ts";
import type { FamilyData, Person } from "./model";
import { isFriend, familyName } from "./model.ts";
import { siblingGroups } from "./familyRelations.ts";
import { kinshipOrdering } from "./kinshipOrdering.ts";
import {
  generationSpacing,
  householdHeight,
  personCardWidth,
  relativeSpacing,
} from "./mapGeometry.ts";

const canvasPadding = 40;
const initialSlots = 10;
const initialInnerWidth =
  personCardWidth + (initialSlots - 1) * relativeSpacing;
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
function place(row: Unit[], targets: number[], anchored?: boolean[]) {
  const offsets: number[] = [];
  row.forEach((unit, i) => {
    offsets[i] = i
      ? offsets[i - 1] +
        (row[i - 1].width + unit.width) / 2 +
        relativeSpacing -
        personCardWidth
      : 0;
  });
  const pools: {
    start: number;
    end: number;
    sum: number;
    count: number;
    anchorSum: number;
    anchorCount: number;
  }[] = [];
  const mean = (pool: (typeof pools)[number]) =>
    pool.anchorCount
      ? pool.anchorSum / pool.anchorCount
      : pool.sum / pool.count;
  targets.forEach((target, i) => {
    const value = target - offsets[i];
    const anchor = anchored?.[i] ?? true;
    pools.push({
      start: i,
      end: i,
      sum: value,
      count: 1,
      anchorSum: anchor ? value : 0,
      anchorCount: anchor ? 1 : 0,
    });
    while (pools.length > 1) {
      const a = pools.at(-2)!,
        b = pools.at(-1)!;
      if (mean(a) <= mean(b)) break;
      pools.splice(-2, 2, {
        start: a.start,
        end: b.end,
        sum: a.sum + b.sum,
        count: a.count + b.count,
        anchorSum: a.anchorSum + b.anchorSum,
        anchorCount: a.anchorCount + b.anchorCount,
      });
    }
  });
  pools.forEach((pool) => {
    for (let i = pool.start; i <= pool.end; i++)
      row[i].x = mean(pool) + offsets[i];
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
  const { byHost, unassigned } = groupFriends(data.people);
  const referenceGeneration =
    relatives.find((p) => p.id === data.selfId)?.generation ?? selfGeneration;
  const layers = relatives.map((p) => p.generation);
  if (unassigned.length) layers.push(referenceGeneration);
  const first = Math.min(...layers);
  const last = Math.max(...layers);
  const generations: GenerationRow[] = [];
  const rows: Unit[][] = [];
  const owners = new Map<string, { unit: Unit; offset: number }>();
  const partners = householdPairs(relatives);
  for (let generation = first; generation <= last; generation++) {
    const people = relatives
      .filter((p) => p.generation === generation)
      .sort(ordering.compare);
    const placed = new Set<string>();
    const row: Unit[] = [];
    for (const p of people) {
      if (placed.has(p.id)) continue;
      const partner = people.find(
        (m) => !placed.has(m.id) && m.id === partners.get(p.id),
      );
      const members = partner ? [p, partner].sort(ordering.pair) : [p];
      members.forEach((m) => placed.add(m.id));
      row.push({
        people: members,
        x: 0,
        ...mapCardUnit(members, byHost),
      });
    }
    row.sort((a, b) => ordering.compareUnits(a.people, b.people));
    if (generation === referenceGeneration)
      for (const friend of unassigned)
        row.push({ people: [], x: 0, ...mapCardUnit([friend], byHost) });
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
  type Bundle = { parents: string[]; children: string[] };
  const bundles = new Map<string, Bundle>();
  const hasChildren = new Set(relatives.flatMap((p) => p.parentIds));
  const byId = new Map(relatives.map((p) => [p.id, p]));
  const siblingGroupById = new Map<string, Person[]>();
  for (const group of siblingGroups(relatives)) {
    const members = group.members.map((id) => byId.get(id)!);
    for (const p of members) siblingGroupById.set(p.id, members);
  }
  const initialX = new Map(relatives.map((p) => [p.id, x(p.id)!]));
  const reference = data.selfId && byId.get(data.selfId);
  const referenceRow = reference
    ? reference.generation - first
    : Math.max(0, Math.min(rows.length - 1, selfGeneration - first));
  const axis = () => {
    if (!reference) return 0;
    const own = x(reference.id)!;
    const spouse = x(partners.get(reference.id) ?? "");
    return spouse === undefined ? own : (own + spouse) / 2;
  };
  for (const p of relatives) {
    const parents = p.parentIds.filter((id) => owners.has(id)).sort();
    if (!parents.length) continue;
    const key = JSON.stringify(parents);
    const bundle = bundles.get(key) ?? { parents, children: [] };
    bundle.children.push(p.id);
    bundles.set(key, bundle);
  }
  function parentTarget(u: Unit, offsets: boolean) {
    const targets = (p: Person) =>
      p.parentIds.map(x).filter((v) => v !== undefined);
    const values = u.people.flatMap((p) => {
      const parents = targets(p);
      if (parents.length)
        return [center(parents) - (offsets ? owners.get(p.id)!.offset : 0)];
      const siblings = siblingGroupById
        .get(p.id)
        ?.filter((s) => s.generation === p.generation);
      if (!siblings?.length) return [];
      const siblingParents = siblings.flatMap(targets);
      // A sibling-only link anchors to the branch even before its parents have
      // been entered. Use the group's stable starting position in that case.
      const siblingPositions = siblings.map((s) => initialX.get(s.id)!);
      const anchor = siblingParents.length
        ? center(siblingParents)
        : offsets
          ? center(siblingPositions)
          : Math.min(...siblingPositions);
      return [anchor - (offsets ? owners.get(p.id)!.offset : 0)];
    });
    if (values.length) return average(values);
    // Legacy and unconnected cards still stay near their family where possible.
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
  const bundlesByUnit = new Map<Unit, Bundle[]>();
  for (const bundle of bundles.values())
    for (const unit of new Set(
      bundle.parents.map((id) => owners.get(id)!.unit),
    )) {
      if (!bundlesByUnit.has(unit)) bundlesByUnit.set(unit, []);
      bundlesByUnit.get(unit)!.push(bundle);
    }
  function childTarget(unit: Unit) {
    const linked = bundlesByUnit.get(unit);
    if (!linked?.length) return undefined;
    return average(
      linked.map(
        ({ parents, children }) =>
          center(children.map((id) => x(id)!)) -
          (center(parents.map((id) => x(id)!)) - unit.x),
      ),
    );
  }
  function sortRow(i: number, target: (u: Unit) => number) {
    const row = rows[i];
    const targets = new Map(row.map((u) => [u, target(u)]));
    const compare = (a: Unit, b: Unit) =>
      targets.get(a)! - targets.get(b)! ||
      (a.people.length && b.people.length
        ? ordering.compareUnits(a.people, b.people)
        : 0);
    if (!ordering.manualRows.has(generations[i].generation)) {
      row.sort(compare);
      return;
    }
    // Keep the saved relative order, but insert new units at their actual
    // parental branch. A saved row must not lock new children to rank-based slots.
    const saved = row.filter((u) =>
      u.people.some((p) => p.layoutOrder !== undefined),
    );
    const added = row.filter((u) => !saved.includes(u)).sort(compare);
    const projected = saved.map((u) => ({ ...u }));
    place(
      projected,
      saved.map((u) => targets.get(u)!),
    );
    const merged: Unit[] = [];
    let next = 0;
    for (const [j, unit] of saved.entries()) {
      while (
        next < added.length &&
        (targets.get(added[next])! < projected[j].x ||
          (targets.get(added[next]) === projected[j].x &&
            compare(added[next], unit) < 0))
      )
        merged.push(added[next++]);
      merged.push(unit);
    }
    merged.push(...added.slice(next));
    row.splice(0, row.length, ...merged);
  }
  // Lay out older rows outward from the reference generation. A newly recorded
  // ancestor takes the horizontal position of its descendants' branch, rather
  // than inheriting an arbitrary end slot from the older row's sort order.
  for (let i = referenceRow - 1; i >= 0; i--) {
    sortRow(i, (u) => childTarget(u) ?? axis());
    place(
      rows[i],
      rows[i].map((u) => childTarget(u) ?? axis()),
    );
  }
  for (let i = referenceRow + 1; i < rows.length; i++) {
    sortRow(i, (u) => parentTarget(u, false) ?? axis());
    place(
      rows[i],
      rows[i].map((u) => parentTarget(u, true) ?? axis()),
    );
  }
  // Refine both directions to center each household over its children without
  // breaking manual order or pulling the two cards of a couple apart.
  for (let pass = 0; pass < 32; pass++) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const target = (u: Unit, offsets: boolean) =>
        parentTarget(u, offsets) ??
        (i < referenceRow ? childTarget(u) : undefined) ??
        u.x;
      sortRow(i, (u) => target(u, false));
      place(
        row,
        row.map((u) => target(u, true)),
      );
    }
    for (let i = rows.length - 2; i >= 0; i--) {
      const row = rows[i];
      place(
        row,
        row.map((u) => childTarget(u) ?? u.x),
      );
    }
  }
  const referenceX = axis();
  const singletons = rows.map((row, i) => {
    if (generations[i].count !== 1) return undefined;
    const member = row.find((unit) => unit.people.length)!.people[0];
    const parents = member.parentIds
      .map((id) => byId.get(id))
      .filter(
        (p): p is Person => p !== undefined && p.generation < member.generation,
      );
    return { member, parents };
  });
  const isCentered = (i: number) => singletons[i]?.parents.length === 0;
  const branchPositions = new Map(relatives.map((p) => [p.id, x(p.id)!]));
  const rowBounds = rows.map((row, i) => {
    if (!row.length) return { left: referenceX, right: referenceX };
    // Move the whole row so friends keep their spacing from the only relative.
    if (isCentered(i)) {
      const shift = referenceX - x(singletons[i]!.member.id)!;
      for (const unit of row) unit.x += shift;
    }
    const left = Math.min(...row.map((unit) => unit.x - unit.width / 2));
    const right = Math.max(...row.map((unit) => unit.x + unit.width / 2));
    return { left, right };
  });
  let width =
    Math.max(
      initialInnerWidth,
      ...rowBounds.map(({ left, right }, i) =>
        isCentered(i)
          ? 2 * Math.max(referenceX - left, right - referenceX)
          : right - left,
      ),
    ) +
    canvasPadding * 2;
  const centeredOffset = width / 2 - referenceX;
  // Prefer a shared offset that fits the existing row spans before propagating
  // the final centering displacement through each descendant branch.
  const linkedRows = rowBounds.filter((_, i) => generations[i].count > 1);
  const lower = Math.max(...linkedRows.map(({ left }) => canvasPadding - left));
  const upper = Math.min(
    ...linkedRows.map(({ right }) => width - canvasPadding - right),
  );
  const sharedOffset =
    lower <= upper
      ? Math.max(lower, Math.min(upper, centeredOffset))
      : centeredOffset;
  const before = new Map(
    [...branchPositions].map(([id, position]) => [id, position + sharedOffset]),
  );
  for (const [i, row] of rows.entries()) {
    const singleton = singletons[i];
    for (const unit of row) unit.x += sharedOffset;
    if (singleton && !singleton.parents.length) {
      const shift = width / 2 - x(singleton.member.id)!;
      for (const unit of row) unit.x += shift;
    } else {
      // Propagate parents' final displacement to the entire child branch.
      // Preserve the balanced sibling spacing from the refinement passes.
      const linked = new Set<Unit>();
      const target = (unit: Unit, offsets: boolean) => {
        const values = unit.people.flatMap((member) => {
          const parents = member.parentIds.filter((id) => {
            const parent = byId.get(id);
            return parent && parent.generation < member.generation;
          });
          if (!parents.length) return [];
          linked.add(unit);
          const parentCenter = center(parents.map((id) => x(id)!));
          return [
            singleton
              ? parentCenter - (offsets ? owners.get(member.id)!.offset : 0)
              : unit.x +
                parentCenter -
                center(parents.map((id) => before.get(id)!)),
          ];
        });
        return values.length ? average(values) : unit.x;
      };
      sortRow(i, (unit) => target(unit, false));
      // Free-standing cards yield space to linked branches rather than pulling
      // those children away from their parents during collision resolution.
      place(
        row,
        row.map((unit) => target(unit, true)),
        row.map((unit) => linked.has(unit)),
      );
    }
  }
  // Fit the complete tree as one piece. Clamping each generation separately
  // would pull a wide child/friends group away from its parents again.
  const left = Math.min(...rows.flat().map((unit) => unit.x - unit.width / 2));
  const right = Math.max(...rows.flat().map((unit) => unit.x + unit.width / 2));
  const expansion = Math.max(
    0,
    canvasPadding - left,
    right + canvasPadding - width,
  );
  width += expansion * 2;
  for (const unit of rows.flat()) unit.x += expansion;
  const nodes = new Map<string, { x: number; y: number }>();
  rows.forEach((row, i) =>
    row.forEach((u) =>
      u.slots.forEach((s) => {
        nodes.set(s.id, {
          x: u.x + s.offset,
          y: generations[i].y,
        });
      }),
    ),
  );
  const seen = new Set<string>();
  const groups = rows.flatMap((row, i) => {
    const runs: { familyId: string; points: number[] }[] = [];
    row
      .flatMap((u) => u.slots.map((s) => ({ ...s, x: u.x + s.offset })))
      .sort((a, b) => a.x - b.x)
      .forEach((s, i, slots) => {
        if (s.friend) return;
        if (!slots[i - 1]?.friend && runs.at(-1)?.familyId === s.familyId)
          runs.at(-1)!.points.push(s.x);
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
    groups,
    generations,
    width,
    height: (generations.at(-1)?.y ?? 88) + householdHeight / 2 + 20,
  };
}
