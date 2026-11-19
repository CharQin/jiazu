import { automaticHouseholds } from "./households";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  BookHeart,
  Cake,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Coffee,
  Database,
  Ellipsis,
  GitBranch,
  Heart,
  Home,
  Leaf,
  Network,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Avatar } from "./Avatar";
import { FamilyMap } from "./FamilyMap";
import { Brand, Confirmation, Empty, Profile, Sheet } from "./components";
import { Calculator, MemoryForm, PersonForm, StartForm } from "./forms";
import {
  branchInfo,
  createEmpty,
  personName,
  familyName,
  migrateData,
  isFriend,
  readData,
  today,
  upcomingBirthdays,
  validateData,
  writeData,
  saveFamilyPerson,
  isBlankStarter,
  visibleFamilyMembers,
  completeFamilyRelations,
} from "./model";
import type { Branch, FamilyData, Memory, Person } from "./model";
import { deriveBranches } from "./kinship";
import { applyPersonOrder } from "./personOrdering";
import {
  normalizeSaturation,
  readSaturation,
  saturationKey,
} from "./displaySettings";
import "./App.css";

type Route = "map" | "people" | "memories" | "settings";
type Modal =
  "person" | "memory" | "calculator" | "start" | "confirm" | "display" | null;
const navigation = [
  { id: "map" as const, label: "家族关系", short: "家族", icon: Network },
  { id: "people" as const, label: "家人名册", short: "家人", icon: Users },
  {
    id: "memories" as const,
    label: "往来记事",
    short: "往来",
    icon: BookHeart,
  },
  { id: "settings" as const, label: "我的家族", short: "我的", icon: Home },
];

