import {
  firstGeneration,
  generationName,
  lastGeneration,
  selfGeneration,
} from "./generations";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleHelp,
  Heart,
  Leaf,
  Pencil,
  Sprout,
  X,
} from "lucide-react";
import relationship from "relationship.js";
import { Avatar } from "./Avatar";
import { BirthdayFields } from "./BirthdayFields";
import { AvatarCropper } from "./AvatarCropper";
import { relationExclusions } from "./automaticKinship";
import { birthdayParts, birthdayError, completeBirthday } from "./birthday";
import {
  personName,
  isFriend,
  today,
  uid,
  visibleFamilyMembers,
  maritalStatusInfo,
  maritalStatusOptions,
  editableMaritalStatus,
} from "./model";
import type {
  FamilyData,
  Gender,
  MaritalStatus,
  Memory,
  Person,
} from "./model";
import { inferPlacement, parentRoles } from "./kinship";
import { siblingIdsFor } from "./familyRelations";

function RelationshipPicker({
  label,
  selected,
  candidates,
  selfId,
  onChange,
}: {
  label: string;
  selected: string[];
  candidates: Person[];
  selfId: string;
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="relationship-picker">
      <label>
        {label}
        <select
          aria-label={label}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...selected, e.target.value]);
          }}
        >
          <option value="">选择家人，可添加多位</option>
          {candidates
            .filter((p) => !selected.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {personName(p, selfId)}
                {p.relation ? `（${p.relation}）` : ""}
              </option>
            ))}
        </select>
      </label>
      {selected.length > 0 && (
        <div className="relationship-chips">
          {selected.map((id) => {
            const p = candidates.find((p) => p.id === id);
            return (
              <button
                type="button"
                key={id}
                aria-label={`取消连接${label}：${p ? personName(p, selfId) : "家人"}`}
                onClick={() =>
                  onChange(selected.filter((value) => value !== id))
                }
              >
                {p ? personName(p, selfId) : "家人"}
                <X size={12} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PersonForm({
  data,
  initial,
  defaults,
  onSave,
  onCancel,
}: {
  data: FamilyData;
  initial?: Person;
  defaults?: Partial<Pick<Person, "familyId" | "kind" | "friendOfId">>;
  onSave: (p: Person, childIds: string[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Person>(() =>
    initial
      ? {
          ...initial,
          parentIds: [...initial.parentIds],
          siblingIds: [
            ...new Set([
              ...(initial.siblingIds ?? []),
              ...data.people
                .filter((p) => p.siblingIds?.includes(initial.id))
                .map((p) => p.id),
            ]),
          ],
        }
      : {
          id: uid(),
          name: "",
          relation: "",
          gender: "other",
          birthday: "",
          phone: "",
          address: "",
          occupation: "",
          note: "",
          avatar: "",
          familyId:
            defaults?.familyId ??
            (
              visibleFamilyMembers(data).find((p) => p.id === data.selfId) ??
              visibleFamilyMembers(data).find((p) => !isFriend(p)) ??
              data.people[0]
            ).familyId,
          kind: defaults?.kind ?? "family",
          friendOfId: defaults?.friendOfId ?? "",
          parentIds: [],
          partnerId: "",
          generation: selfGeneration,
          tags: [],
        },
  );
  const [error, setError] = useState(""),
    [tagText, setTagText] = useState(initial?.tags.join("，") ?? "");
  const initialRoles = initial
    ? parentRoles(initial, data.people)
    : { father: "", mother: "" };
  const remainingParents =
    initial?.parentIds.filter(
      (id) => id !== initialRoles.father && id !== initialRoles.mother,
    ) ?? [];
  const [parent1, setParent1] = useState(
      initialRoles.father || remainingParents.shift() || "",
    ),
    [parent2, setParent2] = useState(
      initialRoles.mother || remainingParents.shift() || "",
    );
  const [birth, setBirth] = useState(
    initial?.birthdayParts ?? birthdayParts(initial?.birthday),
  );
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [childIds, setChildIds] = useState(() =>
    initial
      ? data.people
          .filter((p) => !isFriend(p) && p.parentIds.includes(initial.id))
          .map((p) => p.id)
      : [],
  );
  function change<K extends keyof Person>(key: K, value: Person[K]) {
    setDraft((p) => ({ ...p, [key]: value }));
  }
  function connect(
    father: string,
    mother: string,
    partnerId: string,
    siblingIds = draft.siblingIds ?? [],
    children = childIds,
  ) {
    setParent1(father);
    setParent2(mother);
    const connections = {
      parentIds: [father, mother].filter(Boolean),
      parentRoles: { father, mother },
      partnerId,
      siblingIds,
    };
    setChildIds(children);
    const connectedDraft = relationExclusions(
      relationExclusions(
        { ...draft, ...connections },
        "excludedParentIds",
        draft.parentIds.filter((id) => !connections.parentIds.includes(id)),
        connections.parentIds,
      ),
      "excludedSiblingIds",
      (draft.siblingIds ?? []).filter((id) => !siblingIds.includes(id)),
      siblingIds,
    );
    try {
      const placement = inferPlacement(data, connectedDraft, children, true);
      const resolved = "person" in placement ? placement.person : undefined;
      const resolvedRoles = resolved
        ? parentRoles(resolved, data.people)
        : { father, mother };
      const unassigned =
        resolved?.parentIds.filter(
          (id) => id !== resolvedRoles.father && id !== resolvedRoles.mother,
        ) ?? [];
      setParent1(resolvedRoles.father || unassigned.shift() || "");
      setParent2(resolvedRoles.mother || unassigned.shift() || "");
      setDraft((p) => ({
        ...p,
        ...connections,
        ...(resolved
          ? {
              parentIds: resolved.parentIds,
              parentRoles: resolved.parentRoles,
              siblingIds: resolved.siblingIds,
              inferredParentIds: resolved.inferredParentIds,
              inferredSiblingIds: resolved.inferredSiblingIds,
              excludedParentIds: resolved.excludedParentIds,
              excludedSiblingIds: resolved.excludedSiblingIds,
            }
          : {}),
        generation: placement.generation,
      }));
      setError("");
    } catch (e) {
      setDraft((p) => ({ ...p, ...connectedDraft }));
      setError(e instanceof Error ? e.message : "请检查亲属连接");
    }
  }
  const automaticGeneration =
    !isFriend(draft) &&
    (draft.id === data.selfId ||
      Boolean(parent1 || parent2 || draft.partnerId) ||
      Boolean(draft.siblingIds?.length || childIds.length) ||
      data.people.some((p) => !isFriend(p) && p.parentIds.includes(draft.id)));
  const candidates = visibleFamilyMembers(data).filter(
    (p) => p.id !== draft.id && !isFriend(p),
  );
  const otherGenerations = data.people
    .filter((p) => p.id !== draft.id && !isFriend(p))
    .map((p) => p.generation);
  const minGeneration =
    Math.max(selfGeneration, ...otherGenerations) -
    (lastGeneration - selfGeneration);
  const maxGeneration =
    Math.min(selfGeneration, ...otherGenerations) +
    (selfGeneration - firstGeneration);
  const generationOptions = automaticGeneration
    ? [draft.generation]
    : Array.from(
        { length: maxGeneration - minGeneration + 1 },
        (_, i) => minGeneration + i,
      );
  function photo(file?: File) {
    if (!file) return;
    try {
      if (file.size > 12 * 1024 * 1024)
        throw new Error("请选择 12 MB 以内的图片");
      setCropFile(file);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "这张图片暂时无法读取，请换一张",
      );
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      if (birthdayError(birth)) throw new Error(birthdayError(birth));
      if (!isFriend(draft) && parent1 && parent1 === parent2)
        throw new Error("两位父母不能选择同一个人");
      if (
        !isFriend(draft) &&
        ((parent1 && parent1 === draft.partnerId) ||
          (parent2 && parent2 === draft.partnerId))
      )
        throw new Error("父母和伴侣不能是同一个人");
      const value = {
        ...draft,
        name: String(
          new FormData(e.currentTarget).get("member-name") ?? draft.name,
        ).trim(),
        relation: draft.id === data.selfId ? "" : draft.relation.trim(),
        birthday: completeBirthday(birth),
        birthdayParts: birth,
        phone: draft.phone.trim(),
        parentIds: isFriend(draft) ? [] : [parent1, parent2].filter(Boolean),
        parentRoles: isFriend(draft)
          ? undefined
          : { father: parent1, mother: parent2 },
        partnerId: isFriend(draft) ? "" : draft.partnerId,
        siblingIds: isFriend(draft) ? [] : (draft.siblingIds ?? []),
        friendOfId: isFriend(draft) ? draft.friendOfId : "",
        tags: [
          ...new Set(
            tagText
              .split(/[,，、]/)
              .map((v) => v.trim())
              .filter(Boolean),
          ),
        ].slice(0, 6),
      };
      onSave(value, isFriend(draft) ? [] : childIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法保存，请检查资料");
    }
  }
  return (
    <form className="person-form" onSubmit={submit}>
      <div className="avatar-editor">
        <label>
          <Avatar person={draft} size={56} />
          <span>
            <Pencil size={12} />
          </span>
          <input
            className="visually-hidden"
            type="file"
            accept="image/*"
            aria-label="上传家人头像"
            onChange={(e) => {
              void photo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <div>
          <strong>给家人一张熟悉的面孔</strong>
          <p>点击头像，从相册选择照片</p>
          {draft.avatar && (
            <button type="button" onClick={() => change("avatar", "")}>
              恢复默认头像
            </button>
          )}
        </div>
      </div>
      <div className="form-section-title">
        <span>基本资料</span>
        <small>所有资料均可选填，随时补充</small>
      </div>
      <div className="form-grid">
        <label className={draft.id === data.selfId ? "span-two" : ""}>
          姓名
          <input
            name="member-name"
            autoComplete="off"
            maxLength={30}
            placeholder="家人的名字"
            value={draft.name}
            onChange={(e) => change("name", e.target.value)}
          />
        </label>
        {draft.id !== data.selfId && (
          <label>
            我对 TA 的称呼
            <input
              maxLength={20}
              placeholder="选填日常叫法"
              value={draft.relation}
              onChange={(e) => change("relation", e.target.value)}
            />
          </label>
        )}
        {draft.id !== data.selfId && (
          <fieldset className="type-field span-two">
            <legend>记录类型</legend>
            <div className="record-type-options">
              {(["family", "friend"] as const).map((kind) => (
                <label
                  key={kind}
                  className={(draft.kind ?? "family") === kind ? "active" : ""}
                >
                  <input
                    type="radio"
                    name="record-kind"
                    value={kind}
                    checked={(draft.kind ?? "family") === kind}
                    onChange={() => change("kind", kind)}
                  />
                  {kind === "family" ? "家人" : "朋友"}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label>
          性别
          <select
            value={draft.gender}
            onChange={(e) => change("gender", e.target.value as Gender)}
          >
            <option value="other">无</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </label>
        <div className="marital-field">
          <label htmlFor="member-marital-status">婚姻状况</label>
          {draft.maritalStatus && (
            <button
              type="button"
              className="clear-marital"
              aria-label="清空婚姻状况"
              onClick={() => change("maritalStatus", "")}
            >
              清空
            </button>
          )}
          <select
            id="member-marital-status"
            value={editableMaritalStatus(draft.maritalStatus)}
            onChange={(e) =>
              change("maritalStatus", e.target.value as MaritalStatus)
            }
          >
            <option value="" disabled>
              请选择（可留空）
            </option>
            {maritalStatusOptions.map((value) => (
              <option key={value} value={value}>
                {maritalStatusInfo[value]}
              </option>
            ))}
          </select>
        </div>
        <label className="deceased-field span-two">
          <input
            type="checkbox"
            checked={draft.deceased ?? false}
            onChange={(e) => change("deceased", e.target.checked)}
          />
          <span>
            已离世<small>选填 · 家族树以灰色纪念，不再显示年龄</small>
          </span>
        </label>
        <BirthdayFields value={birth} onChange={setBirth} />
      </div>
      {!isFriend(draft) && (
        <>
          <div className="form-section-title">
            <span>连接亲属关系</span>
            <small>按已有关系补齐连线、家庭与辈分</small>
          </div>
          <div className="form-grid">
            <label>
              父亲
              <select
                value={parent1}
                onChange={(e) =>
                  connect(e.target.value, parent2, draft.partnerId)
                }
              >
                <option value="">暂不关联</option>
                {candidates
                  .filter((p) => p.id !== parent2 && p.id !== draft.partnerId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {personName(p, data.selfId)}
                      {p.relation ? `（${p.relation}）` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              母亲
              <select
                value={parent2}
                onChange={(e) =>
                  connect(parent1, e.target.value, draft.partnerId)
                }
              >
                <option value="">暂不关联</option>
                {candidates
                  .filter((p) => p.id !== parent1 && p.id !== draft.partnerId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {personName(p, data.selfId)}
                      {p.relation ? `（${p.relation}）` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label className="span-two">
              伴侣
              <select
                value={draft.partnerId}
                onChange={(e) => connect(parent1, parent2, e.target.value)}
              >
                <option value="">暂不关联</option>
                {candidates
                  .filter((p) => p.id !== parent1 && p.id !== parent2)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {personName(p, data.selfId)}
                      {p.relation ? `（${p.relation}）` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <RelationshipPicker
              label="兄弟姐妹"
              selfId={data.selfId}
              selected={draft.siblingIds ?? []}
              candidates={candidates.filter(
                (p) =>
                  ![parent1, parent2, draft.partnerId, ...childIds].includes(
                    p.id,
                  ),
              )}
              onChange={(ids) =>
                connect(parent1, parent2, draft.partnerId, ids)
              }
            />
            <RelationshipPicker
              label="儿女"
              selfId={data.selfId}
              selected={childIds}
              candidates={candidates.filter(
                (p) =>
                  ![
                    parent1,
                    parent2,
                    draft.partnerId,
                    ...(draft.siblingIds ?? []),
                  ].includes(p.id),
              )}
              onChange={(ids) =>
                connect(
                  parent1,
                  parent2,
                  draft.partnerId,
                  draft.siblingIds ?? [],
                  ids,
                )
              }
            />
            {siblingIdsFor(
              { ...draft, parentIds: [parent1, parent2].filter(Boolean) },
              candidates,
            ).filter((id) => !draft.siblingIds?.includes(id)).length > 0 && (
              <p className="placement-hint span-two">
                已根据共同父母识别兄弟姐妹：
                {siblingIdsFor(
                  { ...draft, parentIds: [parent1, parent2].filter(Boolean) },
                  candidates,
                )
                  .filter((id) => !draft.siblingIds?.includes(id))
                  .map((id) =>
                    personName(
                      candidates.find((p) => p.id === id)!,
                      data.selfId,
                    ),
                  )
                  .join("、")}
                。
              </p>
            )}
          </div>
        </>
      )}
      <div className="form-section-title">
        <span>家庭与辈分</span>
        <small>
          {isFriend(draft)
            ? "朋友卡片会显示在关联家人旁"
            : "家庭按亲属关系自动分组"}
        </small>
      </div>
      <div className="form-grid">
        {!isFriend(draft) ? (
          <label className="span-two">
            辈分（以我为参照）
            <select
              value={draft.generation}
              disabled={automaticGeneration}
              onChange={(e) => change("generation", Number(e.target.value))}
            >
              {generationOptions.map((g) => (
                <option value={g} key={g}>
                  {generationName(g)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="span-two">
            关联家人
            <select
              value={draft.friendOfId ?? ""}
              onChange={(e) => change("friendOfId", e.target.value)}
            >
              <option value="">暂不指定</option>
              {candidates.map((p) => (
                <option value={p.id} key={p.id}>
                  {personName(p, data.selfId)}
                </option>
              ))}
            </select>
          </label>
        )}
        {!isFriend(draft) && (
          <p className="placement-hint span-two">
            {automaticGeneration
              ? "已按亲属关系自动计算辈分。"
              : "可先选辈分，连接亲属后会自动调整。"}
            已婚子女会自动独立成家。
          </p>
        )}
      </div>
      <div className="form-section-title">
        <span>再多了解一点</span>
        <Heart size={13} />
      </div>
      <div className="form-grid">
        <label>
          联系电话
          <input
            type="tel"
            inputMode="tel"
            maxLength={25}
            placeholder="方便联系的号码"
            value={draft.phone}
            onChange={(e) => change("phone", e.target.value)}
          />
        </label>
        <label>
          职业
          <input
            maxLength={40}
            placeholder="做什么工作"
            value={draft.occupation}
            onChange={(e) => change("occupation", e.target.value)}
          />
        </label>
        <label className="span-two">
          住址
          <input
            maxLength={200}
            placeholder="城市、街道或详细地址"
            value={draft.address}
            onChange={(e) => change("address", e.target.value)}
          />
        </label>
        <label className="span-two">
          兴趣与特点
          <input
            maxLength={100}
            placeholder="多个特点用逗号分隔"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
          />
        </label>
        <label className="span-two">
          关于这位家人的小事
          <textarea
            rows={3}
            maxLength={3000}
            placeholder="喜好、近况，或者下次见面想聊的话题…"
            value={draft.note}
            onChange={(e) => change("note", e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions sticky-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="button primary">
          <Check size={17} />
          保存{isFriend(draft) ? "朋友" : "家人"}资料
        </button>
      </div>
      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(avatar) => {
            change("avatar", avatar);
            setCropFile(null);
          }}
        />
      )}
    </form>
  );
}
export function MemoryForm({
  data,
  personId,
  initial,
  onSave,
}: {
  data: FamilyData;
  personId: string;
  initial?: Memory;
  onSave: (m: Memory) => void;
}) {
  const [draft, setDraft] = useState<Memory>(
    initial ?? {
      id: uid(),
      personId,
      date: "",
      kind: "",
      title: "",
      note: "",
    },
  );
  return (
    <form
      className="memory-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...draft, title: draft.title.trim() });
      }}
    >
      <p className="form-intro">把一次普通的联络，留成一份温暖的记忆。</p>
      <div className="form-grid">
        <label>
          和哪位家人
          <select
            value={draft.personId}
            onChange={(e) => setDraft({ ...draft, personId: e.target.value })}
          >
            <option value="">暂不关联</option>
            {visibleFamilyMembers(data).map((p) => (
              <option key={p.id} value={p.id}>
                {personName(p, data.selfId)}
                {p.relation ? `（${p.relation}）` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          发生的日期
          <input
            type="date"
            max={today()}
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </label>
      </div>
      <label className="field-label">是哪一种相聚</label>
      <div className="memory-types">
        {["见面", "通话", "礼物", "节日", "其他"].map((k) => (
          <button
            type="button"
            key={k}
            className={draft.kind === k ? "active" : ""}
            onClick={() => setDraft({ ...draft, kind: k })}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label className="span-two">
          往来标题
          <input
            maxLength={80}
            placeholder="选填"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="span-two">
          想记住的细节
          <textarea
            rows={5}
            maxLength={5000}
            placeholder="聊了什么、送了什么、下次还想一起做什么…"
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </label>
      </div>
      <button type="submit" className="button primary full-width">
        <Check size={17} />
        把这份牵挂记下来
      </button>
    </form>
  );
}
export function Calculator({ gender }: { gender: Gender }) {
  const [steps, setSteps] = useState<string[]>([]),
    [sex, setSex] = useState(gender === "female" ? 0 : 1);
  const result = steps.length
    ? relationship({ text: steps.join("的"), sex, type: "default" })
    : [];
  return (
    <div className="calculator">
      <p className="form-intro">从“我”出发，一步一步找到合适的称呼。</p>
      <div className="calculator-sex">
        <span>我的性别</span>
        <button className={sex === 1 ? "active" : ""} onClick={() => setSex(1)}>
          男
        </button>
        <button className={sex === 0 ? "active" : ""} onClick={() => setSex(0)}>
          女
        </button>
      </div>
      <div className="calculator-chain">
        <span>我</span>
        {steps.map((s, i) => (
          <span key={i}>
            <ChevronRight size={12} />
            {s}
          </span>
        ))}
        {!steps.length && <small>选择下方的亲属关系</small>}
      </div>
      <div className="calculator-result">
        <span>可以这样称呼</span>
        <strong>
          {result.length
            ? result.join(" / ")
            : steps.length
              ? "暂未找到对应称谓"
              : "亲人"}
        </strong>
        <Leaf size={32} strokeWidth={1} />
      </div>
      <div className="kinship-buttons">
        {[
          "爸爸",
          "妈妈",
          "老公",
          "老婆",
          "哥哥",
          "弟弟",
          "姐姐",
          "妹妹",
          "儿子",
          "女儿",
        ].map((s) => (
          <button
            key={s}
            disabled={steps.length >= 8}
            onClick={() => setSteps([...steps, s])}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="calculator-actions">
        <button
          onClick={() => setSteps(steps.slice(0, -1))}
          disabled={!steps.length}
        >
          <ArrowLeft size={15} />
          退一步
        </button>
        <button onClick={() => setSteps([])} disabled={!steps.length}>
          重新开始
        </button>
      </div>
      <p className="calculator-note">
        <CircleHelp size={14} />
        按普通话常见称谓计算。长幼、地域叫法不同，可在家人资料中填写你习惯的称呼。
      </p>
    </div>
  );
}
export function StartForm({
  demo,
  onSave,
}: {
  demo: boolean;
  onSave: (name: string, title: string) => void;
}) {
  const [name, setName] = useState(""),
    [title, setTitle] = useState("");
  return (
    <form
      className="start-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name.trim(), title.trim());
      }}
    >
      <div className="start-illustration">
        <Sprout size={58} strokeWidth={1.2} />
        <Heart size={18} />
      </div>
      <h3>给每一份亲近，留一个位置。</h3>
      <p>
        {demo
          ? "创建后将移除当前示例，留下属于你的空白家谱。"
          : "创建后将替换当前全部家人、头像、关系和往来记录，请先在“我的”页面导出备份。"}
      </p>
      <div className="form-grid">
        <label className="span-two">
          姓名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="选填"
          />
        </label>
        <label className="span-two">
          家族名称
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={24}
          />
        </label>
      </div>
      <button className="button primary full-width" type="submit">
        <Sprout size={17} />
        替换并建立空白家族
      </button>
    </form>
  );
}
