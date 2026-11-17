import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fitMapView, retainMapView } from "../src/mapViewport.ts";
import { createBranchDemo } from "./fixtures.ts";
import { makeGenerationLayout } from "../src/treeLayout.ts";

test("full map fits every edge into phone space clear of the labels and controls", () => {
  for (const viewport of [
    { width: 320, height: 260 },
    { width: 390, height: 560 },
    { width: 1200, height: 800 },
  ]) {
    for (const bounds of [
      { left: 120, right: 260, top: 30, bottom: 180 },
      { left: -1000, right: 5000, top: -200, bottom: 1100 },
      { left: 0, right: 400, top: 0, bottom: 5000 },
    ])
      for (const tree of [true, false]) {
        const view = fitMapView(bounds, viewport, tree);
        assert.ok(view.scale > 0 && view.scale <= 1.1);
        assert.ok(bounds.left * view.scale + view.x >= (tree ? 84 : 16) - 1e-9);
        assert.ok(
          bounds.right * view.scale + view.x <= viewport.width - 16 + 1e-9,
        );
        assert.ok(bounds.top * view.scale + view.y >= 40 - 1e-9);
        assert.ok(
          bounds.bottom * view.scale + view.y <= viewport.height - 60 + 1e-9,
        );
      }
  }
});

test("full map centers nonzero bounds and handles a single point without invalid coordinates", () => {
  const bounds = { left: -500, right: 800, top: 60, bottom: 640 };
  const viewport = { width: 390, height: 560 };
  const view = fitMapView(bounds, viewport, true);
  assert.ok(
    Math.abs(
      ((bounds.left + bounds.right) / 2) * view.scale +
        view.x -
        (84 + 390 - 16) / 2,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      ((bounds.top + bounds.bottom) / 2) * view.scale +
        view.y -
        (40 + 560 - 60) / 2,
    ) < 1e-9,
  );
  const single = fitMapView(
    { left: 10, right: 10, top: 20, bottom: 20 },
    viewport,
    true,
  );
  assert.ok(Object.values(single).every(Number.isFinite));
  assert.equal(single.scale, 1.1);
});

test("deleting a card retains zoom and the nearest surviving card's screen position", () => {
  const before = new Map([
    ["removed", { x: 900, y: 500 }],
    ["near", { x: 880, y: 500 }],
    ["far", { x: 100, y: 100 }],
  ]);
  const after = new Map([
    ["near", { x: 620, y: 308 }],
    ["far", { x: 120, y: 100 }],
  ]);
  const viewport = { width: 390, height: 560 };
  for (const tree of [true, false])
    for (const scale of [0.24, 0.78, 1.6]) {
      const view = { x: 220 - 900 * scale, y: 264 - 500 * scale, scale };
      const retained = retainMapView(view, before, after, viewport, tree);
      assert.equal(retained.scale, scale);
      assert.ok(
        Math.abs(880 * scale + view.x - (620 * scale + retained.x)) < 1e-9,
      );
      assert.ok(
        Math.abs(500 * scale + view.y - (308 * scale + retained.y)) < 1e-9,
      );
    }
});

test("removing the last elder generation keeps the viewed descendants in place", () => {
  const data = createBranchDemo();
  const before = makeGenerationLayout(data);
  const afterData = {
    ...data,
    people: data.people
      .filter((p) => p.generation !== 0)
      .map((p) => ({
        ...p,
        parentIds: p.parentIds.filter(
          (id) => data.people.find((q) => q.id === id)?.generation !== 0,
        ),
      })),
  };
  const after = makeGenerationLayout(afterData);
  const anchor = before.nodes.get("me")!;
  const view = { x: 230 - anchor.x * 0.8, y: 260 - anchor.y * 0.8, scale: 0.8 };
  const result = retainMapView(
    view,
    before.nodes,
    after.nodes,
    { width: 390, height: 560 },
    true,
  );
  const nextAnchor = after.nodes.get("me")!;
  assert.equal(result.scale, view.scale);
  assert.ok(Math.abs(nextAnchor.x * result.scale + result.x - 230) < 1e-9);
  assert.ok(Math.abs(nextAnchor.y * result.scale + result.y - 260) < 1e-9);
});

test("friend anchors retain the view and an empty replacement never invents a viewport", () => {
  const view = { x: -800, y: 45, scale: 0.95 };
  const before = new Map([["friends:home", { x: 900, y: 220 }]]);
  const after = new Map([["friends:home", { x: 700, y: 180 }]]);
  const result = retainMapView(
    view,
    before,
    after,
    { width: 390, height: 560 },
    false,
  );
  assert.equal(result.x, view.x + 200 * view.scale);
  assert.equal(result.y, view.y + 40 * view.scale);
  assert.deepEqual(
    retainMapView(view, before, new Map(), { width: 390, height: 560 }, false),
    view,
  );
});
