import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createDemo, createBranchDemo } from "./fixtures.ts";
import { makeGenerationLayout } from "../src/treeLayout.ts";
import { routeAroundCards, routeFamilyMap } from "../src/mapRouting.ts";
import { personCardHeight, personCardWidth } from "../src/mapGeometry.ts";

function renderedPoints(path: string) {
  const tokens = path.match(/[MLQC]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? [];
  const points: { x: number; y: number }[] = [];
  let i = 0,
    start = { x: 0, y: 0 };
  const next = () => ({ x: Number(tokens[i++]), y: Number(tokens[i++]) });
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M") {
      start = next();
      points.push(start);
      continue;
    }
    assert.ok(["L", "Q", "C"].includes(command));
    const controls = Array.from(
      { length: command === "C" ? 3 : command === "Q" ? 2 : 1 },
      next,
    );
    const end = controls.at(-1)!;
    for (let step = 1; step <= 96; step++) {
      const t = step / 96,
        u = 1 - t;
      const coordinate = (key: "x" | "y") =>
        command === "C"
          ? u ** 3 * start[key] +
            3 * u * u * t * controls[0][key] +
            3 * u * t * t * controls[1][key] +
            t ** 3 * end[key]
          : command === "Q"
            ? u * u * start[key] +
              2 * u * t * controls[0][key] +
              t * t * end[key]
            : u * start[key] + t * end[key];
      points.push({ x: coordinate("x"), y: coordinate("y") });
    }
    start = end;
  }
  return points;
}

function assertRenderedRoutesClear(
  lines: { path: string; from: string; to: string }[],
  nodes: ReadonlyMap<string, { x: number; y: number }>,
) {
  for (const line of lines) {
    assert.ok(line.path, `missing ${line.from}-${line.to}`);
    for (const sample of renderedPoints(line.path))
      for (const [id, center] of nodes) {
        assert.ok(
          !(
            sample.x > center.x - personCardWidth / 2 + 0.01 &&
            sample.x < center.x + personCardWidth / 2 - 0.01 &&
            sample.y > center.y - personCardHeight / 2 + 0.01 &&
            sample.y < center.y + personCardHeight / 2 - 0.01
          ),
          `rendered curve ${line.from}-${line.to} crossed ${id}`,
        );
      }
  }
}

test("a clear parent connection stays smooth through the household caption area", () => {
  const people = createDemo().people.filter((p) =>
    ["me", "wife", "kid"].includes(p.id),
  );
  people.find((p) => p.id === "me")!.parentIds = [];
  const nodes = new Map([
    ["me", { x: 100, y: 100 }],
    ["wife", { x: 292, y: 100 }],
    ["kid", { x: 400, y: 292 }],
  ]);
  const result = routeFamilyMap(people, nodes, true);
  const line = result.routes.find((r) => r.to === "kid")!;
  assert.match(line.path, / C/);
  const samples = renderedPoints(line.path);
  assert.ok(
    samples.some((p) => p.y > 170 && p.y < 190 && p.x > 112 && p.x < 280),
  );
  assert.ok(samples.every((p) => p.x >= 196 - 1e-6 && p.x <= 400 + 1e-6));
  assert.ok(samples.every((p, i) => !i || p.y >= samples[i - 1].y - 1e-6));
  assert.equal(result.routes.filter((r) => r.partner).length, 1);
  assertRenderedRoutesClear(result.routes, nodes);
});

test("sibling routes remain visible between tightly packed network rows", () => {
  const data = createDemo();
  const nodes = new Map(
    data.people.map((p, i) => [
      p.id,
      {
        x: 100 + (i % 2) * 224,
        y: 100 + Math.floor(i / 2) * 132,
      },
    ]),
  );
  const result = routeFamilyMap(data.people, nodes, false);
  assert.ok(result.siblings.length >= 2);
  assertRenderedRoutesClear(
    [...result.routes, ...result.siblings.flatMap((g) => g.paths)],
    nodes,
  );
  for (const line of [
    ...result.routes,
    ...result.siblings.flatMap((g) => g.paths),
  ]) {
    assert.ok(line.path, `missing ${line.from}-${line.to}`);
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1],
        b = line.points[i];
      for (let step = 1; step < 100; step++) {
        const x = a.x + ((b.x - a.x) * step) / 100;
        const y = a.y + ((b.y - a.y) * step) / 100;
        for (const p of nodes.values())
          assert.ok(
            !(
              x > p.x - personCardWidth / 2 + 0.01 &&
              x < p.x + personCardWidth / 2 - 0.01 &&
              y > p.y - personCardHeight / 2 + 0.01 &&
              y < p.y + personCardHeight / 2 - 0.01
            ),
            `card crossed by ${line.from}-${line.to}`,
          );
      }
    }
  }
});

