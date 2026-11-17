import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  clampCrop,
  cropSource,
  initialCrop,
  zoomCrop,
} from "../src/avatarCrop.ts";

test("the default crop covers the square and centers landscape and portrait photos", () => {
  assert.deepEqual(cropSource(initialCrop, 900, 600), {
    x: 150,
    y: 0,
    side: 600,
  });
  assert.deepEqual(cropSource(initialCrop, 600, 900), {
    x: 0,
    y: 150,
    side: 600,
  });
});

test("zoom and drag stay inside the photograph at every allowed scale", () => {
  for (const [width, height] of [
    [900, 600],
    [600, 900],
    [600, 600],
  ]) {
    for (const zoom of [-1, 1, 2, 5, 10]) {
      for (const x of [-100, 0, 100])
        for (const y of [-100, 0, 100]) {
          const view = clampCrop({ zoom, x, y }, width, height);
          assert.ok(view.zoom >= 1 && view.zoom <= 5);
          const source = cropSource(view, width, height);
          assert.ok(source.x >= -1e-9 && source.y >= -1e-9);
          assert.ok(source.x + source.side <= width + 1e-9);
          assert.ok(source.y + source.side <= height + 1e-9);
        }
    }
  }
});

test("zooming around a finger keeps the image point under that finger", () => {
  const start = { zoom: 2, x: 0.1, y: -0.2 },
    focus = { x: 0.2, y: -0.1 };
  const next = zoomCrop(start, 3, 900, 600, focus);
  const before = cropSource(start, 900, 600),
    after = cropSource(next, 900, 600);
  assert.ok(
    Math.abs(
      before.x +
        (focus.x + 0.5) * before.side -
        after.x -
        (focus.x + 0.5) * after.side,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      before.y +
        (focus.y + 0.5) * before.side -
        after.y -
        (focus.y + 0.5) * after.side,
    ) < 1e-9,
  );
});

test("zooming back out clamps an edge crop rather than exposing blank pixels", () => {
  const next = zoomCrop({ zoom: 5, x: 2, y: -2 }, 0.1, 600, 600);
  assert.deepEqual(next, initialCrop);
});
