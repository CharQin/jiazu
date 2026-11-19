import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createEmpty } from "../src/model.ts";
import type { FamilyData, Person } from "../src/model.ts";
import { personCardWidth } from "../src/mapGeometry.ts";
import { makeGenerationLayout } from "../src/treeLayout.ts";

function person(
  id: string,
  generation: number,
  extra: Partial<Person> = {},
): Person {
  return {
    ...createEmpty().people[0],
    id,
    name: id,
    familyId: id.split("-")[0],
    generation,
    ...extra,
  };
}

function data(people: Person[], selfId = "a"): FamilyData {
  return {
    ...createEmpty(),
    selfId,
    people,
    families: [...new Set(people.map((p) => p.familyId))].map((id) => ({
      id,
      name: "",
      branch: "home",
    })),
  };
}

function assertInsideCanvas(layout: ReturnType<typeof makeGenerationLayout>) {
  for (const [id, node] of layout.nodes) {
    assert.ok(
      node.x - personCardWidth / 2 >= -1e-8,
      `${id} extends beyond the left canvas edge`,
    );
    assert.ok(
      node.x + personCardWidth / 2 <= layout.width + 1e-8,
      `${id} extends beyond the right canvas edge`,
    );
  }
}

test("a first child of a different branch enters a manual row below its parent without reversing existing cards", () => {
  const family = data([
    person("a", 2, { layoutOrder: 1024 }),
    person("b", 2, { layoutOrder: 2048 }),
    person("c", 2, { layoutOrder: 0 }),
    person("a-child", 3, { parentIds: ["a"], layoutOrder: 0 }),
    person("b-child", 3, { parentIds: ["b"], layoutOrder: 1024 }),
  ]);
  const before = makeGenerationLayout(family);
  assert.equal(before.nodes.get("a-child")!.x, before.nodes.get("a")!.x);
  assert.equal(before.nodes.get("b-child")!.x, before.nodes.get("b")!.x);

  family.people.push(person("c-child", 3, { parentIds: ["c"] }));
  const snapshot = structuredClone(family);
  const layout = makeGenerationLayout(family);
  const x = (id: string) => layout.nodes.get(id)!.x;
  assert.ok(x("c") < x("a") && x("a") < x("b"));
  assert.ok(x("c-child") < x("a-child"));
  assert.ok(x("a-child") < x("b-child"));
  for (const id of ["a", "b", "c"])
    assert.ok(Math.abs(x(`${id}-child`) - x(id)) < 1e-8);
  assertInsideCanvas(layout);
  assert.deepEqual(family, snapshot);
});

test("a sole child with many friends remains below its parent and every card fits inside the canvas", () => {
  for (const count of [4, 8, 12]) {
    const family = data([
      person("a", 2),
      person("b", 2),
      person("c", 2),
      person("c-child", 3, { parentIds: ["c"] }),
      ...Array.from({ length: count }, (_, i) =>
        person(`friend-${i}`, 3, {
          kind: "friend",
          friendOfId: "c-child",
          familyId: "c",
        }),
      ),
    ]);
    const layout = makeGenerationLayout(family);
    assert.equal(layout.nodes.size, family.people.length);
    assert.ok(
      Math.abs(layout.nodes.get("c-child")!.x - layout.nodes.get("c")!.x) <
        1e-8,
      `${count} friends must not pull the child away from its parent`,
    );
    assertInsideCanvas(layout);
  }
});

test("centering a lone elder moves its multiple children's branch into alignment", () => {
  const family = data([
    person("elder", 1),
    person("a", 2, { parentIds: ["elder"], familyId: "elder" }),
    person("b", 2, { parentIds: ["elder"], familyId: "elder" }),
    person("c", 2),
  ]);
  const layout = makeGenerationLayout(family);
  const x = (id: string) => layout.nodes.get(id)!.x;
  assert.equal(x("elder"), layout.width / 2);
  assert.ok(Math.abs((x("a") + x("b")) / 2 - x("elder")) < 1e-8);
  assert.ok(
    x("c") < Math.min(x("a"), x("b")) || x("c") > Math.max(x("a"), x("b")),
  );
  assertInsideCanvas(layout);
});

test("new children in automatic rows follow their own parents regardless of insertion and input order", () => {
  const relatives = [person("a", 2), person("b", 2), person("c", 2)];
  const additions = [
    person("c-child", 3, { parentIds: ["c"], birthday: "2000-01-01" }),
    person("a-child", 3, { parentIds: ["a"], birthday: "2020-01-01" }),
    person("b-child", 3, { parentIds: ["b"], birthday: "2010-01-01" }),
  ];
  let expected: [string, { x: number; y: number }][] | undefined;
  for (const children of [additions, additions.toReversed()]) {
    const family = data([...relatives]);
    for (const child of children) {
      family.people.push(child);
      const layout = makeGenerationLayout(family);
      for (const p of family.people.filter((p) => p.parentIds.length)) {
        assert.ok(
          Math.abs(
            layout.nodes.get(p.id)!.x - layout.nodes.get(p.parentIds[0])!.x,
          ) < 1e-8,
          `${p.id} should stay directly below its own parent`,
        );
      }
      assertInsideCanvas(layout);
    }
    const nodes = [...makeGenerationLayout(family).nodes].sort();
    expected ??= nodes;
    assert.deepEqual(nodes, expected);
    family.people.reverse();
    family.families.reverse();
    assert.deepEqual([...makeGenerationLayout(family).nodes].sort(), expected);
  }
});
