import type { FamilyData, Person, Gender } from "../src/model.ts";

function person(
  id: string,
  name: string,
  relation: string,
  gender: Gender,
  familyId: string,
  generation: number,
  extra: Partial<Person> = {},
): Person {
  return {
    id,
    name,
    relation,
    gender,
    familyId,
    generation,
    birthday: "",
    phone: "",
    address: "浙江 · 杭州",
    occupation: "",
    note: "",
    avatar: "",
    parentIds: [],
    partnerId: "",
    tags: [],
    ...extra,
  };
}
export function createDemo(): FamilyData {
  return {
    version: 1,
    title: "林家的小宇宙",
    selfId: "me",
    demo: true,
    families: [
      { id: "home", name: "我的小家", branch: "home" },
      { id: "parents", name: "爸爸妈妈的家", branch: "home" },
      { id: "grandparents", name: "爷爷奶奶的家", branch: "father" },
      { id: "uncle", name: "大伯一家", branch: "father" },
      { id: "aunt", name: "姑姑一家", branch: "father" },
      { id: "maternal", name: "外公外婆的家", branch: "mother" },
      { id: "m-uncle", name: "舅舅一家", branch: "mother" },
    ],
    people: [
      person("me", "林予安", "我", "male", "home", 2, {
        birthday: "1993-06-16",
        parentIds: ["dad", "mom"],
        partnerId: "wife",
        occupation: "产品设计师",
        tags: ["喜欢摄影", "周末下厨"],
        note: "从我的小家出发，慢慢记住大家庭里的每一个人。",
      }),
      person("wife", "苏禾", "妻子", "female", "home", 2, {
        birthday: "1994-12-03",
        partnerId: "me",
        occupation: "建筑设计师",
        tags: ["爱花草", "咖啡"],
        note: "喜欢绣球花，咖啡喝热拿铁。",
      }),
      person("kid", "林小满", "女儿", "female", "home", 3, {
        birthday: "2021-05-21",
        parentIds: ["me", "wife"],
        tags: ["小画家"],
        note: "最喜欢画小猫，也喜欢听爷爷讲故事。",
      }),
      person("dad", "林建国", "爸爸", "male", "parents", 1, {
        birthday: "1963-12-08",
        parentIds: ["grandpa", "grandma"],
        partnerId: "mom",
        occupation: "退休教师",
        phone: "13800000001",
        address: "浙江省杭州市 · 西湖区",
        tags: ["爱喝茶", "喜欢钓鱼"],
        note: "喜欢喝龙井茶，平时爱去西湖边散步。每周末记得打个电话，聊聊最近的生活。",
      }),
      person("mom", "陈淑兰", "妈妈", "female", "parents", 1, {
        birthday: "1966-03-18",
        parentIds: ["m-grandpa", "m-grandma"],
        partnerId: "dad",
        occupation: "退休医师",
        tags: ["园艺", "拿手红烧肉"],
        note: "家里的花草都照顾得很好，最开心的事是大家一起吃饭。",
      }),
      person("grandpa", "林文山", "爷爷", "male", "grandparents", 0, {
        birthday: "1939-09-12",
        partnerId: "grandma",
        tags: ["书法"],
        note: "过节回家，陪爷爷写写字、下下棋。",
      }),
      person("grandma", "赵桂兰", "奶奶", "female", "grandparents", 0, {
        birthday: "1941-01-22",
        partnerId: "grandpa",
        tags: ["爱听越剧"],
      }),
      person("uncle", "林建华", "大伯", "male", "uncle", 1, {
        birthday: "1960-08-09",
        parentIds: ["grandpa", "grandma"],
        partnerId: "aunt-in-law",
        occupation: "工程师",
      }),
      person("aunt-in-law", "王秀芝", "伯母", "female", "uncle", 1, {
        birthday: "1962-04-16",
        partnerId: "uncle",
      }),
      person("cousin", "林沐", "堂姐", "female", "uncle", 2, {
        birthday: "1990-11-23",
        parentIds: ["uncle", "aunt-in-law"],
        occupation: "插画师",
        tags: ["手作", "旅行"],
      }),
      person("aunt", "林婉秋", "姑姑", "female", "aunt", 1, {
        birthday: "1968-10-02",
        parentIds: ["grandpa", "grandma"],
        partnerId: "aunt-husband",
      }),
      person("aunt-husband", "周明远", "姑父", "male", "aunt", 1, {
        partnerId: "aunt",
        occupation: "中学教师",
      }),
      person("aunt-kid", "周可", "表弟", "male", "aunt", 2, {
        birthday: "1998-07-19",
        parentIds: ["aunt", "aunt-husband"],
        occupation: "软件工程师",
      }),
      person("m-grandpa", "陈松年", "外公", "male", "maternal", 0, {
        birthday: "1940-02-05",
        partnerId: "m-grandma",
      }),
      person("m-grandma", "许静萍", "外婆", "female", "maternal", 0, {
        birthday: "1943-06-27",
        partnerId: "m-grandpa",
        tags: ["做点心"],
      }),
      person("m-uncle", "陈向东", "舅舅", "male", "m-uncle", 1, {
        birthday: "1970-03-08",
        parentIds: ["m-grandpa", "m-grandma"],
        partnerId: "m-aunt",
      }),
      person("m-aunt", "刘芳", "舅妈", "female", "m-uncle", 1, {
        birthday: "1972-09-25",
        partnerId: "m-uncle",
      }),
      person("m-cousin", "陈一诺", "表妹", "female", "m-uncle", 2, {
        birthday: "2000-04-12",
        parentIds: ["m-uncle", "m-aunt"],
        occupation: "研究生",
        tags: ["爱音乐"],
      }),
    ],
    memories: [
      {
        id: "memory1",
        personId: "dad",
        date: "2026-11-15",
        kind: "通话",
        title: "周末，听爸爸说说家常",
        note: "爸爸说最近天气凉了，让我们多穿一点。约好了下周末一起吃饭。",
      },
      {
        id: "memory2",
        personId: "mom",
        date: "2026-11-08",
        kind: "见面",
        title: "回家吃妈妈做的红烧肉",
        note: "一家人围在一起吃饭，小满给奶奶画了一朵花。",
      },
      {
        id: "memory3",
        personId: "grandpa",
        date: "2026-10-01",
        kind: "节日",
        title: "国庆，一大家子的团圆饭",
        note: "给爷爷带了一盒茶叶，大家一起拍了全家福。",
      },
    ],
  };
}

