import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  Crosshair,
  Home,
  Scan,
  Hand,
  UsersRound,
  UserRoundPlus,
  ChevronRight,
  X,
  Heart,
} from "lucide-react";
import { Avatar } from "./Avatar";
import { Memorial } from "./Memorial";
import {
  branchInfo,
  generationNames,
  isFriend,
  personName,
  familyName,
  visibleFamilyMembers,
  ageLabel,
} from "./model";
import { deriveBranches } from "./kinship";
import type { Branch, FamilyData, Person } from "./model";
import { makeGenerationLayout } from "./treeLayout";
import type { GenerationRow } from "./treeLayout";
import { fitMapView, retainMapView } from "./mapViewport";
import type { MapView } from "./mapViewport";
import { routeFamilyMap } from "./mapRouting";
import { applyPersonOrder, reorderPersonIds } from "./personOrdering";
import { kinshipOrdering } from "./kinshipOrdering";
import {
  householdHeight,
  partnerSpacing,
  personCardHeight,
  personCardWidth,
  relativeSpacing,
} from "./mapGeometry";

interface Position {
  x: number;
  y: number;
}
const cardHalfWidth = personCardWidth / 2;
const cardHalfHeight = personCardHeight / 2;
const networkRowSpacing = personCardHeight + 16;
interface Layout {
  nodes: Map<string, Position>;
  friendGroups: Map<string, Position>;
  groups: {
    id: string;
    name: string;
    branch: Branch;
    x: number;
    y: number;
    width: number;
    height: number;
    familyId: string;
    friendAnchor: boolean;
  }[];
  width: number;
  height: number;
  generations: GenerationRow[];
}
function makeLayout(
  data: Pick<FamilyData, "people" | "families" | "selfId">,
  tree: boolean,
): Layout {
  const nodes = new Map<string, Position>();
  const friendGroups = new Map<string, Position>();
  if (tree) return makeGenerationLayout(data);
  const visibleFamilies = data.families.filter((f) =>
    data.people.some((p) => p.familyId === f.id),
  );
  const selfFamily = data.people.find((p) => p.id === data.selfId)?.familyId;
  visibleFamilies.sort(
    (a, b) => Number(b.id === selfFamily) - Number(a.id === selfFamily),
  );
  const ordering = kinshipOrdering(data);
  const networkSlots = new Map(
    visibleFamilies.map((f) => {
      const members = data.people.filter(
        (p) => p.familyId === f.id && !isFriend(p),
      );
      const placed = new Set<string>(),
        units: Person[][] = [];
      for (const p of [...members].sort(ordering.compare)) {
        if (placed.has(p.id)) continue;
        placed.add(p.id);
        const partner = members.find(
          (m) =>
            !placed.has(m.id) && (m.id === p.partnerId || m.partnerId === p.id),
        );
        if (partner) {
          placed.add(partner.id);
          units.push([p, partner].sort(ordering.pair));
        } else units.push([p]);
      }
      units.sort(
        (a, b) =>
          a[0].generation - b[0].generation || ordering.compareUnits(a, b),
      );
      const slots: (Person | null | undefined)[] = [];
      for (const unit of units) {
        if (unit.length === 2 && slots.length % 2) slots.push(null);
        slots.push(...unit);
      }
      if (data.people.some((p) => p.familyId === f.id && isFriend(p)))
        slots.push(undefined);
      return [f.id, slots] as const;
    }),
  );
  const n = visibleFamilies.length;
  const maxRows = Math.max(
    2,
    ...visibleFamilies.map((f) =>
      Math.ceil(networkSlots.get(f.id)!.length / 2),
    ),
  );
  const groupWidth = personCardWidth + relativeSpacing + 40;
  const spacing = Math.max(groupWidth + 40, maxRows * networkRowSpacing + 110);
  const clusterScale = Math.max(
    1,
    (groupWidth + 32) / 340,
    (maxRows * networkRowSpacing + 80) / 250,
  );
  let ringCount = 0,
    remaining = n - 1;
  while (remaining > 0) {
    ringCount++;
    remaining -= ringCount * 6;
  }
  const width =
    n === 1
      ? 430
      : n === 2
        ? 450
        : n <= 7
          ? 1110 * clusterScale
          : ringCount * spacing * 2 + 380;
  const height =
    n === 1
      ? Math.max(320, maxRows * networkRowSpacing + 110)
      : n === 2
        ? Math.max(620, maxRows * networkRowSpacing * 2 + 180)
        : n <= 7
          ? 800 * clusterScale
          : width;
  const anchors: Position[] =
    n === 1
      ? [{ x: 215, y: height / 2 }]
      : n === 2
        ? [
            { x: 225, y: height * 0.73 },
            { x: 225, y: height * 0.25 },
          ]
        : [
            { x: 550, y: 452 },
            { x: 550, y: 193 },
            { x: 200, y: 135 },
            { x: 192, y: 407 },
            { x: 260, y: 672 },
            { x: 894, y: 139 },
            { x: 910, y: 452 },
          ].map((point) => ({
            x: point.x * clusterScale,
            y: point.y * clusterScale,
          }));
  const groups = visibleFamilies.map((f, i) => {
    const ordered = networkSlots.get(f.id)!;
    const count = ordered.length;
    const cols = 2;
    const groupHeight = Math.ceil(count / cols) * networkRowSpacing + 72;
    let ring = 1,
      indexInRing = i - 1;
    while (indexInRing >= ring * 6) {
      indexInRing -= ring * 6;
      ring++;
    }
    const angle = -Math.PI / 2 + (indexInRing * Math.PI * 2) / (ring * 6);
    const anchor =
      n <= 7
        ? anchors[i]
        : i === 0
          ? { x: width / 2, y: height / 2 }
          : {
              x: width / 2 + Math.cos(angle) * ring * spacing,
              y: height / 2 + Math.sin(angle) * ring * spacing,
            };
    ordered.forEach((p, j) => {
      if (p === null) return;
      const rowCount = Math.min(cols, count - Math.floor(j / cols) * cols);
      const first = ordered[Math.floor(j / cols) * cols],
        second = ordered[Math.floor(j / cols) * cols + 1];
      const spacing =
        first &&
        second &&
        (first.partnerId === second.id || second.partnerId === first.id)
          ? partnerSpacing
          : relativeSpacing;
      const position = {
        x: anchor.x + ((j % cols) - (rowCount - 1) / 2) * spacing,
        y:
          anchor.y +
          Math.floor(j / cols) * networkRowSpacing -
          ((Math.ceil(count / cols) - 1) * networkRowSpacing) / 2 +
          8,
      };
      if (p) nodes.set(p.id, position);
      else friendGroups.set(f.id, position);
    });
    return {
      ...f,
      name: familyName(f, data.people),
      familyId: f.id,
      friendAnchor: true,
      x: anchor.x,
      y: anchor.y - 12,
      width: groupWidth,
      height: groupHeight,
    };
  });
  return { nodes, friendGroups, groups, generations: [], width, height };
}
export function FamilyMap({
  data,
  tree,
  filter,
  query,
  selectedId,
  onSelect,
  focusId,
  onAddPerson,
  onReorder,
}: {
  data: FamilyData;
  tree: boolean;
  filter: Branch | "all";
  query: string;
  selectedId: string;
  onSelect: (p: Person) => void;
  focusId: string;
  onAddPerson: (familyId: string, kind: "family" | "friend") => void;
  onReorder: (ids: string[]) => void;
}) {
  const { families, selfId } = data;
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const people = useMemo(
    () =>
      visibleFamilyMembers(
        previewOrder
          ? { ...data, people: applyPersonOrder(data.people, previewOrder) }
          : data,
      ),
    [data, previewOrder],
  );
  const branches = useMemo(() => deriveBranches(data), [data]);
  const layout = useMemo(
    () => makeLayout({ people, families, selfId }, tree),
    [people, families, selfId, tree],
  );
  const connections = useMemo(
    () => routeFamilyMap(data.people, layout.nodes, tree, layout.friendGroups),
    [data.people, layout, tree],
  );
  const linePoints = useMemo(
    () => [
      ...connections.routes.flatMap((r) => r.points),
      ...connections.siblings.flatMap((g) => g.paths.flatMap((p) => p.points)),
    ],
    [connections],
  );
  const [activeSibling, setActiveSibling] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<MapView & { instant?: boolean }>({
    x: 0,
    y: 0,
    scale: 0.7,
  });
  useEffect(() => {
    if (!view.instant) return;
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => {
        setView((current) => ({ ...current, instant: false }));
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
    };
  }, [view]);
  const [dragging, setDragging] = useState(false);
  const [sortingId, setSortingId] = useState("");
  const [floatingPoint, setFloatingPoint] = useState<Position | null>(null);
  const sort = useRef<{
    id: string;
    pointerId: number;
    order: string[];
    initialOrder: string[];
    startX: number;
    originX: number;
    y: number;
  } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPress = useRef<{
    id: string;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const [expandedFamily, setExpandedFamily] = useState(() => {
    const focus = data.people.find((p) => p.id === focusId);
    return focus && isFriend(focus) ? focus.familyId : "";
  });
  const pointers = useRef(new Map<number, Position>());
  const gesture = useRef({ x: 0, y: 0, distance: 0, moved: false });
  const clickGuard = useRef(0);
  const viewMode = useRef<"auto" | "full" | "self" | "manual">("auto");
  const previousFocus = useRef(focusId);
  const previousTree = useRef(tree);
  const structureKey = useMemo(
    () =>
      JSON.stringify(
        data.people.map((p) => [
          p.id,
          p.name,
          p.familyId,
          p.generation,
          p.birthday,
          p.birthdayParts,
          p.parentIds,
          p.parentRoles,
          p.partnerId,
          p.siblingIds,
          p.kind,
        ]),
      ),
    [data.people],
  );
  const previousStructure = useRef(structureKey);
  const previousMap = useRef({
    ids: new Set(data.people.map((p) => p.id)),
    layout,
    selfId,
  });
  const fit = useCallback(
    (center = false, layers = false, centerId = "") => {
      if (!container.current) return;
      const { width, height } = container.current.getBoundingClientRect();
      const inset = tree ? 72 : 0;
      const bounds = {
        left:
          Math.min(
            ...layout.groups.map((g) => g.x - g.width / 2),
            ...linePoints.map((p) => p.x),
          ) - 8,
        right:
          Math.max(
            ...layout.groups.map((g) => g.x + g.width / 2),
            ...linePoints.map((p) => p.x),
          ) + 8,
        top:
          Math.min(
            ...layout.groups.map((g) => g.y - g.height / 2),
            ...linePoints.map((p) => p.y),
          ) - 8,
        bottom:
          Math.max(
            ...layout.groups.map((g) => g.y + g.height / 2),
            ...linePoints.map((p) => p.y),
          ) + 8,
      };
      if (!center && !layers) {
        setView(fitMapView(bounds, { width, height }, tree));
        return;
      }
      const own = data.people.find((p) => p.id === data.selfId);
      const ownPoint = layout.nodes.get(data.selfId);
      const partnerPoint = own?.partnerId
        ? layout.nodes.get(own.partnerId)
        : undefined;
      const coupleCenter =
        ownPoint &&
        partnerPoint &&
        ownPoint.y === partnerPoint.y &&
        Math.abs(ownPoint.x - partnerPoint.x) <= partnerSpacing + 1
          ? (ownPoint.x + partnerPoint.x) / 2
          : ownPoint?.x;
      const scale = center
        ? Math.min(0.95, width < 600 ? 0.78 : 0.97)
        : layers
          ? Math.min(0.95, (height - 100) / (bounds.bottom - bounds.top))
          : 1;
      const point = center
        ? (layout.nodes.get(centerId || focusId || data.selfId) ??
          layout.friendGroups.get(
            data.people.find((p) => p.id === (centerId || focusId))?.familyId ??
              "",
          ) ?? {
            x: layout.width / 2,
            y: layout.height / 2,
          })
        : {
            x: layers
              ? (coupleCenter ?? layout.width / 2)
              : (bounds.left + bounds.right) / 2,
            y: (bounds.top + bounds.bottom) / 2,
          };
      setView({
        scale,
        x: (width + inset) / 2 - point.x * scale,
        y: (height - 32) / 2 - point.y * scale,
      });
    },
    [layout, linePoints, focusId, data.selfId, data.people, tree],
  );
  useLayoutEffect(() => {
    const previous = previousMap.current;
    const ids = new Set(data.people.map((p) => p.id));
    const removed =
      ids.size < previous.ids.size &&
      [...ids].every((id) => previous.ids.has(id));
    const sameContext =
      previousFocus.current === focusId &&
      previousTree.current === tree &&
      previous.selfId === selfId;
    previousMap.current = { ids, layout, selfId };
    if (removed && sameContext && container.current) {
      const viewport = container.current.getBoundingClientRect();
      const points = (map: Layout) =>
        new Map([
          ...[...map.nodes].map(([id, p]) => [`person:${id}`, p] as const),
          ...[...map.friendGroups].map(
            ([id, p]) => [`friends:${id}`, p] as const,
          ),
        ]);
      viewMode.current = "manual";
      previousStructure.current = structureKey;
      setView((current) => ({
        ...retainMapView(
          current,
          points(previous.layout),
          points(layout),
          viewport,
          tree,
        ),
        instant: true,
      }));
    }
    if (
      previousFocus.current !== focusId ||
      previousTree.current !== tree ||
      previousStructure.current !== structureKey
    ) {
      viewMode.current = "auto";
      previousFocus.current = focusId;
      previousTree.current = tree;
      previousStructure.current = structureKey;
    }
    const reset = () => {
      if (viewMode.current === "manual") return;
      if (viewMode.current === "full") {
        fit(false);
        return;
      }
      if (viewMode.current === "self") {
        fit(true, false, selfId);
        return;
      }
      fit(
        Boolean(focusId) || (!tree && window.innerWidth < 600),
        tree && !focusId,
      );
    };
    reset();
    const observer = new ResizeObserver(() => reset());
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [fit, focusId, tree, selfId, data.people, layout, structureKey]);
  const zoom = useCallback((factor: number, point?: Position) => {
    if (!container.current) return;
    viewMode.current = "manual";
    const rect = container.current.getBoundingClientRect();
    const at = point ?? { x: rect.width / 2, y: rect.height / 2 };
    setView((v) => {
      const scale = Math.max(0.12, Math.min(2, v.scale * factor)),
        ratio = scale / v.scale;
      return {
        scale,
        x: at.x - (at.x - v.x) * ratio,
        y: at.y - (at.y - v.y) * ratio,
      };
    });
  }, []);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest(".friends-panel")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.002), {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoom]);
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pendingPress.current = null;
  }
  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [tree],
  );
  function rowOrder(id: string) {
    const generation = data.people.find((p) => p.id === id)!.generation;
    return people
      .filter(
        (p) =>
          !isFriend(p) && p.generation === generation && layout.nodes.has(p.id),
      )
      .sort((a, b) => layout.nodes.get(a.id)!.x - layout.nodes.get(b.id)!.x)
      .map((p) => p.id);
  }
  function cancelSort() {
    sort.current = null;
    cancelPress();
    setSortingId("");
    setFloatingPoint(null);
    setPreviewOrder(null);
    clickGuard.current = Date.now() + 600;
  }
  function pointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    if (
      (e.target as HTMLElement).closest(
        ".map-controls, .friends-panel, .cluster-add-friend, .sibling-links",
      )
    )
      return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelPress();
    if (pointers.current.size > 1 && sort.current) cancelSort();
    const node = (e.target as HTMLElement).closest<HTMLElement>(
      ".person-node[data-person-id]",
    );
    if (tree && node && pointers.current.size === 1) {
      const id = node.dataset.personId!;
      pendingPress.current = {
        id,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      };
      pressTimer.current = setTimeout(() => {
        const pending = pendingPress.current;
        if (!pending || pointers.current.size !== 1) return;
        const point = layout.nodes.get(id);
        if (!point || !container.current) return;
        const order = rowOrder(id);
        sort.current = {
          id,
          pointerId: pending.pointerId,
          order,
          initialOrder: order,
          startX: pending.x,
          originX: point.x,
          y: point.y,
        };
        setSortingId(id);
        setFloatingPoint(point);
        setDragging(false);
        viewMode.current = "manual";
        container.current?.setPointerCapture(pending.pointerId);
        clickGuard.current = Date.now() + 600;
      }, 450);
    }
    const pts = [...pointers.current.values()];
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      distance:
        pts.length === 2
          ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
          : 0,
      moved: false,
    };
    setDragging(true);
  }
  function pointerMove(e: ReactPointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const current = sort.current;
    if (current && current.pointerId === e.pointerId) {
      e.preventDefault();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const x = current.originX + (e.clientX - current.startX) / view.scale;
      setFloatingPoint({ x, y: current.y });
      const candidates = current.order
        .filter((id) => id !== current.id)
        .map((id) => ({ id, point: layout.nodes.get(id)! }));
      const target = candidates.sort(
        (a, b) => Math.abs(a.point.x - x) - Math.abs(b.point.x - x),
      )[0];
      if (target && Math.abs(target.point.x - x) < personCardWidth * 0.6) {
        const next = reorderPersonIds(
          data.people,
          current.order,
          current.id,
          target.id,
          x > target.point.x,
        );
        if (next.join() !== current.order.join()) {
          current.order = next;
          setPreviewOrder(next);
        }
      }
      return;
    }
    if (pendingPress.current) {
      if (
        Math.hypot(
          e.clientX - pendingPress.current.x,
          e.clientY - pendingPress.current.y,
        ) <= 8
      )
        return;
      cancelPress();
    }
    viewMode.current = "manual";
    const old = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (
      Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) >
      5
    )
      gesture.current.moved = true;
    if (pts.length === 2) {
      const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        rect = container.current!.getBoundingClientRect();
      if (gesture.current.distance)
        zoom(distance / gesture.current.distance, {
          x: (pts[0].x + pts[1].x) / 2 - rect.left,
          y: (pts[0].y + pts[1].y) / 2 - rect.top,
        });
      gesture.current.distance = distance;
    } else {
      setView((v) => ({
        ...v,
        x: v.x + e.clientX - old.x,
        y: v.y + e.clientY - old.y,
      }));
    }
    if (
      gesture.current.moved &&
      !container.current!.hasPointerCapture(e.pointerId)
    )
      container.current!.setPointerCapture(e.pointerId);
  }
  function pointerUp(e: ReactPointerEvent) {
    cancelPress();
    pointers.current.delete(e.pointerId);
    if (sort.current?.pointerId === e.pointerId) {
      const current = sort.current;
      const order = current.order;
      sort.current = null;
      setSortingId("");
      setFloatingPoint(null);
      setPreviewOrder(null);
      clickGuard.current = Date.now() + 600;
      if (
        e.type !== "pointercancel" &&
        order.join() !== current.initialOrder.join()
      )
        onReorder(order);
      if (container.current?.hasPointerCapture(e.pointerId))
        container.current.releasePointerCapture(e.pointerId);
      setDragging(false);
      return;
    }
    if (gesture.current.moved) clickGuard.current = Date.now() + 250;
    gesture.current.distance = 0;
    if (!pointers.current.size) setDragging(false);
  }
  function visible(p: Person) {
    return (
      (filter === "all" || branches.get(p.id)?.has(filter)) &&
      (!query || `${p.name}${p.relation}${p.tags.join("")}`.includes(query))
    );
  }
  const { edges, routes, siblings } = connections;
  return (
    <div
      className={`map-canvas ${tree ? "generation-tree" : ""} ${dragging ? "is-dragging" : ""} ${expandedFamily ? "friends-open" : ""} ${view.instant ? "preserve-map-view" : ""}`}
      style={
        {
          "--person-card-width": `${personCardWidth}px`,
          "--person-card-height": `${personCardHeight}px`,
        } as CSSProperties
      }
      ref={container}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      <div className="map-hint" role="status" aria-live="polite">
        <Hand size={13} />{" "}
        {sortingId
          ? "左右拖动排序 · 松手保存"
          : tree
            ? "同辈同层 · 长按人物排序 · 双指缩放"
            : "双指缩放，拖动发现更多家人"}
      </div>
      <div
        className="map-world"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transition: view.instant ? "none" : undefined,
        }}
      >
        {tree &&
          layout.generations.map((row) => (
            <div
              key={row.generation}
              className={`generation-band generation-${row.generation}`}
              style={{
                top: row.y + 6 - householdHeight / 2,
                height: householdHeight + 12,
                width: layout.width,
              }}
            />
          ))}
        {layout.groups.map((g) => (
          <div
            key={g.id}
            className={`${tree ? "tree-household" : "family-cluster"} ${filter !== "all" && !people.some((p) => p.familyId === g.familyId && branches.get(p.id)?.has(filter)) ? "dimmed" : ""} ${!tree && g.id === data.people.find((p) => p.id === data.selfId)?.familyId ? "my-cluster" : ""}`}
            style={
              {
                left: g.x - g.width / 2,
                top: g.y - g.height / 2,
                width: g.width,
                height: g.height,
                "--cluster": branchInfo[g.branch].light,
                "--cluster-ink": branchInfo[g.branch].color,
              } as CSSProperties
            }
          >
            <span className="cluster-label">
              {g.name && <Home size={13} />}
              <span className="cluster-name">{g.name}</span>
              {g.friendAnchor && (
                <button
                  className="cluster-add-friend"
                  aria-label={`为${g.name || "这个家庭"}添加家人或朋友`}
                  title="添加家人或朋友"
                  onClick={() => onAddPerson(g.familyId, "family")}
                >
                  <UserRoundPlus size={13} />
                </button>
              )}
            </span>
          </div>
        ))}
        {edges
          .filter((edge) => edge.partner)
          .map((edge) => {
            const a = layout.nodes.get(edge.from),
              b = layout.nodes.get(edge.to);
            if (
              !a ||
              !b ||
              a.y !== b.y ||
              Math.abs(a.x - b.x) > partnerSpacing + 1
            )
              return null;
            const from = data.people.find((p) => p.id === edge.from)!,
              to = data.people.find((p) => p.id === edge.to)!;
            return (
              <div
                key={`couple-${edge.from}-${edge.to}`}
                className={`couple-group ${!visible(from) && !visible(to) ? "dimmed" : ""}`}
                style={{
                  left: Math.min(a.x, b.x) - cardHalfWidth - 5,
                  top: a.y - cardHalfHeight - 5,
                  width: Math.abs(a.x - b.x) + personCardWidth + 10,
                  height: personCardHeight + 10,
                }}
              >
                <span title="伴侣">
                  <Heart size={10} fill="currentColor" />
                </span>
              </div>
            );
          })}
        <svg className="map-lines" width={layout.width} height={layout.height}>
          {routes.map((edge) => {
            const from = data.people.find((p) => p.id === edge.from)!,
              to = data.people.find((p) => p.id === edge.to)!;
            const hidden = !visible(from) || !visible(to);
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                className={edge.partner ? "partner-line" : "parent-line"}
                data-from={edge.from}
                data-to={edge.to}
                d={edge.path}
                fill="none"
                aria-hidden="true"
                stroke={edge.partner ? "#c78396" : tree ? "#7f9b79" : "#9ab294"}
                strokeWidth={edge.partner ? 2 : 1.8}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={hidden ? 0.12 : 0.85}
              />
            );
          })}
          {siblings.map((group) => (
            <g
              key={group.id}
              className={`sibling-links ${activeSibling === group.id ? "active" : ""} ${group.members.some((id) => visible(data.people.find((p) => p.id === id)!)) ? "" : "dimmed"}`}
              role="button"
              tabIndex={0}
              aria-pressed={activeSibling === group.id}
              aria-label={`查看${group.members
                .map((id) =>
                  personName(
                    data.people.find((p) => p.id === id)!,
                    data.selfId,
                  ),
                )
                .join("、")}的兄弟姐妹连线`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setActiveSibling((current) =>
                  current === group.id ? "" : group.id,
                );
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveSibling((current) =>
                    current === group.id ? "" : group.id,
                  );
                }
              }}
            >
              {group.paths.map((line) => (
                <g key={`${line.from}-${line.to}`}>
                  <path
                    className="sibling-visual"
                    vectorEffect="non-scaling-stroke"
                    data-from={line.from}
                    data-to={line.to}
                    d={line.path}
                  />
                  <path
                    className="sibling-hit"
                    vectorEffect="non-scaling-stroke"
                    d={line.path}
                  />
                </g>
              ))}
            </g>
          ))}
        </svg>
        {sortingId && layout.nodes.has(sortingId) && (
          <div
            className="sort-drop-slot"
            aria-hidden="true"
            style={{
              left: layout.nodes.get(sortingId)!.x - cardHalfWidth,
              top: layout.nodes.get(sortingId)!.y - cardHalfHeight,
            }}
          />
        )}
        {data.people
          .filter((p) => !isFriend(p))
          .map((p) => {
            const point = layout.nodes.get(p.id);
            if (!point) return null;
            const sides = branches.get(p.id);
            const branch =
              (filter !== "all" && sides?.has(filter)
                ? filter
                : sides?.values().next().value) ?? "other";
            const years = ageLabel(p);
            const actualPoint =
              p.id === sortingId && floatingPoint ? floatingPoint : point;
            return (
              <button
                key={p.id}
                data-person-id={p.id}
                className={`person-node gender-${p.gender} ${p.id === sortingId ? "sorting-node" : ""} ${p.deceased ? "deceased-node" : ""} ${p.id === data.selfId ? "self-node" : ""} ${p.id === selectedId ? "selected-node" : ""} ${!visible(p) ? "dimmed" : ""}`}
                style={
                  {
                    left: actualPoint.x - cardHalfWidth,
                    top: actualPoint.y - cardHalfHeight,
                    "--node-accent": branchInfo[branch].color,
                  } as CSSProperties
                }
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if (
                    !tree ||
                    !e.altKey ||
                    !["ArrowLeft", "ArrowRight"].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  const ids = rowOrder(p.id),
                    index = ids.indexOf(p.id),
                    direction = e.key === "ArrowLeft" ? -1 : 1;
                  let target = index + direction;
                  while (
                    target >= 0 &&
                    target < ids.length &&
                    (ids[target] === p.partnerId ||
                      data.people.find((other) => other.id === ids[target])
                        ?.partnerId === p.id)
                  )
                    target += direction;
                  if (ids[target]) {
                    viewMode.current = "manual";
                    onReorder(
                      reorderPersonIds(
                        data.people,
                        ids,
                        p.id,
                        ids[target],
                        direction > 0,
                      ),
                    );
                  }
                }}
                aria-description={
                  tree
                    ? "长按后左右拖动排序；键盘使用 Alt 加左右方向键"
                    : undefined
                }
                onClick={() => {
                  if (Date.now() > clickGuard.current) onSelect(p);
                }}
                aria-label={`查看${personName(p, data.selfId)}${p.id !== data.selfId && p.relation ? `，${p.relation}` : ""}${p.deceased ? "，已离世" : years ? `，${years}` : ""}${p.gender === "male" ? "，男" : p.gender === "female" ? "，女" : ""}`}
              >
                <span className="node-heading">
                  <Avatar person={p} size={64} shape="rounded" />
                  <span className="node-identity">
                    <strong title={personName(p, data.selfId)}>
                      {personName(p, data.selfId)}
                    </strong>
                    {p.deceased ? (
                      <Memorial />
                    ) : (
                      years && <em className="node-age">{years}</em>
                    )}
                  </span>
                </span>
                {p.id !== data.selfId && p.relation && (
                  <span className="node-relation">{p.relation}</span>
                )}
              </button>
            );
          })}
        {[...layout.friendGroups].map(([familyId, point]) => {
          const friends = data.people.filter(
            (p) => isFriend(p) && p.familyId === familyId,
          );
          const family = data.families.find((f) => f.id === familyId)!;
          const matching = friends.filter(visible).length;
          return (
            <button
              key={familyId}
              className={`person-node friend-bundle ${!matching ? "dimmed" : ""}`}
              style={{
                left: point.x - cardHalfWidth,
                top: point.y - cardHalfHeight,
              }}
              aria-label={`展开${familyName(family, people)}的朋友，共${friends.length}人`}
              aria-expanded={expandedFamily === familyId}
              onClick={() => {
                if (Date.now() > clickGuard.current)
                  setExpandedFamily(
                    expandedFamily === familyId ? "" : familyId,
                  );
              }}
            >
              <span className="friend-bundle-icon">
                <UsersRound size={22} />
              </span>
              <span>
                <strong>
                  朋友 <b>{friends.length}</b>
                </strong>
                <small>
                  {expandedFamily === familyId ? "点击收起" : "点击展开"}
                </small>
              </span>
              <ChevronRight size={13} />
            </button>
          );
        })}
      </div>
      {expandedFamily &&
        layout.friendGroups.has(expandedFamily) &&
        (() => {
          const point = layout.friendGroups.get(expandedFamily)!;
          const family = data.families.find((f) => f.id === expandedFamily)!;
          const friends = data.people.filter(
            (p) => isFriend(p) && p.familyId === expandedFamily,
          );
          return (
            <div
              className="friends-panel"
              style={{
                left: `clamp(10px, ${view.x + point.x * view.scale + 25}px, calc(100% - 290px))`,
                top: `clamp(42px, ${view.y + point.y * view.scale - 30}px, calc(100% - 280px))`,
              }}
              role="region"
              aria-label="家庭朋友列表"
            >
              <header>
                <div>
                  <strong>{familyName(family, people)}</strong>
                  <small>{friends.length} 位朋友</small>
                </div>
                <button
                  aria-label="收起朋友"
                  onClick={() => setExpandedFamily("")}
                >
                  <X size={16} />
                </button>
              </header>
              <div className="friends-list">
                {friends.filter(visible).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setExpandedFamily("");
                      onSelect(p);
                    }}
                  >
                    <Avatar person={p} size={34} />
                    <span>
                      <strong>{personName(p)}</strong>
                      <small>
                        {p.friendOfId
                          ? `${personName(data.people.find((m) => m.id === p.friendOfId)!)}的朋友`
                          : "家庭朋友"}
                      </small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
                {!friends.some(visible) && <p>当前筛选没有匹配的朋友</p>}
              </div>
              <button
                className="friend-panel-add"
                onClick={() => {
                  setExpandedFamily("");
                  onAddPerson(expandedFamily, "friend");
                }}
              >
                <UserRoundPlus size={16} />
                添加朋友
              </button>
            </div>
          );
        })()}
      {tree && (
        <div
          className={`generation-axis ${view.scale < 0.4 ? "compact-axis" : ""} ${view.scale < 0.2 ? "tiny-axis" : ""}`}
          aria-label="辈分层级"
        >
          {layout.generations.map((row) => (
            <div
              key={row.generation}
              className={`generation-label generation-${row.generation} ${row.generation === data.people.find((p) => p.id === data.selfId)?.generation ? "my-generation" : ""}`}
              style={{ top: view.y + row.y * view.scale }}
            >
              <strong>{generationNames[row.generation]}</strong>
              <small>{row.count ? `${row.count} 位家人` : "待记录"}</small>
            </div>
          ))}
        </div>
      )}
      <div className="map-legend">
        <span>
          <i className="gender-key male-key" />男
        </span>
        <span>
          <i className="gender-key female-key" />女
        </span>
        <span>
          <i className="solid-line" />
          亲子
        </span>
        <span>
          <i className="partner-key" />
          伴侣
        </span>
        <span>
          <i className="dash-line" />
          兄弟姐妹
        </span>
      </div>
      <div className="map-controls">
        <button
          title="查看全图"
          aria-label="查看全图"
          onClick={() => {
            viewMode.current = "full";
            setExpandedFamily("");
            fit(false);
          }}
        >
          <Scan size={18} />
        </button>
        <button
          title="回到我"
          aria-label="回到我"
          onClick={() => {
            viewMode.current = "self";
            setExpandedFamily("");
            fit(true, false, data.selfId);
          }}
        >
          <Crosshair size={18} />
        </button>
      </div>
    </div>
  );
}
