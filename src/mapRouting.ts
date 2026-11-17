import type { Person } from "./model.ts";
import { siblingGroups } from "./familyRelations.ts";
import {
  personCardWidth,
  personCardHeight,
  partnerSpacing,
} from "./mapGeometry.ts";

export interface Point {
  x: number;
  y: number;
}
export interface Obstacle {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface FamilyEdge {
  from: string;
  to: string;
  partner: boolean;
  coParent: string;
}
export interface RoutedEdge extends FamilyEdge {
  path: string;
  points: Point[];
}
type Segment = [Point, Point];

function simplifyPoints(points: Point[]) {
  const result: Point[] = [];
  for (const p of points) {
    if (result.length && result.at(-1)!.x === p.x && result.at(-1)!.y === p.y)
      continue;
    while (result.length > 1) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))
        result.pop();
      else break;
    }
    result.push(p);
  }
  return result;
}

export function segmentHitsBox(a: Point, b: Point, box: Obstacle) {
  if (a.x === b.x)
    return (
      a.x > box.left &&
      a.x < box.right &&
      Math.max(a.y, b.y) > box.top &&
      Math.min(a.y, b.y) < box.bottom
    );
  if (a.y === b.y)
    return (
      a.y > box.top &&
      a.y < box.bottom &&
      Math.max(a.x, b.x) > box.left &&
      Math.min(a.x, b.x) < box.right
    );
  return true;
}

function crossingCost(a: Point, b: Point, used: Segment[]) {
  let cost = 0;
  const side = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  for (const [c, d] of used) {
    if (
      side(a, b, c) * side(a, b, d) < -0.001 &&
      side(c, d, a) * side(c, d, b) < -0.001
    )
      cost += 32;
  }
  return cost;
}

// Orthogonal visibility-grid search keeps the whole connection outside every card.
// Turn and crossing penalties favor a few smooth bends and separate family branches.
export function routeAroundCards(
  start: Point,
  end: Point,
  allBoxes: Obstacle[],
  used: Segment[] = [],
  includeAll = false,
) {
  const region = {
    left: Math.min(start.x, end.x) - 200,
    right: Math.max(start.x, end.x) + 200,
    top: Math.min(start.y, end.y) - 100,
    bottom: Math.max(start.y, end.y) + 100,
  };
  const boxes = includeAll
    ? allBoxes
    : allBoxes.filter(
        (b) =>
          b.left < region.right &&
          b.right > region.left &&
          b.top < region.bottom &&
          b.bottom > region.top,
      );
  const xs = [
    ...new Set([
      start.x,
      end.x,
      ...boxes.flatMap((b) => [b.left, b.right]),
      region.left,
      region.right,
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      start.y,
      end.y,
      ...boxes.flatMap((b) => [b.top, b.bottom]),
      region.top,
      region.bottom,
    ]),
  ].sort((a, b) => a - b);
  const width = xs.length,
    size = width * ys.length;
  const costs = new Float64Array(size * 3).fill(Infinity);
  const previous = new Int32Array(size * 3).fill(-1);
  const heap: { state: number; cost: number; score: number }[] = [];
  function push(item: (typeof heap)[number]) {
    heap.push(item);
    let i = heap.length - 1;
    while (i) {
      const parent = (i - 1) >> 1;
      if (heap[parent].score <= item.score) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = item;
  }
  function pop() {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < heap.length &&
          heap[child + 1].score < heap[child].score
        )
          child++;
        if (heap[child].score >= last.score) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first;
  }
  const startCell = ys.indexOf(start.y) * width + xs.indexOf(start.x);
  const endCell = ys.indexOf(end.y) * width + xs.indexOf(end.x);
  costs[startCell * 3] = 0;
  push({ state: startCell * 3, cost: 0, score: 0 });
  let final = -1;
  while (heap.length) {
    const current = pop();
    if (current.cost !== costs[current.state]) continue;
    const cell = Math.floor(current.state / 3),
      direction = current.state % 3;
    if (cell === endCell) {
      final = current.state;
      break;
    }
    const x = cell % width,
      y = Math.floor(cell / width),
      a = { x: xs[x], y: ys[y] };
    for (const [dx, dy, nextDirection] of [
      [-1, 0, 1],
      [1, 0, 1],
      [0, -1, 2],
      [0, 1, 2],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= ys.length) continue;
      const b = { x: xs[nx], y: ys[ny] };
      if (boxes.some((box) => segmentHitsBox(a, b, box))) continue;
      const state = (ny * width + nx) * 3 + nextDirection;
      const cost =
        current.cost +
        Math.abs(a.x - b.x) +
        Math.abs(a.y - b.y) +
        (direction && direction !== nextDirection ? 18 : 0) +
        crossingCost(a, b, used);
      if (cost >= costs[state]) continue;
      costs[state] = cost;
      previous[state] = current.state;
      push({
        state,
        cost,
        score: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y),
      });
    }
  }
  if (final < 0) return [];
  const result: Point[] = [];
  for (let state = final; state >= 0; state = previous[state]) {
    const cell = Math.floor(state / 3);
    result.push({ x: xs[cell % width], y: ys[Math.floor(cell / width)] });
  }
  result.reverse();
  const simplified = result.filter(
    (p, i, points) =>
      i === 0 ||
      i === points.length - 1 ||
      !(
        (points[i - 1].x === p.x && p.x === points[i + 1].x) ||
        (points[i - 1].y === p.y && p.y === points[i + 1].y)
      ),
  );
  if (
    !includeAll &&
    simplified.some(
      (p, i) =>
        i > 0 &&
        allBoxes.some((box) => segmentHitsBox(simplified[i - 1], p, box)),
    )
  )
    return routeAroundCards(start, end, allBoxes, used, true);
  return simplified;
}