// Synthetic reconstruction of the reported aunt/cousins layout, including a
// couple whose records were saved in different households.
export function createBranchDemo(): FamilyData {
  return {
    version: 1,
    title: "分支排版验证",
    selfId: "me",
    demo: false,
    memories: [],
    families: [
      { id: "home", name: "", branch: "home" },
      { id: "aunt", name: "", branch: "mother" },
      { id: "maternal", name: "", branch: "mother" },
      { id: "paternal", name: "", branch: "father" },
    ],
    people: [
      person("me", "", "", "male", "home", 2, { parentIds: ["dad", "mom"] }),
      person("brother", "弟弟", "弟弟", "male", "home", 2, {
        parentIds: ["dad", "mom"],
      }),
      person("dad", "父亲", "爸爸", "male", "home", 1, {
        parentIds: ["grandpa"],
        partnerId: "mom",
      }),
      person("mom", "母亲", "妈妈", "female", "home", 1, {
        parentIds: ["m-grandpa", "m-grandma"],
        partnerId: "dad",
      }),
      person("grandpa", "爷爷", "爷爷", "male", "paternal", 0),
      person("m-grandpa", "外公", "外公", "male", "maternal", 0, {
        partnerId: "m-grandma",
      }),
      person("m-grandma", "外婆", "外婆", "female", "maternal", 0, {
        partnerId: "m-grandpa",
      }),
      person("aunt", "小姨", "小姨", "female", "aunt", 1, {
        parentIds: ["m-grandpa", "m-grandma"],
        partnerId: "aunt-husband",
      }),
      person("aunt-husband", "小姨夫", "小姨夫", "male", "home", 1, {
        partnerId: "aunt",
      }),
      ...["cousin1", "cousin2", "cousin3"].map((id, i) =>
        person(id, `表弟${i + 1}`, "表弟", "male", "aunt", 2, {
          birthday: `200${i}-01-01`,
          parentIds: ["aunt", "aunt-husband"],
        }),
      ),
    ].map((p) => ({ ...p, address: "" })),
  };
}
