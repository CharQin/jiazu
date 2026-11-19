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
test("friends each get a card beside their specific host, keeping partners adjacent", () => {
  const data = createDemo();
  const [me, wife] = data.people;
  const kid = data.people.find((p) => p.id === "kid")!;
  function addFriend(id: string, host: typeof me) {
    data.people.push({
      ...host,
      id,
      kind: "friend",
      friendOfId: host.id,
      parentIds: [],
      partnerId: "",
      generation: 0,
    });
  }
  addFriend("my-friend", me);
  addFriend("my-other-friend", me);
  addFriend("wifes-friend", wife);
  addFriend("kids-friend", kid);
  const layout = makeGenerationLayout(data);
  const x = (id: string) => layout.nodes.get(id)!.x;
  const y = (id: string) => layout.nodes.get(id)!.y;
  assert.equal(layout.nodes.size, data.people.length);
  assert.equal(
    layout.generations.reduce((n, row) => n + row.count, 0),
    data.people.length - 4,
  );
  assert.equal(x("wife") - x("me"), 192);
  assert.equal(x("me") - x("my-friend"), 208);
  assert.equal(x("my-friend") - x("my-other-friend"), 208);
  assert.equal(x("wifes-friend") - x("wife"), 208);
  assert.equal(x("kids-friend") - x("kid"), 208);
  assert.equal(y("my-friend"), y("me"));
  assert.equal(y("wifes-friend"), y("wife"));
  assert.equal(y("kids-friend"), y("kid"));
  const kidFriend = data.people.find((p) => p.id === "kids-friend")!;
  kidFriend.friendOfId = "dad";
  const reassigned = makeGenerationLayout(data);
  assert.equal(
    reassigned.nodes.get("kids-friend")!.y,
    reassigned.nodes.get("dad")!.y,
  );
});