export function roundedPath(
  points: Point[],
  radius = 24,
  boxes: Obstacle[] = [],
) {
  if (!points.length) return "";
  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const before = Math.abs(b.x - a.x) + Math.abs(b.y - a.y),
      after = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
    if (!before || !after) continue;
    let r = Math.min(radius, before / 2, after / 2);
    let p: Point, q: Point;
    for (;;) {
      p = {
        x: b.x + ((a.x - b.x) * r) / before,
        y: b.y + ((a.y - b.y) * r) / before,
      };
      q = {
        x: b.x + ((c.x - b.x) * r) / after,
        y: b.y + ((c.y - b.y) * r) / after,
      };
      const curve: Cubic = [
        p,
        { x: p.x + ((b.x - p.x) * 2) / 3, y: p.y + ((b.y - p.y) * 2) / 3 },
        { x: q.x + ((b.x - q.x) * 2) / 3, y: q.y + ((b.y - q.y) * 2) / 3 },
        q,
      ];
      if (r <= 6 || !boxes.some((box) => curveHitsBox(curve, box))) break;
      r = Math.max(6, r / 2);
    }
    path += ` L${p.x},${p.y} Q${b.x},${b.y} ${q.x},${q.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L${last.x},${last.y}`;
}

type Cubic = [Point, Point, Point, Point];
const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

// Subdivision checks the whole curve, including bends between sampled points.
function curveHitsBox(curve: Cubic, box: Obstacle, depth = 0): boolean {
  if (
    Math.max(...curve.map((p) => p.x)) <= box.left ||
    Math.min(...curve.map((p) => p.x)) >= box.right ||
    Math.max(...curve.map((p) => p.y)) <= box.top ||
    Math.min(...curve.map((p) => p.y)) >= box.bottom
  )
    return false;
  if (depth >= 12) return true;
  const [a, b, c, d] = curve;
  const ab = midpoint(a, b),
    bc = midpoint(b, c),
    cd = midpoint(c, d);
  const abc = midpoint(ab, bc),
    bcd = midpoint(bc, cd);
  const center = midpoint(abc, bcd);
  return (
    curveHitsBox([a, ab, abc, center], box, depth + 1) ||
    curveHitsBox([center, bcd, cd, d], box, depth + 1)
  );
}