test("paternal grandparents stay on the left even when all relatives share one household and reverse input order", () => {
  const data = createDemo();
  data.people.reverse();
  data.people.forEach((p) => (p.familyId = "home"));
  data.families = data.families.filter((f) => f.id === "home");
  const before = structuredClone(data),
    layout = makeGenerationLayout(data);
  const x = (id: string) => layout.nodes.get(id)!.x;
  assert.ok(x("grandpa") < x("grandma"));
  assert.ok(x("grandma") < x("m-grandpa"));
  assert.ok(x("m-grandpa") < x("m-grandma"));
  assert.equal(x("mom") - x("dad"), 192);
  assert.ok(x("uncle") < x("dad") && x("m-uncle") > x("mom"));
  assert.deepEqual(data, before);
});

test("orthogonal routes go around an intervening card instead of disappearing underneath it", () => {
  const box = { left: 150, right: 250, top: -60, bottom: 60 };
  const points = routeAroundCards({ x: 0, y: 0 }, { x: 400, y: 0 }, [box]);
  assert.ok(points.length >= 4);
  assert.ok(points.some((p) => Math.abs(p.y) >= 60));
  for (let i = 1; i < points.length; i++)
    for (let step = 1; step < 100; step++) {
      const a = points[i - 1],
        b = points[i],
        x = a.x + ((b.x - a.x) * step) / 100,
        y = a.y + ((b.y - a.y) * step) / 100;
      assert.ok(
        !(x > box.left && x < box.right && y > box.top && y < box.bottom),
      );
    }
});

test("every parent and sibling route stays outside all family cards in a dense three-generation tree", () => {
  const data = createDemo();
  data.people.reverse();
  data.people.forEach((p) => (p.familyId = "home"));
  data.families = data.families.filter((f) => f.id === "home");
  const layout = makeGenerationLayout(data);
  const result = routeFamilyMap(data.people, layout.nodes, true);
  assert.equal(result.routes.length, result.edges.length);
  assert.ok(result.siblings.length >= 2);
  assertRenderedRoutesClear(
    [...result.routes, ...result.siblings.flatMap((g) => g.paths)],
    layout.nodes,
  );
  for (const route of [
    ...result.routes,
    ...result.siblings.flatMap((g) => g.paths),
  ]) {
    assert.ok(route.path.length > 0, `missing ${route.from}-${route.to}`);
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      for (let step = 1; step < 100; step++) {
        const x = a.x + ((b.x - a.x) * step) / 100,
          y = a.y + ((b.y - a.y) * step) / 100;
        for (const p of layout.nodes.values())
          assert.ok(
            !(
              x > p.x - personCardWidth / 2 + 0.01 &&
              x < p.x + personCardWidth / 2 - 0.01 &&
              y > p.y - personCardHeight / 2 + 0.01 &&
              y < p.y + personCardHeight / 2 - 0.01
            ),
            `card crossed by ${route.from}-${route.to}`,
          );
      }
    }
  }
});

test("three cousin branches stay symmetric, smooth and clear across household boundaries", () => {
  const data = createBranchDemo(),
    layout = makeGenerationLayout(data);
  const result = routeFamilyMap(data.people, layout.nodes, true);
  assertRenderedRoutesClear(
    [...result.routes, ...result.siblings.flatMap((g) => g.paths)],
    layout.nodes,
  );
  const center =
    (layout.nodes.get("aunt")!.x + layout.nodes.get("aunt-husband")!.x) / 2;
  for (const id of ["cousin1", "cousin2", "cousin3"]) {
    const lines = result.routes.filter((r) => r.to === id && !r.partner);
    assert.equal(lines.length, 1);
    assert.ok(lines[0].coParent);
    assert.match(lines[0].path, / C/);
    const child = layout.nodes.get(id)!;
    for (const p of renderedPoints(lines[0].path))
      assert.ok(
        p.x >= Math.min(center, child.x) - 0.01 &&
          p.x <= Math.max(center, child.x) + 0.01,
      );
  }
  const reversed = routeFamilyMap(
    [...data.people].reverse(),
    layout.nodes,
    true,
  );
  assert.deepEqual(reversed.routes, result.routes);
});

test("crossing a clear curve does not cause a long detour around the tree", () => {
  const template = createDemo().people[0];
  const people = [
    { ...template, id: "a", parentIds: [], partnerId: "" },
    { ...template, id: "b", parentIds: [], partnerId: "" },
    { ...template, id: "c", parentIds: ["a"], partnerId: "" },
    { ...template, id: "d", parentIds: ["b"], partnerId: "" },
  ];
  const nodes = new Map([
    ["a", { x: 100, y: 100 }],
    ["b", { x: 600, y: 100 }],
    ["c", { x: 600, y: 292 }],
    ["d", { x: 100, y: 292 }],
  ]);
  const result = routeFamilyMap(people, nodes, true);
  assertRenderedRoutesClear(result.routes, nodes);
  for (const line of result.routes) {
    const points = renderedPoints(line.path);
    const length = points.reduce(
      (sum, p, i) =>
        !i
          ? sum
          : sum + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y),
      0,
    );
    assert.ok(length < 600, `unnecessary detour: ${length}`);
    assert.match(line.path, / C/);
  }
});
