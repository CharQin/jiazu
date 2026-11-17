import {
  birthdayError,
  birthdayParts,
  completeBirthday,
  nextLunarBirthday,
} from "./birthday.ts";
import type { BirthdayParts } from "./birthday.ts";
import { legacyDemo } from "./legacyDemo.ts";
import { synchronizeGenerations, upsertKinship } from "./kinship.ts";
import { completeKinship } from "./automaticKinship.ts";
export type Branch = "home" | "father" | "mother" | "other";
export type Gender = "male" | "female" | "other";
export const maritalStatusInfo = {
  "": "无",
  single: "未婚",
  married: "已婚",
  // Keep legacy values readable when restoring an older backup.
  divorced: "其他",
  widowed: "其他",
  other: "其他",
} as const;
export type MaritalStatus = keyof typeof maritalStatusInfo;
export const maritalStatusOptions = ["married", "single", "other"] as const;
export const editableMaritalStatus = (status?: MaritalStatus) =>
  status === "divorced" || status === "widowed" ? "other" : (status ?? "");
export interface Person {
  id: string;
  name: string;
  relation: string;
  gender: Gender;
  maritalStatus?: MaritalStatus;
  deceased?: boolean;
  birthday: string;
  birthdayParts?: BirthdayParts;
  kind?: "family" | "friend";
  friendOfId?: string;
  phone: string;
  address: string;
  occupation: string;
  note: string;
  avatar: string;
  familyId: string;
  parentIds: string[];
  siblingIds?: string[];
  inferredParentIds?: string[];
  inferredSiblingIds?: string[];
  excludedParentIds?: string[];
  excludedSiblingIds?: string[];
  layoutOrder?: number;
  parentRoles?: { father?: string; mother?: string };
  partnerId: string;
  generation: number;
  tags: string[];
}
export interface Family {
  id: string;
  name: string;
  branch: Branch;
}
export interface Memory {
  id: string;
  personId: string;
  date: string;
  kind: string;
  title: string;
  note: string;
}
export interface FamilyData {
  version: 1;
  title: string;
  selfId: string;
  people: Person[];
  families: Family[];
  memories: Memory[];
  demo: boolean;
  revision?: 2;
}
export const isFriend = (person: Person) => person.kind === "friend";
export const personName = (person: Person, selfId?: string) =>
  person.name || (person.id === selfId ? "我" : person.relation || "未命名");
export function isBlankStarter(data: FamilyData) {
  const self = data.people.find((p) => p.id === data.selfId);
  return Boolean(
    self &&
    !isFriend(self) &&
    !self.deceased &&
    self.gender === "other" &&
    self.generation === 2 &&
    [
      self.name,
      self.relation,
      self.birthday,
      self.phone,
      self.address,
      self.occupation,
      self.note,
      self.avatar,
      self.partnerId,
      self.friendOfId ?? "",
      self.maritalStatus ?? "",
    ].every((value) => !value.trim()) &&
    !self.parentIds.length &&
    !self.siblingIds?.length &&
    !self.tags.length &&
    (!self.birthdayParts ||
      Object.values(self.birthdayParts).every((value) => !value)) &&
    !data.people.some(
      (p) =>
        p.id !== self.id &&
        (p.parentIds.includes(self.id) ||
          p.siblingIds?.includes(self.id) ||
          p.partnerId === self.id ||
          p.friendOfId === self.id),
    ) &&
    !data.memories.some((m) => m.personId === self.id),
  );
}
export function visibleFamilyMembers(data: FamilyData) {
  // Older versions left an unused starting anchor beside the first real member.
  // Keep the reference in the backup while removing its empty card from the UI.
  return isBlankStarter(data) &&
    data.people.some((p) => p.id !== data.selfId && !isFriend(p))
    ? data.people.filter((p) => p.id !== data.selfId)
    : data.people;
}
export function familyHead(familyId: string, people: readonly Person[]) {
  function birthOrder(person: Person) {
    const parts = person.birthdayParts ?? birthdayParts(person.birthday);
    if (parts.year.length !== 4) return [Infinity, Infinity, Infinity];
    return [
      Number(parts.year),
      parts.month ? Number(parts.month) : Infinity,
      parts.day ? Number(parts.day) : Infinity,
    ];
  }
  return people
    .filter(
      (p) =>
        p.familyId === familyId && !isFriend(p) && !p.deceased && p.name.trim(),
    )
    .sort((a, b) => {
      if (a.generation !== b.generation) return a.generation - b.generation;
      const left = birthOrder(a),
        right = birthOrder(b);
      for (let i = 0; i < left.length; i++)
        if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
      return a.id.localeCompare(b.id);
    })[0];
}
export function familyName(
  family: Pick<Family, "id">,
  people: readonly Person[],
) {
  const head = familyHead(family.id, people);
  if (head) return `${head.name.trim()}一家`;
  const relatives = people.filter(
    (p) => p.familyId === family.id && !isFriend(p),
  );
  return relatives.some((p) => p.name.trim()) &&
    relatives.every((p) => p.deceased)
    ? "纪念家庭"
    : "";
}
export const branchInfo: Record<
  Branch,
  { label: string; color: string; light: string }