function smoothConnection(
  start: Point,
  end: Point,
  out: Point,
  into: Point,
  boxes: Obstacle[],
) {
  const length = Math.hypot(into.x - out.x, into.y - out.y);
  const first = Math.hypot(out.x - start.x, out.y - start.y);
  const last = Math.hypot(end.x - into.x, end.y - into.y);
  if (!first || !last) return undefined;
  const forward = [
    ((into.x - out.x) * (out.x - start.x) +
      (into.y - out.y) * (out.y - start.y)) /
      first,
    ((into.x - out.x) * (end.x - into.x) +
      (into.y - out.y) * (end.y - into.y)) /
      last,
  ];
  const handle = Math.min(
    120,
    length * 0.45,
    ...forward
      .filter((distance) => distance > 0)
      .map((distance) => distance * 0.5),
  );
  const c1 = {
    x: out.x + ((out.x - start.x) / first) * handle,
    y: out.y + ((out.y - start.y) / first) * handle,
  };
  const c2 = {
    x: into.x - ((end.x - into.x) / last) * handle,
    y: into.y - ((end.y - into.y) / last) * handle,
  };
  const curve: Cubic = [out, c1, c2, into];
  if (boxes.some((box) => curveHitsBox(curve, box))) return undefined;
  const points = [start];
  for (let step = 0; step <= 64; step++) {
    const t = step / 64,
      u = 1 - t;
    points.push({
      x:
        u ** 3 * out.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t ** 3 * into.x,
      y:
        u ** 3 * out.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t ** 3 * into.y,
    });
  }
  points.push(end);
  return {
    points,
    path: `M${start.x},${start.y} L${out.x},${out.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${into.x},${into.y} L${end.x},${end.y}`,
  };
}

export function familyEdges(
  people: readonly Person[],
  nodes: ReadonlyMap<string, Point>,
  tree: boolean,
): FamilyEdge[] {
  return people
    .filter((p) => p.kind !== "friend")
    .flatMap((p) => {
      const parents = p.parentIds
        .map((id) => people.find((p) => p.id === id))
        .filter((p) => p !== undefined);
      const a = parents[0] ? nodes.get(parents[0].id) : undefined,
        b = parents[1] ? nodes.get(parents[1].id) : undefined;
      const paired =
        tree &&
        a &&
        b &&
        a.y === b.y &&
        Math.abs(a.x - b.x) <= partnerSpacing + 1 &&
        (parents[0].partnerId === parents[1].id ||
          parents[1].partnerId === parents[0].id);
      return [
        ...(paired
          ? [
              {
                from: parents[0].id,
                to: p.id,
                partner: false,
                coParent: parents[1].id,
              },
            ]
          : p.parentIds.map((id) => ({
              from: id,
              to: p.id,
              partner: false,
              coParent: "",
            }))),
        ...(p.partnerId &&
        (p.id < p.partnerId ||
          people.find((m) => m.id === p.partnerId)?.partnerId !== p.id)
          ? [{ from: p.id, to: p.partnerId, partner: true, coParent: "" }]
          : []),
      ];
    });
}

