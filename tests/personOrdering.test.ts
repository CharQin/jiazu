import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createDemo } from "./fixtures.ts";
import { applyPersonOrder, reorderPersonIds } from "../src/personOrdering.ts";
import { makeGenerationLayout } from "../src/treeLayout.ts";
import { validateData } from "../src/model.ts";

test("self's sibling automatically stays on the blood side of the couple regardless of input order", () => {
  const data = createDemo();
  data.people.push({
    ...data.people[0],
    id: "z-brother",
    partnerId: "",
    relation: "弟弟",
    birthday: "",
  });
  data.people.reverse();
  const layout = makeGenerationLayout(data);
  assert.ok(layout.nodes.get("z-brother")!.x < layout.nodes.get("me")!.x);
  assert.equal(layout.nodes.get("wife")!.x - layout.nodes.get("me")!.x, 192);
});

test("manual sorting moves a couple as a unit, persists in backups and preserves relationships", () => {
  const data = createDemo();
  data.people.push({
    ...data.people[0],
    id: "brother",
    partnerId: "",
    relation: "弟弟",
  });
  const before = structuredClone(data);
  const ids = reorderPersonIds(
    data.people,
    ["brother", "me", "wife"],
    "brother",
    "wife",
    true,
  );
  assert.deepEqual(ids, ["me", "wife", "brother"]);
  const saved = validateData(
    JSON.parse(
      JSON.stringify({ ...data, people: applyPersonOrder(data.people, ids) }),
    ),
  );
  const layout = makeGenerationLayout(saved);
  assert.ok(layout.nodes.get("brother")!.x > layout.nodes.get("wife")!.x);
  assert.equal(layout.nodes.get("wife")!.x - layout.nodes.get("me")!.x, 192);
  for (const p of saved.people) {
    const original = before.people.find((other) => other.id === p.id)!;
    assert.deepEqual(p.parentIds, original.parentIds);
    assert.equal(p.familyId, original.familyId);
    assert.equal(p.generation, original.generation);
  }
  assert.deepEqual(data, before);
});

test("sorting across households moves each same-generation household together", () => {
  const data = createDemo();
  const row = ["cousin", "me", "wife", "m-cousin"];
  const ids = reorderPersonIds(data.people, row, "me", "m-cousin", true);
  assert.deepEqual(ids, ["cousin", "m-cousin", "me", "wife"]);
  const layout = makeGenerationLayout({
    ...data,
    people: applyPersonOrder(data.people, ids),
  });
  assert.ok(layout.nodes.get("m-cousin")!.x < layout.nodes.get("me")!.x);
  assert.ok(layout.nodes.get("cousin")!.x < layout.nodes.get("m-cousin")!.x);
});

test("sorting refuses to move relatives between generations", () => {
  const data = createDemo(),
    ids = ["dad", "me", "wife"];
  assert.deepEqual(reorderPersonIds(data.people, ids, "me", "dad", false), ids);
});

test("manual sorting keeps partners together even when they belong to different households", () => {
  const data = createDemo();
  data.people.find((p) => p.id === "wife")!.familyId = "parents";
  data.people.push({ ...data.people[0], id: "brother", partnerId: "" });
  const ids = reorderPersonIds(
    data.people,
    ["me", "wife", "brother"],
    "me",
    "brother",
    true,
  );
  assert.deepEqual(ids, ["brother", "me", "wife"]);
  const layout = makeGenerationLayout({
    ...data,
    people: applyPersonOrder(data.people, ids),
  });
  assert.ok(layout.nodes.get("brother")!.x < layout.nodes.get("me")!.x);
  assert.equal(layout.nodes.get("wife")!.x - layout.nodes.get("me")!.x, 192);
});

test("crossing a partner reverses the couple's slots and survives backup restore", () => {
  const data = createDemo();
  const row = ["cousin", "me", "wife", "m-cousin"];
  assert.deepEqual(
    reorderPersonIds(data.people, row, "me", "wife", false),
    row,
  );
  const swapped = reorderPersonIds(data.people, row, "me", "wife", true);
  assert.deepEqual(swapped, ["cousin", "wife", "me", "m-cousin"]);
  const saved = validateData(
    JSON.parse(
      JSON.stringify({
        ...data,
        people: applyPersonOrder(data.people, swapped),
      }),
    ),
  );
  const x = (id: string) => makeGenerationLayout(saved).nodes.get(id)!.x;
  assert.equal(x("me") - x("wife"), 192);
  assert.ok(x("cousin") < x("wife") && x("me") < x("m-cousin"));
  assert.deepEqual(
    reorderPersonIds(saved.people, swapped, "me", "wife", false),
    row,
  );
});