test("a legacy friend with no host has a visible independent card", () => {
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
  assert.ok(layout.nodes.has("friend-only"));
  assert.ok(!layout.groups.some((g) => g.familyId === "other"));
  assert.equal(layout.nodes.get(data.selfId)!.x, layout.width / 2);
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

test("a sibling-only addition joins its family instead of the edge of an unrelated row", () => {
  const data = createEmpty();
  const self = { ...data.people[0], birthday: "1990-01-01" };
  const other = {
    ...self,
    id: "unrelated",
    birthday: "2000-01-01",
    familyId: "other",
  };
  const added = {
    ...self,
    id: "added",
    birthday: "2010-01-01",
    siblingIds: [self.id],
  };
  data.people = [self, other, added];
  data.families.push({ id: "other", name: "", branch: "other" });
  const layout = makeGenerationLayout(data);
  const x = (id: string) => layout.nodes.get(id)!.x;
  assert.ok(x(self.id) < x(added.id) && x(added.id) < x(other.id));
});

test("a 100-generation tree keeps each elder and descendant on its own row", () => {
  const data = createEmpty();
  const self = data.people[0];
  data.people = Array.from({ length: 100 }, (_, i) => ({
    ...self,
    id: i === 50 ? self.id : `relative-${i}`,
    generation: i - 48,
    parentIds: !i ? [] : [i === 51 ? self.id : `relative-${i - 1}`],
  }));
  const layout = makeGenerationLayout(data);
  assert.equal(layout.generations.length, 100);
  assert.equal(layout.nodes.size, 100);
  assert.ok(layout.nodes.get("relative-0")!.y < layout.nodes.get(self.id)!.y);
  assert.ok(layout.nodes.get(self.id)!.y < layout.nodes.get("relative-99")!.y);
});

test("new great-grandparents align to where their children are placed, even across a manually reordered row", () => {
  const data = createDemo();
  const person = (id: string) => data.people.find((p) => p.id === id)!;
  const main = [...data.people.filter((p) => p.generation === 0)].sort(
    (a, b) => Number(a.id.startsWith("m-")) - Number(b.id.startsWith("m-")),
  );
  // Put the maternal grandparents to the left of the paternal grandparents.
  for (const [index, p] of [...main.slice(2), ...main.slice(0, 2)].entries())
    p.layoutOrder = index * 1024;
  const older = {
    ...person("grandpa"),
    generation: -1,
    partnerId: "",
    layoutOrder: undefined,
    parentIds: [],
  };
  person("grandpa").parentIds = ["earlier"];
  person("m-grandpa").parentIds = ["newest"];
  data.people.push({ ...older, id: "earlier" }, { ...older, id: "newest" });
  const { nodes, width } = makeGenerationLayout(data);
  const x = (id: string) => nodes.get(id)!.x;
  assert.ok(x("m-grandpa") < x("grandpa"));
  assert.ok(x("newest") < x("earlier"));
  assert.ok(
    Math.abs(x("newest") - x("m-grandpa")) <
      Math.abs(x("newest") - x("grandpa")),
  );
  assert.equal(width / 2, (x("me") + x("wife")) / 2);
});

test("a singleton with a linked parent follows its branch and an unlinked elder stays centered", () => {
  const data = createDemo();
  const person = (id: string) => data.people.find((p) => p.id === id)!;
  const oldest = {
    ...person("grandpa"),
    id: "great-grandfather",
    generation: -1,
    partnerId: "",
    parentIds: [],
  };
  person("grandpa").parentIds = [oldest.id];
  // Attach the only descendant on this row to an existing branch off center.
  const youngest = {
    ...person("kid"),
    id: "cousins-child",
    parentIds: ["m-cousin"],
  };
  data.people = data.people.filter((p) => p.id !== "kid");
  data.people.push(oldest, youngest, {
    ...oldest,
    id: "elders-friend",
    kind: "friend",
    friendOfId: oldest.id,
  });
  oldest.familyId = "ancestor";
  data.people.at(-1)!.familyId = oldest.familyId;
  data.families.push({ id: oldest.familyId, name: "", branch: "father" });
  const { nodes, width } = makeGenerationLayout(data);
  assert.equal(nodes.get(oldest.id)!.x, width / 2);
  assert.equal(nodes.get(youngest.id)!.x, nodes.get("m-cousin")!.x);
  assert.equal(nodes.get("grandpa")!.x, nodes.get(oldest.id)!.x);
  assert.ok(nodes.get("grandpa")!.x < nodes.get("m-grandpa")!.x);
  assert.ok(nodes.get("m-cousin")!.x > width / 2);
  assert.equal(nodes.get("elders-friend")!.x - width / 2, 208);
});

test("all generations share the initial ten-card width until one row needs more room", () => {
  const data = createEmpty();
  const self = data.people[0];
  data.people.push(
    { ...self, id: "elder", generation: 0 },
    { ...self, id: "younger", generation: 3 },
  );
  const initial = makeGenerationLayout(data);
  for (let i = 2; i <= 10; i++)
    data.people.push({ ...self, id: `sibling-${i}` });
  const ten = makeGenerationLayout(data);
  assert.equal(ten.width, initial.width);
  for (const group of ten.groups) {
    assert.ok(
      group.x - group.width / 2 >= 0 && group.x + group.width / 2 <= ten.width,
    );
  }
  data.people.push({ ...self, id: "sibling-11" });
  const eleven = makeGenerationLayout(data);
  assert.ok(eleven.width > ten.width);
  for (const id of ["elder", "younger"])
    assert.equal(eleven.nodes.get(id)!.x, eleven.width / 2);
  for (const group of eleven.groups) {
    assert.ok(
      group.x - group.width / 2 >= 0 &&
        group.x + group.width / 2 <= eleven.width,
    );
  }
  data.people.pop();
  assert.equal(makeGenerationLayout(data).width, initial.width);
});

test("a single child is centered under both parents and its own child stays on that branch", () => {
  const data = createDemo();
  const child = data.people.find((p) => p.id === "kid")!;
  const parent1 = data.people.find((p) => p.id === "m-cousin")!;
  const parent2 = {
    ...parent1,
    id: "cousins-partner",
    parentIds: [],
    partnerId: parent1.id,
  };
  parent1.partnerId = parent2.id;
  child.parentIds = [parent1.id, parent2.id];
  const grandchild = {
    ...child,
    id: "only-grandchild",
    generation: 4,
    parentIds: [child.id],
  };
  data.people.push(parent2, grandchild);
  const { nodes, width } = makeGenerationLayout(data);
  const x = (id: string) => nodes.get(id)!.x;
  const parentCenter = (x(parent1.id) + x(parent2.id)) / 2;
  assert.ok(Math.abs(parentCenter - width / 2) > 1);
  assert.ok(Math.abs(x(child.id) - parentCenter) < 1e-8);
  assert.ok(Math.abs(x(grandchild.id) - x(child.id)) < 1e-8);
});