export function routeFamilyMap(
  people: readonly Person[],
  nodes: ReadonlyMap<string, Point>,
  tree: boolean,
  friends: ReadonlyMap<string, Point> = new Map(),
) {
  const halfW = personCardWidth / 2,
    halfH = personCardHeight / 2;
  const boxes: Obstacle[] = [...nodes.values(), ...friends.values()].map(
    (p) => ({
      left: p.x - halfW - 6,
      right: p.x + halfW + 6,
      top: p.y - halfH - 6,
      bottom: p.y + halfH + 6,
    }),
  );
  const used: Segment[] = [];
  const curveBoxes = boxes.map((b) => ({
    left: b.left + 5,
    right: b.right - 5,
    top: b.top + 5,
    bottom: b.bottom - 5,
  }));
  function route(
    start: Point,
    end: Point,
    out: Point,
    into: Point,
    smooth = true,
  ) {
    const direct = smooth
      ? smoothConnection(start, end, out, into, boxes)
      : undefined;
    const score = (points: Point[]) =>
      points.reduce(
        (sum, p, i) =>
          !i
            ? sum
            : sum +
              Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) +
              crossingCost(points[i - 1], p, used),
        0,
      );
    const crossing =
      direct &&
      direct.points.some(
        (p, i, points) => i && crossingCost(points[i - 1], p, used),
      );
    if (direct && !crossing) {
      for (let i = 1; i < direct.points.length; i++)
        used.push([direct.points[i - 1], direct.points[i]]);
      return direct;
    }
    let points = routeAroundCards(out, into, boxes, used);
    if (!points.length && !direct) return { points: [], path: "" };
    points = simplifyPoints([start, ...points, end]);
    // A crossing should not send a clear curve on a long tour of the family.
    // Keep the shorter candidate unless a small detour actually improves it.
    if (
      direct &&
      (points.length < 3 || score(direct.points) <= score(points) + 18)
    ) {
      for (let i = 1; i < direct.points.length; i++)
        used.push([direct.points[i - 1], direct.points[i]]);
      return direct;
    }
    for (let i = 1; i < points.length; i++)
      used.push([points[i - 1], points[i]]);
    return { points, path: roundedPath(points, smooth ? 24 : 6, curveBoxes) };
  }
  const edges = familyEdges(people, nodes, tree);
  const routes: RoutedEdge[] = [];
  for (const edge of edges.toSorted(
    (a, b) =>
      Number(b.partner) - Number(a.partner) ||
      (nodes.get(a.to)?.y ?? 0) - (nodes.get(b.to)?.y ?? 0) ||
      (nodes.get(a.to)?.x ?? 0) - (nodes.get(b.to)?.x ?? 0) ||
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to),
  )) {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (!a || !b) continue;
    if (
      edge.partner &&
      a.y === b.y &&
      Math.abs(a.x - b.x) <= partnerSpacing + 1
    ) {
      const sign = Math.sign(b.x - a.x),
        start = { x: a.x + sign * halfW, y: a.y },
        end = { x: b.x - sign * halfW, y: b.y };
      routes.push({
        ...edge,
        points: [start, end],
        path: `M${start.x},${start.y} L${end.x},${end.y}`,
      });
      used.push([start, end]);
      continue;
    }
    const coParent = nodes.get(edge.coParent);
    let start: Point, end: Point, out: Point, into: Point;
    if (!edge.partner && (tree || a.y !== b.y)) {
      const sign = tree ? 1 : Math.sign(b.y - a.y);
      start = coParent
        ? { x: (a.x + coParent.x) / 2, y: a.y }
        : { x: a.x, y: a.y + halfH * sign };
      end = { x: b.x, y: b.y - halfH * sign };
      out = { x: start.x, y: start.y + (coParent ? halfH + 6 : 6) * sign };
      into = { x: end.x, y: end.y - 6 * sign };
    } else {
      const sign = Math.sign(b.x - a.x) || 1;
      start = { x: a.x + halfW * sign, y: a.y };
      end = { x: b.x - halfW * sign, y: b.y };
      out = { x: start.x + 6 * sign, y: start.y };
      into = { x: end.x - 6 * sign, y: end.y };
    }
    routes.push({ ...edge, ...route(start, end, out, into) });
  }
  const siblings = siblingGroups(people)
    .map((group) => {
      const joined = new Map(group.members.map((id) => [id, id]));
      const root = (id: string): string => {
        let next = id;
        while (joined.get(next) !== next) next = joined.get(next)!;
        return next;
      };
      const pairs = group.pairs
        .filter(([a, b]) => nodes.has(a) && nodes.has(b))
        .sort((a, b) => {
          const distance = ([a, b]: [string, string]) =>
            Math.abs(nodes.get(a)!.x - nodes.get(b)!.x) +
            Math.abs(nodes.get(a)!.y - nodes.get(b)!.y);
          return distance(a) - distance(b);
        });
      const paths: {
        from: string;
        to: string;
        path: string;
        points: Point[];
      }[] = [];
      for (const [from, to] of pairs) {
        if (root(from) === root(to)) continue;
        joined.set(root(from), root(to));
        const a = nodes.get(from)!,
          b = nodes.get(to)!;
        const start = { x: a.x, y: a.y - halfH },
          end = { x: b.x, y: b.y - halfH };
        const clearance = tree ? 12 : 6;
        paths.push({
          from,
          to,
          ...route(
            start,
            end,
            { x: start.x, y: start.y - clearance },
            { x: end.x, y: end.y - clearance },
            false,
          ),
        });
      }
      return { ...group, paths };
    })
    .filter((g) => g.paths.length);
  return { edges, routes, siblings };
}
