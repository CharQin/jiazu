import { createDemo, createBranchDemo } from "./fixtures.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createEmpty } from "../src/model.ts";
import { makeGenerationLayout } from "../src/treeLayout.ts";

test("every generation occupies exactly one row, in elder-to-younger order", () => {
  const data = createDemo();
  const layout = makeGenerationLayout(data);
  assert.equal(layout.nodes.size, data.people.length);
  for (const row of layout.generations) {
    const points = data.people
      .filter((p) => p.generation === row.generation)
      .map((p) => layout.nodes.get(p.id)!);
    assert.equal(points.length, row.count);
    assert.ok(points.every((p) => p.y === row.y));
    const sorted = points.toSorted((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const left = data.people.find(
        (p) => layout.nodes.get(p.id) === sorted[i - 1],
      )!;
      const right = data.people.find(
        (p) => layout.nodes.get(p.id) === sorted[i],
      )!;
      const paired = left.partnerId === right.id || right.partnerId === left.id;
      const gap = sorted[i].x - sorted[i - 1].x - 160;
      assert.ok(gap >= (paired ? 32 : 64));
    }
  }
  for (const person of data.people) {
    const position = layout.nodes.get(person.id)!;
    assert.ok(position.x >= 80 && position.x <= layout.width - 80);
    for (const parent of person.parentIds) {
      assert.ok(layout.nodes.get(parent)!.y < position.y);
    }
  }
});
test("any number of friends takes one slot beside its household", () => {
  const data = createEmpty();
  const owner = data.people[0];
  data.people.push({
    ...owner,
    id: "friend-1",
    kind: "friend",
    friendOfId: owner.id,
    generation: 0,
  });
  const first = makeGenerationLayout(data);
  for (let i = 2; i <= 25; i++)
    data.people.push({
      ...owner,
      id: `friend-${i}`,
      kind: "friend",
      friendOfId: owner.id,
      generation: 4,
    });
  const many = makeGenerationLayout(data);
  assert.deepEqual(many, first);
  assert.equal(many.nodes.size, 1);
  assert.equal(many.friendGroups.size, 1);
  assert.deepEqual(
    many.generations.map((r) => [r.generation, r.count]),
    [[2, 1]],
  );
  const bundle = many.friendGroups.get(owner.familyId)!;
  assert.equal(bundle.x - many.nodes.get(owner.id)!.x, 208);
  assert.equal(bundle.y, many.nodes.get(owner.id)!.y);
});
test("a household containing only friends still has a visible folded slot", () => {
  const data = createEmpty();
  data.families.push({ id: "other", name: "", branch: "other" });
  data.people.push({
    ...data.people[0],
    id: "friend-only",
    familyId: "other",
    kind: "friend",
    friendOfId: "",
  });
  const layout = makeGenerationLayout(data);
  assert.ok(layout.friendGroups.has("other"));
  assert.equal(layout.nodes.has("friend-only"), false);
  assert.ok(
    layout.groups.some((g) => g.familyId === "other" && g.friendAnchor),
  );
});

test("empty generations retain their own lane and cannot collapse two generations", () => {
  const data = createDemo();
  data.people = data.people.filter(
    (p) => p.generation === 0 || p.generation === 3,
  );
  const layout = makeGenerationLayout(data);
  assert.deepEqual(
    layout.generations.map((r) => r.count),
    [4, 0, 0, 1],
  );
  assert.equal(
    layout.nodes.get("kid")!.y - layout.nodes.get("grandpa")!.y,
    3 * 192,
  );
});

test("partners remain adjacent even when household input order changes", () => {
  const data = createDemo();
  const extra = {
    ...data.people[0],
    id: "sibling",
    partnerId: "",
    relation: "弟弟",
  };
  data.people.splice(1, 0, extra);
  const before = structuredClone(data);
  const layout = makeGenerationLayout(data);
  assert.equal(
    Math.abs(layout.nodes.get("me")!.x - layout.nodes.get("wife")!.x),
    192,
  );
  assert.deepEqual(data, before);
  assert.deepEqual(makeGenerationLayout(data), layout);
});

test("a new family has a centered single generation without phantom people", () => {
  const data = createEmpty("我");
  const layout = makeGenerationLayout(data);
  assert.equal(layout.nodes.size, 1);
  assert.deepEqual(
    layout.generations.map((r) => r.generation),
    [2],
  );
  assert.equal(layout.nodes.get(data.selfId)!.x, layout.width / 2);
});

test("a couple across household IDs stays centred over its three children", () => {
  const data = createBranchDemo();
  const before = structuredClone(data);
  const layout = makeGenerationLayout(data);
  const x = (id: string) => layout.nodes.get(id)!.x;
  assert.equal(x("aunt") - x("aunt-husband"), 192);
  assert.ok(
    Math.abs(
      (x("aunt") + x("aunt-husband")) / 2 - (x("cousin1") + x("cousin3")) / 2,
    ) < 1,
  );
  assert.equal(x("cousin2") - x("cousin1"), x("cousin3") - x("cousin2"));
  assert.ok(x("grandpa") < x("m-grandpa"));
  assert.deepEqual(data, before);
  data.people.reverse();
  data.families.reverse();
  assert.deepEqual(
    [...makeGenerationLayout(data).nodes].sort(),
    [...layout.nodes].sort(),
  );
});

test("shared parents stay together when four children have no partner links", () => {
  const data = createBranchDemo();
  const aunt = data.people.find((p) => p.id === "aunt")!;
  const husband = data.people.find((p) => p.id === "aunt-husband")!;
  aunt.partnerId = "";
  husband.partnerId = "";
  data.people.push({
    ...data.people.find((p) => p.id === "cousin3")!,
    id: "cousin4",
    name: "表弟4",
  });
  const layout = makeGenerationLayout(data);
  const x = (id: string) => layout.nodes.get(id)!.x;
  assert.equal(Math.abs(x("aunt") - x("aunt-husband")), 192);
  assert.ok(
    Math.abs(
      (x("aunt") + x("aunt-husband")) / 2 -
        (x("cousin1") + x("cousin2") + x("cousin3") + x("cousin4")) / 4,
    ) < 1,
  );
});

test("a newly added cousin is inserted in its parental branch even inside one large household", () => {
  const data = createDemo();
  data.people.forEach((p) => (p.familyId = "home"));
  data.families = data.families.filter((f) => f.id === "home");
  const cousin = data.people.find((p) => p.id === "cousin")!;
  data.people.push({
    ...cousin,
    id: "zz-added-cousin",
    birthday: "1992-01-01",
  });
  const layout = makeGenerationLayout(data);
  const x = (id: string) => layout.nodes.get(id)!.x;
  assert.ok(x("cousin") < x("zz-added-cousin"));
  assert.ok(x("zz-added-cousin") < x("me"));
  assert.ok(x("zz-added-cousin") < x("m-cousin"));
  assert.ok(
    Math.abs(
      (x("uncle") + x("aunt-in-law")) / 2 -
        (x("cousin") + x("zz-added-cousin")) / 2,
    ) < 1,
  );
});

test("an added sibling joins its relatives without scrambling an existing manual row", async () => {
  const { applyPersonOrder } = await import("../src/personOrdering.ts");
  const data = createDemo();
  data.people = applyPersonOrder(data.people, [
    "cousin",
    "m-cousin",
    "me",
    "wife",
    "aunt-kid",
  ]);
  data.people.push({
    ...data.people.find((p) => p.id === "cousin")!,
    id: "zz-added-cousin",
    birthday: "1992-01-01",
    layoutOrder: undefined,
  });
  const layout = makeGenerationLayout(data);
  const x = (id: string) => layout.nodes.get(id)!.x;
  assert.ok(
    x("cousin") < x("zz-added-cousin") && x("zz-added-cousin") < x("m-cousin"),
  );
  assert.ok(
    x("m-cousin") < x("me") && x("me") < x("wife") && x("wife") < x("aunt-kid"),
  );
});

test("a household member with relationships still blank stays below that household", () => {
  const data = createBranchDemo();
  const p = data.people.find((p) => p.id === "cousin1")!;
  data.people.push({
    ...p,
    id: "zz-new-home-child",
    familyId: "home",
    generation: 3,
    parentIds: [],
  });
  const layout = makeGenerationLayout(data);
  const x = (id: string) => layout.nodes.get(id)!.x;
  assert.ok(x("zz-new-home-child") >= Math.min(x("me"), x("brother")) - 1);
  assert.ok(x("zz-new-home-child") <= Math.max(x("me"), x("brother")) + 1);
});