> = {
  home: { label: "我的小家", color: "#538c66", light: "#eaf3e7" },
  father: { label: "爸爸这边", color: "#be8a55", light: "#faf0e2" },
  mother: { label: "妈妈这边", color: "#8b7ac3", light: "#f0ecfa" },
  other: { label: "其他亲人", color: "#c67e89", light: "#faecef" },
};
export const generationNames = ["祖辈", "父母辈", "同辈", "子女辈", "孙辈"];
export const uid = () => crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function age(birthday: string) {
  if (!birthday) return null;
  const b = new Date(birthday + "T00:00:00"),
    n = new Date();
  if (Number.isNaN(b.getTime())) return null;
  return (
    n.getFullYear() -
    b.getFullYear() -
    (n.getMonth() < b.getMonth() ||
    (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())
      ? 1
      : 0)
  );
}
export function ageLabel(
  person: Pick<Person, "birthday" | "birthdayParts" | "deceased">,
) {
  if (person.deceased) return "";
  const years = age(person.birthday);
  if (years !== null) return `${years}岁`;
  const year = person.birthdayParts?.year;
  return year?.length === 4
    ? `约${new Date().getFullYear() - Number(year)}岁`
    : "";
}
export function upcomingBirthdays(people: Person[], now = new Date()) {
  return people
    .filter((p) => p.birthday && !p.deceased && !isFriend(p))
    .flatMap((person) => {
      const next = nextLunarBirthday(person.birthday, now);
      return next ? [{ person, ...next }] : [];
    })
    .sort((a, b) => a.days - b.days);
}
export function createEmpty(name = "", title = ""): FamilyData {
  const selfId = uid(),
    familyId = uid();
  return {
    version: 1,
    title,
    selfId,
    demo: false,
    revision: 2,
    people: [
      {
        id: selfId,
        name,
        relation: "",
        gender: "other",
        familyId,
        generation: 2,
        birthday: "",
        phone: "",
        address: "",
        occupation: "",
        note: "",
        avatar: "",
        parentIds: [],
        partnerId: "",
        tags: [],
        kind: "family",
        friendOfId: "",
      },
    ],
    families: [{ id: familyId, name: "", branch: "home" }],
    memories: [],
  };
}
export function saveFamilyPerson(
  data: FamilyData,
  draft: Person,
  newFamily?: { branch: Branch },
  childIds?: readonly string[],
): FamilyData {
  const familyId = newFamily ? uid() : draft.familyId;
  const person: Person = {
    ...draft,
    name: draft.name.trim(),
    familyId,
    friendOfId: newFamily ? "" : draft.friendOfId,
    ...(draft.id === data.selfId
      ? { relation: "", kind: "family" as const }
      : {}),
  };
  const people = synchronizeGenerations(
    upsertKinship(data.people, person, childIds),
    data.selfId,
    person.id,
  );
  return validateData({
    ...data,
    families: newFamily
      ? [...data.families, { id: familyId, name: "", branch: newFamily.branch }]
      : data.families,
    people,
  });
}
export function completeFamilyRelations(data: FamilyData): FamilyData {
  let people = completeKinship(data.people);
  for (const p of people) {
    const original = data.people.find((other) => other.id === p.id)!;
    if (
      p.parentIds.join() !== original.parentIds.join() ||
      p.siblingIds?.join() !== original.siblingIds?.join()
    )
      people = synchronizeGenerations(people, data.selfId, p.id);
  }
  return { ...data, people };
}
export function relationshipPath(data: FamilyData, to: string): Person[] {
  const queue: string[][] = [[data.selfId]],
    visited = new Set<string>([data.selfId]);
  while (queue.length) {
    const path = queue.shift()!,
      id = path[path.length - 1];
    if (id === to) return path.map((v) => data.people.find((p) => p.id === v)!);
    const p = data.people.find((x) => x.id === id);
    if (!p) continue;
    const adjacent = [
      ...p.parentIds,
      ...(p.siblingIds ?? []),
      p.partnerId,
      ...data.people
        .filter(
          (x) =>
            x.parentIds.includes(id) ||
            x.partnerId === id ||
            x.siblingIds?.includes(id),
        )
        .map((x) => x.id),
    ].filter(Boolean);
    for (const next of adjacent)
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
  }
  return [];
}
export function validateData(value: unknown): FamilyData {
  const d = value as FamilyData;
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.people) ||
    !Array.isArray(d.families) ||
    !Array.isArray(d.memories) ||
    typeof d.title !== "string" ||
    !d.people.length ||
    !d.families.length ||
    d.people.length > 5000
  )
    throw new Error("这不是有效的「家族」备份文件");
  const textFields = [
    "id",
    "name",
    "relation",
    "birthday",
    "phone",
    "address",
    "occupation",
    "note",
    "avatar",
    "familyId",
    "partnerId",
  ] as const;
  const ids = new Set(d.people.map((p) => p.id)),
    familyIds = new Set(d.families.map((f) => f.id));
  if (
    ids.size !== d.people.length ||
    familyIds.size !== d.families.length ||
    !ids.has(d.selfId)
  )
    throw new Error("备份中的人员信息不完整");
  if (
    !d.families.every(
      (f) =>
        typeof f.id === "string" &&
        f.id.length > 0 &&
        typeof f.name === "string" &&
        Object.hasOwn(branchInfo, f.branch),
    )
  )
    throw new Error("备份中的家庭信息不完整");
  for (const p of d.people) {
    if (
      !textFields.every((k) => typeof p[k] === "string") ||
      !["male", "female", "other"].includes(p.gender) ||
      !Number.isInteger(p.generation) ||
      p.generation < 0 ||
      p.generation > 4 ||
      !familyIds.has(p.familyId) ||
      !Array.isArray(p.tags) ||
      !p.tags.every((t) => typeof t === "string") ||
      !Array.isArray(p.parentIds) ||
      p.parentIds.length > 2 ||
      !p.parentIds.every((x) => ids.has(x) && x !== p.id) ||
      (p.partnerId && (!ids.has(p.partnerId) || p.partnerId === p.id))
    )
      throw new Error("备份中的人员关系格式有误");
    if (!p.id || new Set(p.parentIds).size !== p.parentIds.length)
      throw new Error("父母关系重复或人员编号无效");
    if (
      p.layoutOrder !== undefined &&
      (typeof p.layoutOrder !== "number" || !Number.isFinite(p.layoutOrder))
    )
      throw new Error("人物排序格式有误");
    for (const field of [
      "inferredParentIds",
      "inferredSiblingIds",
      "excludedParentIds",
      "excludedSiblingIds",
    ] as const) {
      const links = p[field];
      if (
        links !== undefined &&
        (!Array.isArray(links) ||
          new Set(links).size !== links.length ||
          links.some(
            (id) =>
              typeof id !== "string" ||
              !ids.has(id) ||
              id === p.id ||
              isFriend(d.people.find((other) => other.id === id)!) ||
              (field === "inferredParentIds" && !p.parentIds.includes(id)) ||
              (field === "inferredSiblingIds" && !p.siblingIds?.includes(id)),
          ))
      )
        throw new Error("自动亲属关系格式有误");
    }
    if (
      p.siblingIds !== undefined &&
      (!Array.isArray(p.siblingIds) ||
        new Set(p.siblingIds).size !== p.siblingIds.length ||
        p.siblingIds.some(
          (id) =>
            typeof id !== "string" ||
            !ids.has(id) ||
            id === p.id ||
            id === p.partnerId ||
            p.parentIds.includes(id) ||
            d.people
              .find((other) => other.id === id)
              ?.parentIds.includes(p.id) ||
            isFriend(d.people.find((other) => other.id === id)!),
        ))
    )
      throw new Error("兄弟姐妹的连接有误，不能与父母、儿女或伴侣重复");
    if (p.kind && p.kind !== "family" && p.kind !== "friend")
      throw new Error("成员类型有误");
    if (p.deceased !== undefined && typeof p.deceased !== "boolean")
      throw new Error("离世状态格式有误");
    if (
      p.maritalStatus !== undefined &&
      !Object.hasOwn(maritalStatusInfo, p.maritalStatus)
    )
      throw new Error("婚姻状况格式有误");
    if (p.parentRoles !== undefined) {
      if (
        !p.parentRoles ||
        typeof p.parentRoles !== "object" ||
        ![p.parentRoles.father, p.parentRoles.mother].every(
          (id) =>
            id === undefined ||
            id === "" ||
            (typeof id === "string" && p.parentIds.includes(id)),
        ) ||
        (p.parentRoles.father && p.parentRoles.father === p.parentRoles.mother)
      )
        throw new Error("父亲和母亲的连接有误");
    }
    if (p.friendOfId !== undefined && typeof p.friendOfId !== "string")
      throw new Error("朋友关联的家人有误");
    if (
      isFriend(p) &&
      (p.id === d.selfId ||
        p.parentIds.length ||
        p.partnerId ||
        p.siblingIds?.length)
    )
      throw new Error("朋友不参与亲属辈分关系");
    if (p.friendOfId) {
      const host = d.people.find((x) => x.id === p.friendOfId);
      if (
        !isFriend(p) ||
        !host ||
        isFriend(host) ||
        host.familyId !== p.familyId
      )
        throw new Error("朋友关联的家人有误");
    }
    if (
      p.parentIds.some((id) => isFriend(d.people.find((x) => x.id === id)!)) ||
      (p.partnerId && isFriend(d.people.find((x) => x.id === p.partnerId)!))
    )
      throw new Error("朋友不能作为亲属关系的父母或伴侣");
    if (p.avatar && !/^data:image\/(png|jpeg|webp);base64,/.test(p.avatar))
      p.avatar = "";
    if (
      p.birthday &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(p.birthday) ||
        new Date(p.birthday + "T00:00:00").toString() === "Invalid Date" ||
        new Date(p.birthday + "T00:00:00").getDate() !==
          Number(p.birthday.slice(8)) ||
        p.birthday > today())
    )
      throw new Error("请填写有效的出生日期");
    if (p.birthdayParts) {
      const parts = p.birthdayParts;
      if (
        ![parts.year, parts.month, parts.day].every(
          (v) => typeof v === "string",
        ) ||
        birthdayError(parts)
      )
        throw new Error("请填写有效的出生日期");
      if (completeBirthday(parts) !== p.birthday)
        throw new Error("生日年月日不一致");
    }
    if (
      p.partnerId &&
      (p.parentIds.includes(p.partnerId) ||
        d.people.find((x) => x.id === p.partnerId)!.parentIds.includes(p.id))
    )
      throw new Error("父母或子女不能同时关联为伴侣");
  }
  const done = new Set<string>(),
    stack = new Set<string>();
  function visit(id: string) {
    if (stack.has(id)) throw new Error("父母关系存在循环，请检查备份");
    if (done.has(id)) return;
    stack.add(id);
    d.people.find((p) => p.id === id)!.parentIds.forEach(visit);
    stack.delete(id);
    done.add(id);
  }
  d.people.forEach((p) => visit(p.id));
  for (const p of d.people)
    if (p.siblingIds?.length) synchronizeGenerations(d.people, d.selfId, p.id);
  if (
    !d.memories.every(
      (m) =>
        typeof m.id === "string" &&
        typeof m.personId === "string" &&
        (!m.personId || ids.has(m.personId)) &&
        ["date", "kind", "title", "note"].every(
          (k) => typeof m[k as keyof Memory] === "string",
        ) &&
        (!m.date || /^\d{4}-\d{2}-\d{2}$/.test(m.date)),
    )
  )
    throw new Error("往来记录格式有误");
  return { ...d, demo: Boolean(d.demo) };
}
function fingerprint(value: unknown) {
  let hash = 2166136261;
  for (const char of JSON.stringify(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export function migrateData(data: FamilyData): FamilyData {
  if (data.revision === 2)
    return {
      ...data,
      people: data.people.map((p) =>
        p.id === data.selfId ? { ...p, relation: "" } : p,
      ),
    };
  if (!data.demo)
    return {
      ...data,
      revision: 2,
      people: data.people.map((p) =>
        p.id === data.selfId ? { ...p, relation: "" } : p,
      ),
    };
  const samples = legacyDemo.people as Record<
    string,
    { hash: number; fields: Record<string, number> }
  >;
  const sampleMemories = legacyDemo.memories as Record<
    string,
    { hash: number; fields: Record<string, number> }
  >;
  const memories = data.memories
    .filter(
      (m) =>
        !sampleMemories[m.id] ||
        fingerprint([m.personId, m.date, m.kind, m.title, m.note]) !==
          sampleMemories[m.id].hash,
    )
    .map((m) => {
      const sample = sampleMemories[m.id];
      if (!sample) return m;
      return Object.fromEntries(
        Object.entries(m).map(([k, v]) => [
          k,
          sample.fields[k] === fingerprint(v) ? "" : v,
        ]),
      ) as unknown as Memory;
    });
  const customized = data.people.filter(
    (p) =>
      !samples[p.id] ||
      fingerprint(legacyDemo.fields.map((k) => p[k as keyof Person])) !==
        samples[p.id].hash,
  );
  const retained = new Set([
    data.selfId,
    ...customized.map((p) => p.id),
    ...memories.map((m) => m.personId).filter(Boolean),
  ]);
  // Keep anonymous anchors for relationships the user has already recorded.
  const queue = [...customized];
  const visited = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const person = queue[i];
    if (visited.has(person.id)) continue;
    visited.add(person.id);
    for (const id of [
      ...person.parentIds,
      ...(person.siblingIds ?? []),
      person.partnerId,
      person.friendOfId,
    ].filter(Boolean)) {
      const linked = data.people.find((p) => p.id === id);
      if (linked) {
        retained.add(linked.id);
        queue.push(linked);
      }
    }
  }
  const people = data.people
    .filter((p) => retained.has(p.id))
    .map((p) => {
      const sample = samples[p.id];
      if (!sample) return p;
      const clean = Object.fromEntries(
        Object.entries(p).map(([k, v]) => [
          k,
          sample.fields[k] === fingerprint(v)
            ? k === "tags"
              ? []
              : k === "gender"
                ? "other"
                : ""
            : v,
        ]),
      ) as unknown as Person;
      if (clean.birthdayParts)
        clean.birthdayParts = birthdayParts(clean.birthday);
      return clean;
    });
  const ids = new Set(people.map((p) => p.id));
  return {
    ...data,
    demo: false,
    revision: 2,
    title: fingerprint(data.title) === legacyDemo.title ? "" : data.title,
    people: people.map((p) => ({
      ...p,
      relation: p.id === data.selfId ? "" : p.relation,
      parentIds: p.parentIds.filter((id) => ids.has(id)),
      ...(p.siblingIds
        ? { siblingIds: p.siblingIds.filter((id) => ids.has(id)) }
        : {}),
      partnerId: ids.has(p.partnerId) ? p.partnerId : "",
    })),
    families: data.families
      .filter((f) => people.some((p) => p.familyId === f.id))
      .map((f) => ({
        ...f,
        name:
          fingerprint(f.name) ===
          (legacyDemo.families as Record<string, number>)[f.id]
            ? ""
            : f.name,
      })),
    memories,
  };
}
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("jiazu-local", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function readData(): Promise<FamilyData | null> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("data")
      .objectStore("data")
      .get("family");
    request.onsuccess = () => {
      try {
        resolve(
          request.result
            ? validateData(
                completeFamilyRelations(
                  migrateData(validateData(request.result)),
                ),
              )
            : null,
        );
      } catch (e) {
        reject(e);
      }
    };
    request.onerror = () => reject(request.error);
  });
}
export async function writeData(data: FamilyData) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("data", "readwrite");
    transaction.objectStore("data").put(data, "family");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