export default function App() {
  const [data, setStoredData] = useState<FamilyData | null>(null),
    [loadError, setLoadError] = useState("");
  const [route, setRoute] = useState<Route>("map"),
    [tree, setTree] = useState(true);
  const [filter, setFilter] = useState<Branch | "all">("all"),
    [query, setQuery] = useState(""),
    [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("me"),
    [profileOpen, setProfileOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null),
    [editingPerson, setEditingPerson] = useState<Person>(),
    [editingMemory, setEditingMemory] = useState<Memory>(),
    [memoryPersonId, setMemoryPersonId] = useState("");
  const [personDefaults, setPersonDefaults] = useState<
    Partial<Pick<Person, "familyId" | "kind" | "friendOfId">>
  >({});
  const [personFormVersion, setPersonFormVersion] = useState(0);
  const [saturation, setSaturation] = useState(readSaturation);
  useEffect(() => {
    try {
      localStorage.setItem(saturationKey, String(saturation));
    } catch {
      /* Keep the live preference if storage is unavailable. */
    }
  }, [saturation]);
  const [birthdayDay, setBirthdayDay] = useState(() =>
    Math.floor((Date.now() + 8 * 3_600_000) / 86_400_000),
  );
  const birthdays = useMemo(
    () =>
      data
        ? upcomingBirthdays(
            visibleFamilyMembers(data),
            new Date(birthdayDay * 86_400_000),
          )
        : [],
    [data, birthdayDay],
  );
  const [focusId, setFocusId] = useState(""),
    [mapVersion, setMapVersion] = useState(0),
    [fullMap, setFullMap] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "error">(
      "saved",
    ),
    [toast, setToast] = useState("");
  const [confirmation, setConfirmation] = useState({
    title: "",
    text: "",
    label: "确认",
    danger: false,
  });
  const confirmAction = useRef<() => void>(() => {}),
    importInput = useRef<HTMLInputElement>(null),
    initialLoad = useRef(true);
  function setData(next: FamilyData) {
    const organized = automaticHouseholds(completeFamilyRelations(next));
    setSaveStatus("saving");
    setStoredData(organized);
  }
  async function load() {
    try {
      const saved = await readData(),
        value = saved ?? createEmpty();
      setLoadError("");
      setData(value);
      setSelectedId(value.selfId);
      initialLoad.current = false;
    } catch {
      setLoadError("暂时无法读取本机资料。请保留应用数据，重试后再继续。");
    }
  }
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Initial state is loaded asynchronously from IndexedDB.
    void load();
  }, []);
  useEffect(() => {
    if (!data || initialLoad.current) return;
    let active = true;
    writeData(data)
      .then(() => {
        if (active) setSaveStatus("saved");
      })
      .catch(() => {
        if (active) {
          setSaveStatus("error");
          setToast("保存未成功，请立即导出一份备份。");
        }
      });
    return () => {
      active = false;
    };
  }, [data]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const refresh = () =>
      setBirthdayDay(Math.floor((Date.now() + 8 * 3_600_000) / 86_400_000));
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener("backButton", () => {
      // A photo preview consumes Back before the member form is dismissed.
      if (!window.dispatchEvent(new Event("jiazu:back", { cancelable: true })))
        return;
      if (modal) setModal(null);
      else if (profileOpen) setProfileOpen(false);
      else if (fullMap) setFullMap(false);
      else if (route !== "map") {
        setRoute("map");
        setQuery("");
      } else void NativeApp.exitApp();
    });
    return () => {
      void listener.then((l) => l.remove());
    };
  }, [modal, profileOpen, route, fullMap]);
  if (!data)
    return (
      <div className="loading-screen">
        <Brand large />
        {loadError ? (
          <>
            <p>{loadError}</p>
            <button className="button primary" onClick={() => void load()}>
              重新读取
            </button>
          </>
        ) : (
          <>
            <span className="loading-leaves">
              <Leaf size={20} />
            </span>
            <p>让每一份亲近，都有迹可循</p>
          </>
        )}
      </div>
    );

  const members = visibleFamilyMembers(data);
  const branches = deriveBranches(data);
  const self = data.people.find((p) => p.id === data.selfId)!,
    selected = members.find((p) => p.id === selectedId) ?? members[0];
  const generations = new Set(
    members.filter((p) => !isFriend(p)).map((p) => p.generation),
  ).size;
  const visiblePeople = members
    .filter(
      (p) =>
        (filter === "all" || branches.get(p.id)?.has(filter)) &&
        `${p.name}${p.relation}${p.address}${p.tags.join("")}`.includes(query),
    )
    .sort((a, b) => a.generation - b.generation);
  const recentMemories = [...data.memories].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const visibleMemories = recentMemories.filter((m) =>
    `${m.title}${m.note}${data.people.find((p) => p.id === m.personId)?.name}${data.people.find((p) => p.id === m.personId)?.relation}`.includes(
      query,
    ),
  );
  function navigate(next: Route) {
    setRoute(next);
    setQuery("");
    setFilter("all");
    setSearchOpen(false);
    setFullMap(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function showPerson(p: Person) {
    setSelectedId(p.id);
    setProfileOpen(true);
  }
  function editPerson(p?: Person) {
    setEditingPerson(p);
    setPersonDefaults({ kind: "family" });
    setPersonFormVersion((v) => v + 1);
    setProfileOpen(false);
    setModal("person");
  }
  function addFamilyPerson(
    familyId = selected.familyId,
    kind: "family" | "friend" = "family",
    friendOfId = "",
  ) {
    setEditingPerson(undefined);
    setPersonDefaults({ kind, familyId, friendOfId });
    setPersonFormVersion((v) => v + 1);
    setProfileOpen(false);
    setModal("person");
  }
  function addMemory(id = selected.id, memory?: Memory) {
    setMemoryPersonId(id);
    setEditingMemory(memory);
    setModal("memory");
  }
  function confirm(
    title: string,
    text: string,
    action: () => void,
    label = "确认",
    danger = false,
  ) {
    setConfirmation({ title, text, label, danger });
    confirmAction.current = action;
    setModal("confirm");
  }
  function savePerson(person: Person, childIds?: string[]) {
    const next = saveFamilyPerson(data!, person, undefined, childIds);
    setData(next);
    setSelectedId(person.id);
    if (!editingPerson) {
      if (route !== "map") navigate("map");
      else {
        setFilter("all");
        setQuery("");
        setSearchOpen(false);
      }
      setFocusId(person.id);
      setMapVersion((v) => v + 1);
    }
    setModal(null);
    setToast(
      editingPerson
        ? "资料已更新"
        : isFriend(person)
          ? "朋友已添加，点击家庭旁的朋友卡片查看"
          : "成员已添加",
    );
  }
  function deletePerson(p: Person) {
    confirm(
      `删除${personName(p, data?.selfId)}的资料？`,
      "这位家人的资料和往来记录会一并删除，相关亲属连线也会移除。其他家人的资料会保留。",
      () => {
        setData({
          ...data!,
          people: data!.people
            .filter((x) => x.id !== p.id)
            .map((x) => ({
              ...x,
              parentIds: x.parentIds.filter((id) => id !== p.id),
              ...(x.siblingIds
                ? { siblingIds: x.siblingIds.filter((id) => id !== p.id) }
                : {}),
              ...Object.fromEntries(
                (
                  [
                    "inferredParentIds",
                    "inferredSiblingIds",
                    "excludedParentIds",
                    "excludedSiblingIds",
                  ] as const
                )
                  .filter((key) => x[key] !== undefined)
                  .map((key) => [key, x[key]!.filter((id) => id !== p.id)]),
              ),
              parentRoles: x.parentRoles
                ? {
                    father:
                      x.parentRoles.father === p.id ? "" : x.parentRoles.father,
                    mother:
                      x.parentRoles.mother === p.id ? "" : x.parentRoles.mother,
                  }
                : undefined,
              partnerId: x.partnerId === p.id ? "" : x.partnerId,
              friendOfId: x.friendOfId === p.id ? "" : x.friendOfId,
            })),
          memories: data!.memories.filter((m) => m.personId !== p.id),
        });
        setSelectedId(data!.selfId);
        setProfileOpen(false);
        setModal(null);
        setToast("已删除这位家人的资料");
      },
      "删除资料",
      true,
    );
  }
  async function exportData() {
    const filename = `家族备份-${today()}.json`,
      contents = JSON.stringify(data, null, 2);
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await Filesystem.writeFile({
          path: `backups/${filename}`,
          data: contents,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
          recursive: true,
        });
        await Share.share({
          title: "保存家族备份",
          url: result.uri,
          dialogTitle: "将备份保存到文件或分享",
        });
      } else {
        const url = URL.createObjectURL(
            new Blob([contents], { type: "application/json" }),
          ),
          a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      }
      setToast("备份已准备好，请妥善保存文件");
    } catch (e) {
      if (!String(e).toLowerCase().includes("cancel"))
        setToast("导出未完成，请重试");
    }
  }
  async function importData(file?: File) {
    if (!file) return;
    try {
      if (file.size > 30 * 1024 * 1024)
        throw new Error("备份过大，请使用 30 MB 以内的文件");
      const next = automaticHouseholds(
        completeFamilyRelations(
          validateData(
            migrateData(validateData(JSON.parse(await file.text()))),
          ),
        ),
      );
      confirm(
        "恢复这份家族备份？",
        `备份包含 ${next.people.length} 位家人、${next.families.length} 个家庭和 ${next.memories.length} 条往来。恢复会替换当前资料，建议先导出当前备份。`,
        () => {
          setData(next);
          setSelectedId(next.selfId);
          setProfileOpen(false);
          setModal(null);
          setToast("家族资料已恢复");
        },
        "恢复备份",
      );
    } catch (e) {
      setToast(e instanceof Error ? e.message : "无法读取这份备份");
    }
  }
  function locate(p: Person) {
    navigate("map");
    setFocusId(p.id);
    setMapVersion((v) => v + 1);
    setProfileOpen(false);
  }
  const filterBar = (
    <div className="filter-pills" aria-label="按亲属分组筛选">
      {(["all", "home", "father", "mother", "other"] as const).map((b) => (
        <button
          key={b}
          className={filter === b ? "active" : ""}
          onClick={() => setFilter(b)}
        >
          {b === "all" ? "全部亲人" : branchInfo[b].label}
          <span>
            {b === "all"
              ? members.length
              : members.filter((p) => branches.get(p.id)?.has(b)).length}
          </span>
        </button>
      ))}
    </div>
  );
  const mapFilterBar = (
    <div
      className="filter-pills map-branch-filters"
      aria-label="按亲属分组筛选"
    >
      {(["father", "mother"] as const).map((branch) => (
        <button
          key={branch}
          className={`branch-${branch} ${filter === branch ? "active" : ""}`}
          aria-pressed={filter === branch}
          title={
            filter === branch
              ? "再次点击显示全部亲人"
              : `突出显示${branchInfo[branch].label}`
          }
          onClick={() => setFilter(filter === branch ? "all" : branch)}
        >
          {branchInfo[branch].label}
          <span>
            {members.filter((p) => branches.get(p.id)?.has(branch)).length}
          </span>
        </button>
      ))}
    </div>
  );
  const profile = (
    <Profile
      person={selected}
      data={data}
      onEdit={() => editPerson(selected)}
      onMemory={() => addMemory(selected.id)}
      onLocate={() => locate(selected)}
      onSelect={showPerson}
      onFriend={() =>
        addFamilyPerson(
          selected.familyId,
          "friend",
          isFriend(selected) ? "" : selected.id,
        )
      }
      onDelete={
        selected.id === data.selfId ? undefined : () => deletePerson(selected)
      }
    />
  );

  return (
    <div
      className={`app-shell ${route === "map" ? "map-route" : ""}`}
      style={{ "--map-saturation": saturation / 100 } as CSSProperties}
    >
      <aside className="sidebar">
        <Brand />
        <div className="family-switch">
          <span className="mini-home">
            <Home size={18} />
          </span>
          <div>
            <strong>{data.title || "家族"}</strong>
            <small>
              {data.demo ? "示例家族 · 自由探索" : "属于我们的家族"}
            </small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-label">在一起的每一种方式</span>
        <nav>
          {navigation.map((n) => (
            <button
              className={route === n.id ? "active" : ""}
              key={n.id}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === "map" && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <button
          className="sidebar-helper"
          onClick={() => setModal("calculator")}
        >
          <Sparkles size={18} />
          <span>称谓小助手</span>
          <ChevronRight size={15} />
        </button>
        <div className="sidebar-note">
          <Sprout size={36} strokeWidth={1.2} />
          <p>
            家的形状，
            <br />
            由你慢慢描绘。
          </p>
          <span>让每一份亲近都有迹可循</span>
        </div>
        <div className="sidebar-person">
          <Avatar person={self} size={36} />
          <span>
            <strong>{personName(self, data.selfId)}</strong>
            <small>这个故事，从我开始</small>
          </span>
          <button
            className="icon-button"
            aria-label="编辑我的资料"
            onClick={() => editPerson(self)}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="desktop-breadcrumb">
            <Home size={15} />
            <span>我的家族</span>
            <ChevronRight size={13} />
            <strong>{navigation.find((n) => n.id === route)?.label}</strong>
          </div>
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="topbar-actions">
            <span className={`save-indicator ${saveStatus}`}>
              <i />
              {saveStatus === "saved"
                ? "已保存在本机"
                : saveStatus === "saving"
                  ? "正在保存"
                  : "保存失败，请备份"}
            </span>
            <button
              className="icon-button search-toggle"
              aria-label="搜索家人"
              onClick={() => {
                if (route === "settings") {
                  navigate("people");
                  setSearchOpen(true);
                } else setSearchOpen((v) => !v);
              }}
            >
              <Search size={19} />
            </button>
            {route !== "settings" && (
              <button
                className="icon-button mobile-more"
                aria-label="家族设置"
                onClick={() => navigate("settings")}
              >
                <Ellipsis size={21} />
              </button>
            )}
            <button
              className="button primary add-desktop"
              onClick={() => editPerson()}
            >
              <Plus size={17} />
              添加家人
            </button>
          </div>
        </header>
        {searchOpen && (
          <div className="mobile-search">
            <Search size={17} />
            <input
              autoFocus
              placeholder="搜索姓名、称谓、住址…"
              aria-label="搜索家人"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="icon-button"
              onClick={() => {
                setSearchOpen(false);
                setQuery("");
              }}
              aria-label="关闭搜索"
            >
              <X size={17} />
            </button>
          </div>
        )}
        {route === "map" && (
          <section className="page-content map-page page-enter">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  <i /> OUR FAMILY, OUR STORY
                </span>
                <h1>
                  家人，都在这里<span className="heading-dot">。</span>
                </h1>
                <p>从我的小家出发，连接每一个在意的人。</p>
              </div>
              <div className="family-stats">
                <div>
                  <strong>
                    {members.length}
                    <small>位</small>
                  </strong>
                  <span>家人相伴</span>
                </div>
                <i />
                <div>
                  <strong>
                    {
                      data.families.filter((f) =>
                        members.some((p) => p.familyId === f.id),
                      ).length
                    }
                    <small>个</small>
                  </strong>
                  <span>小家相连</span>
                </div>
                <i />
                <div>
                  <strong>
                    {generations}
                    <small>代</small>
                  </strong>
                  <span>亲情延续</span>
                </div>
              </div>
            </div>
            <div className="map-layout">
              <section
                className={`map-board ${fullMap ? "board-fullscreen" : ""}`}
              >
                <div className="board-toolbar">
                  <div className="view-switch">
                    <button
                      className={tree ? "active" : ""}
                      aria-pressed={tree}
                      onClick={() => setTree(true)}
                    >
                      <GitBranch size={16} />
                      家族树
                    </button>
                    <button
                      className={!tree ? "active" : ""}
                      aria-pressed={!tree}
                      onClick={() => setTree(false)}
                    >
                      <Network size={16} />
                      关系网
                    </button>
                  </div>
                  <div className="board-tools">
                    <button
                      className="icon-button"
                      aria-label="家族显示设置"
                      title="家族显示设置"
                      onClick={() => setModal("display")}
                    >
                      <Settings2 size={18} />
                    </button>
                    <button
                      className="icon-button helper-mobile"
                      aria-label="打开称谓小助手"
                      onClick={() => setModal("calculator")}
                    >
                      <Sparkles size={18} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={fullMap ? "退出全屏" : "展开关系图"}
                      onClick={() => setFullMap((v) => !v)}
                    >
                      {fullMap ? (
                        <X size={18} />
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        >
                          <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                {mapFilterBar}
                <FamilyMap
                  data={data}
                  tree={tree}
                  filter={filter}
                  query={query}
                  selectedId={selected.id}
                  onSelect={showPerson}
                  focusId={focusId}
                  focusVersion={mapVersion}
                  onAddPerson={addFamilyPerson}
                  onReorder={(ids) => {
                    setData({
                      ...data,
                      people: applyPersonOrder(data.people, ids),
                    });
                    setToast("人物顺序已保存");
                  }}
                />
                <button
                  className="map-person-preview"
                  onClick={() => showPerson(selected)}
                >
                  <Avatar person={selected} size={43} />
                  <span>
                    <strong>
                      {personName(selected, data.selfId)}
                      {selected.id !== data.selfId && (
                        <em>
                          {selected.relation ||
                            (isFriend(selected) ? "朋友" : "")}
                        </em>
                      )}
                    </strong>
                    <small>
                      {familyName(
                        data.families.find((f) => f.id === selected.familyId)!,
                        data.people,
                      )}{" "}
                      · 点击查看资料
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
                <footer className="board-footer">
                  <span>
                    <i className="legend-dot green" />
                    我的小家
                  </span>
                  <span>
                    <i className="legend-dot amber" />
                    爸爸这边
                  </span>
                  <span>
                    <i className="legend-dot purple" />
                    妈妈这边
                  </span>
                  <span className="footer-tip">点击家人，故事就此展开</span>
                </footer>
              </section>
              <aside className="profile-pane">{profile}</aside>
            </div>
            <div className="home-cards">
              <button
                className="birthday-card"
                onClick={() => {
                  if (birthdays[0]) showPerson(birthdays[0].person);
                  else editPerson(self);
                }}
              >
                <span className="card-icon coral">
                  <Cake size={23} strokeWidth={1.5} />
                </span>
                <div>
                  <span className="card-kicker">农历生日 · 下一份小惊喜</span>
                  <h3>
                    {birthdays[0]
                      ? `${personName(birthdays[0].person, data.selfId)}${birthdays[0].days === 0 ? "今天过生日" : "的生日快到了"}`
                      : "记下家人的生日"}
                  </h3>
                  <p>
                    {birthdays[0]
                      ? `农历${birthdays[0].lunarDate} · ${birthdays[0].days === 0 ? "就是今天" : `还有 ${birthdays[0].days} 天`}`
                      : "让重要的日子，都被温柔记住"}
                  </p>
                </div>
                <ChevronRight size={18} />
                <span className="birthday-decoration">✳</span>
              </button>
              <button
                className="helper-card"
                onClick={() => setModal("calculator")}
              >
                <span className="card-icon sage">
                  <Sparkles size={22} strokeWidth={1.5} />
                </span>
                <div>
                  <span className="card-kicker">称谓小助手</span>
                  <h3>亲属关系，随时理清</h3>
                  <p>理清亲戚关系，见面亲切叫出名字</p>
                </div>
                <span className="helper-answer">
                  计算称谓 <ArrowRight size={14} />
                </span>
              </button>
            </div>
            {data.demo && (
              <div className="demo-banner">
                <Leaf size={16} />
                <span>正在浏览示例家族，准备好记录自己的故事了吗？</span>
                <button onClick={() => setModal("start")}>
                  创建我的家族 <ArrowRight size={14} />
                </button>
              </div>
            )}
          </section>
        )}

        {route === "people" && (
          <section className="page-content page-enter">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  <i /> PEOPLE WE CALL FAMILY
                </span>
                <h1>
                  把每个人，记在心里<span className="heading-dot">。</span>
                </h1>
                <p>名字、称呼，还有那些值得记住的小事。</p>
              </div>
            </div>
            <div className="list-toolbar">
              <div className="search-field">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索姓名、称谓、住址…"
                  aria-label="搜索名册"
                />
                {query && (
                  <button
                    className="icon-button"
                    onClick={() => setQuery("")}
                    aria-label="清除搜索"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {filterBar}
            </div>
            <div className="section-caption">
              <span>家人名册</span>
              <small>共 {visiblePeople.length} 位成员</small>
            </div>
            {!visiblePeople.length ? (
              <Empty
                icon={<Users />}
                title="还没有找到这位家人"
                text="换个名字或称呼试试，也可以把新的家人记录进来。"
                action={() => editPerson()}
                actionLabel="添加家人"
              />
            ) : (
              <div className="people-grid">
                {visiblePeople.map((p) => (
                  <button
                    key={p.id}
                    className="person-card"
                    onClick={() => showPerson(p)}
                  >
                    <Avatar person={p} size={58} />
                    <div className="person-card-body">
                      <h3>
                        {personName(p, data.selfId)}
                        {p.id !== data.selfId && (
                          <span>
                            {p.relation || (isFriend(p) ? "朋友" : "")}
                          </span>
                        )}
                      </h3>
                      <p>
                        {familyName(
                          data.families.find((f) => f.id === p.familyId)!,
                          data.people,
                        )}
                      </p>
                      <div className="person-tags">
                        {p.tags.length ? (
                          p.tags
                            .slice(0, 2)
                            .map((t) => <span key={t}>{t}</span>)
                        ) : (
                          <span>{p.address || "点开，了解更多"}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {route === "memories" && (
          <section className="page-content page-enter">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  <i /> LITTLE MOMENTS, LASTING LOVE
                </span>
                <h1>
                  来来往往，都是牵挂<span className="heading-dot">。</span>
                </h1>
                <p>一次通话，一顿家常饭。记下与家人的点滴。</p>
              </div>
              <button
                className="button primary"
                onClick={() => addMemory(data.selfId)}
              >
                <Plus size={17} />
                记一笔往来
              </button>
            </div>
            <section
              className="upcoming-birthdays"
              aria-labelledby="birthdays-heading"
            >
              <header>
                <span className="birthday-section-icon">
                  <Cake size={21} />
                </span>
                <div>
                  <h2 id="birthdays-heading">
                    近期生日 <span>农历</span>
                  </h2>
                  <p>记得每一份值得庆祝的日子</p>
                </div>
                <span className="birthday-list-count">
                  最近 {Math.min(birthdays.length, 5)} 位
                </span>
              </header>
              {birthdays.length ? (
                <div className="birthday-list">
                  {birthdays.slice(0, 5).map((birthday) => (
                    <button
                      className="birthday-list-item"
                      key={birthday.person.id}
                      onClick={() => showPerson(birthday.person)}
                    >
                      <Avatar person={birthday.person} size={42} />
                      <span className="birthday-person">
                        <strong>
                          {personName(birthday.person, data.selfId)}
                          {birthday.person.id !== data.selfId &&
                            birthday.person.relation && (
                              <small>{birthday.person.relation}</small>
                            )}
                        </strong>
                        <span>
                          农历{birthday.lunarDate} <i>·</i> 公历
                          {birthday.solarDate.replaceAll("-", ".")}
                        </span>
                        {birthday.adjustment && <em>{birthday.adjustment}</em>}
                      </span>
                      <span
                        className={`birthday-countdown ${birthday.days === 0 ? "is-today" : ""}`}
                      >
                        {birthday.days === 0 ? (
                          "今天"
                        ) : birthday.days === 1 ? (
                          "明天"
                        ) : (
                          <>
                            <b>{birthday.days}</b> 天后
                          </>
                        )}
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="birthday-empty">
                  还没有可计算的家人生日。补全公历年月日后，会自动按农历排列在这里。
                </p>
              )}
              <details className="birthday-rules">
                <summary>农历生日如何计算</summary>
                <p>
                  按北京时间计算，列出最近 5
                  位在世家人（含自己）；朋友和已离世成员不列入。公历出生年月日需填写完整。当年没有对应闰月时按同名常月；农历三十遇小月时按廿九。列表内显示实际庆祝日及调整说明。
                </p>
              </details>
            </section>
            <div className="memory-overview">
              <span className="card-icon sage">
                <Coffee size={24} />
              </span>
              <div>
                <strong>
                  {data.memories.length}
                  <small>次用心的联络</small>
                </strong>
                <p>关系的温度，藏在每一次惦记里。</p>
              </div>
              <Heart size={48} strokeWidth={0.8} />
            </div>
            <div className="search-field memory-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索家人或往来内容…"
                aria-label="搜索往来"
              />
            </div>
            <div className="memory-list">
              {visibleMemories.map((m) => {
                const p = data.people.find((x) => x.id === m.personId);
                return (
                  <article className="memory-card" key={m.id}>
                    <div className="memory-date">
                      <strong>{m.date ? m.date.slice(8, 10) : "—"}</strong>
                      <span>
                        {m.date
                          ? `${m.date.slice(0, 4)}.${m.date.slice(5, 7)}`
                          : "日期待补充"}
                      </span>
                    </div>
                    <div className="memory-line" />
                    <div className="memory-content">
                      <header>
                        <button
                          disabled={!p}
                          onClick={() => p && showPerson(p)}
                        >
                          {p && <Avatar person={p} size={28} />}
                          <strong>
                            {p ? personName(p, data.selfId) : "未关联成员"}
                          </strong>
                          <span>{p?.relation}</span>
                        </button>
                        <span className="memory-kind">{m.kind}</span>
                      </header>
                      <h3>{m.title || "未填写内容"}</h3>
                      {m.note && <p>{m.note}</p>}
                      <div className="memory-actions">
                        <button onClick={() => addMemory(p?.id ?? "", m)}>
                          <Pencil size={13} />
                          编辑
                        </button>
                        <button
                          onClick={() =>
                            confirm(
                              "删除这条往来记录？",
                              `「${m.title}」删除后无法找回。`,
                              () => {
                                setData({
                                  ...data,
                                  memories: data.memories.filter(
                                    (x) => x.id !== m.id,
                                  ),
                                });
                                setModal(null);
                                setToast("往来记录已删除");
                              },
                              "删除记录",
                              true,
                            )
                          }
                        >
                          <Trash2 size={13} />
                          删除
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {!visibleMemories.length && (
                <Empty
                  icon={<BookHeart />}
                  title={query ? "没有找到相关往来" : "把第一份牵挂记下来"}
                  text={
                    query
                      ? "试试其他家人的名字，或清空搜索。"
                      : "见面、通话、节日问候，都是值得记住的小事。"
                  }
                  action={() => addMemory(self.id)}
                  actionLabel="记一笔往来"
                />
              )}
            </div>
          </section>
        )}

        {route === "settings" && (
          <section className="page-content settings-page page-enter">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  <i /> A PLACE TO BELONG
                </span>
                <h1>
                  属于我们的家族<span className="heading-dot">。</span>
                </h1>
                <p>好好保存每一份连接，也照顾好每一份资料。</p>
              </div>
            </div>
            <div className="settings-grid">
              <div>
                <section className="settings-card">
                  <h2>
                    <Home size={18} />
                    我的家族
                  </h2>
                  <form
                    className="family-name-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const title = String(
                        new FormData(e.currentTarget).get("title"),
                      ).trim();
                      setData({ ...data, title });
                      setToast("家族名称已更新");
                    }}
                  >
                    <label htmlFor="family-title">给家族取个名字</label>
                    <div>
                      <input
                        id="family-title"
                        name="title"
                        key={data.title}
                        defaultValue={data.title}
                        maxLength={24}
                      />
                      <button className="button soft" type="submit">
                        保存
                      </button>
                    </div>
                  </form>
                  <button
                    className="settings-row"
                    onClick={() => editPerson(self)}
                  >
                    <Avatar person={self} size={42} />
                    <span>
                      <strong>我的资料</strong>
                      <small>
                        {personName(self, data.selfId)} · 一切关系的起点
                      </small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <div className="settings-stats">
                    <span>
                      <strong>{members.length}</strong> 位家人
                    </span>
                    <span>
                      <strong>
                        {
                          data.families.filter((f) =>
                            members.some((p) => p.familyId === f.id),
                          ).length
                        }
                      </strong>{" "}
                      个家庭
                    </span>
                    <span>
                      <strong>{data.memories.length}</strong> 条往来
                    </span>
                  </div>
                </section>
                <section className="settings-card">
                  <h2>
                    <Database size={18} />
                    资料与备份
                  </h2>
                  <div className="privacy-note">
                    <ShieldCheck size={20} />
                    <p>
                      资料保存在这台设备上，无需账号即可离线使用。卸载应用或清除应用数据前，请先导出备份。
                    </p>
                  </div>
                  <button
                    className="settings-row"
                    onClick={() => void exportData()}
                  >
                    <span className="settings-icon">
                      <ArrowDownToLine size={20} />
                    </span>
                    <span>
                      <strong>导出家族备份</strong>
                      <small>包含头像、关系和全部往来记录</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="settings-row"
                    onClick={() => importInput.current?.click()}
                  >
                    <span className="settings-icon lavender">
                      <ArrowUpFromLine size={20} />
                    </span>
                    <span>
                      <strong>从备份恢复</strong>
                      <small>选择之前导出的 JSON 备份文件</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <input
                    ref={importInput}
                    className="visually-hidden"
                    type="file"
                    accept=".json,application/json"
                    aria-label="导入家族备份"
                    onChange={(e) => {
                      void importData(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </section>
              </div>
              <div>
                <section className="settings-card about-card">
                  <Brand large />
                  <p>
                    每个小家，都有自己的故事。
                    <br />
                    每一种关系，都值得被记住。
                  </p>
                  <span className="version-tag">家族 1.9.4 · 离线版</span>
                  <div>
                    <CheckCheck size={16} />
                    {saveStatus === "saved"
                      ? "所有资料已保存在本机"
                      : saveStatus === "saving"
                        ? "正在保存资料"
                        : "保存异常，请导出备份"}
                  </div>
                </section>
                <section className="settings-card">
                  <h2>
                    <Sprout size={18} />
                    新的开始
                  </h2>
                  <p className="settings-description">
                    {data.demo
                      ? "示例只是一个起点。建立自己的家族，从记录自己和最亲近的人开始。"
                      : "重新建立一个家族会替换当前全部资料。开始之前，记得导出一份备份。"}
                  </p>
                  <button
                    className="button soft full-width"
                    onClick={() => setModal("start")}
                  >
                    {data.demo ? "创建我的家族" : "重新建立家族"}
                    <ArrowRight size={16} />
                  </button>
                </section>
              </div>
            </div>
          </section>
        )}
        <footer className="page-footer">
          <Leaf size={13} />
          <span>一人一故事，一家一世界。</span>
          <span>家族 · 记录相连的我们</span>
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="主导航">
        {navigation.slice(0, 2).map((n) => (
          <button
            key={n.id}
            className={route === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={21} />
            <span>{n.short}</span>
          </button>
        ))}
        <button
          className="nav-add"
          aria-label="添加家人"
          onClick={() => editPerson()}
        >
          <Plus size={26} />
        </button>
        {navigation.slice(2).map((n) => (
          <button
            key={n.id}
            className={route === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={21} />
            <span>{n.short}</span>
          </button>
        ))}
      </nav>
      {profileOpen && (
        <Sheet title="家人资料" onClose={() => setProfileOpen(false)}>
          {profile}
        </Sheet>
      )}
      {modal === "person" && (
        <Sheet
          wide
          dismissOnBackdrop={false}
          title={
            editingPerson
              ? editingPerson.id === data.selfId && isBlankStarter(data)
                ? "填写我的资料"
                : editingPerson.id === data.selfId
                  ? "编辑我的资料"
                  : "编辑家人资料"
              : personDefaults.kind === "friend"
                ? "添加家庭朋友"
                : "添加一位家人"
          }
          onClose={() => setModal(null)}
        >
          <PersonForm
            key={personFormVersion}
            data={data}
            initial={editingPerson}
            defaults={personDefaults}
            onSave={savePerson}
            onCancel={() => setModal(null)}
          />
        </Sheet>
      )}
      {modal === "memory" && (
        <Sheet
          title={editingMemory ? "编辑往来记事" : "记一笔往来"}
          onClose={() => setModal(null)}
        >
          <MemoryForm
            data={data}
            personId={memoryPersonId}
            initial={editingMemory}
            onSave={(memory) => {
              setData({
                ...data,
                memories: [
                  ...data.memories.filter((m) => m.id !== memory.id),
                  memory,
                ],
              });
              setModal(null);
              setToast("这份牵挂，已经记下了");
            }}
          />
        </Sheet>
      )}
      {modal === "calculator" && (
        <Sheet title="称谓小助手" onClose={() => setModal(null)}>
          <Calculator gender={self.gender} />
        </Sheet>
      )}
      {modal === "display" && (
        <Sheet title="家族显示设置" onClose={() => setModal(null)}>
          <div className="display-settings">
            <label htmlFor="map-saturation">
              <span>颜色饱和度</span>
              <output htmlFor="map-saturation">{saturation}%</output>
            </label>
            <p>
              拖动滑杆，让家族树、关系网和页面配色更清楚。调整会自动保存在本机。
            </p>
            <input
              id="map-saturation"
              type="range"
              min="0"
              max="200"
              step="5"
              value={saturation}
              aria-label="颜色饱和度"
              onChange={(e) =>
                setSaturation(normalizeSaturation(e.target.value))
              }
            />
            <div className="saturation-scale">
              <span>黑白</span>
              <span>自然</span>
              <span>鲜明</span>
            </div>
            <button
              className="button secondary full-width"
              onClick={() => setSaturation(100)}
            >
              恢复默认配色
            </button>
            <p>
              长按人物卡片后左右拖动，可调整同辈顺序。伴侣一起移动，跨家庭时整组移动。
            </p>
            <button
              className="button secondary full-width"
              disabled={!data.people.some((p) => p.layoutOrder !== undefined)}
              onClick={() => {
                setData({
                  ...data,
                  people: data.people.map(({ layoutOrder: _order, ...p }) => p),
                });
                setToast("已恢复自动排序");
              }}
            >
              恢复自动排序
            </button>
          </div>
        </Sheet>
      )}
      {modal === "start" && (
        <Sheet title="从自己开始，记录一个家" onClose={() => setModal(null)}>
          <StartForm
            demo={data.demo}
            onSave={(name, title) => {
              const next = createEmpty(name, title);
              setData(next);
              setSelectedId(next.selfId);
              setProfileOpen(false);
              setModal(null);
              navigate("map");
              setMapVersion((v) => v + 1);
              setToast("你的家族故事，从这里开始");
            }}
          />
        </Sheet>
      )}
      {modal === "confirm" && (
        <Sheet title={confirmation.title} onClose={() => setModal(null)}>
          <Confirmation
            {...confirmation}
            onCancel={() => setModal(null)}
            onConfirm={() => confirmAction.current()}
          />
        </Sheet>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
