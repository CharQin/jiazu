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
  isFriend,
  personName,
  familyName,
  visibleFamilyMembers,
  ageLabel,
} from "./model";
import { generationName } from "./generations";
import { automaticHouseholds, householdPairs } from "./households";
import { deriveBranches } from "./kinship";
import type { Branch, FamilyData, Person } from "./model";
import { makeGenerationLayout } from "./treeLayout";
import type { GenerationRow } from "./treeLayout";
import {
  centerMapView,
  confineTreeView,
  fitMapView,
  retainMapView,
  zoomMapView,
} from "./mapViewport";
import type { MapView } from "./mapViewport";
import { routeFamilyMap } from "./mapRouting";
import { reorderPersonIds } from "./personOrdering";
import { kinshipOrdering } from "./kinshipOrdering";
import {
  generationSpacing,
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
  const partners = householdPairs(data.people);
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
          (m) => !placed.has(m.id) && m.id === partners.get(p.id),
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
  focusVersion,
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
  focusVersion: number;
  onAddPerson: (
    familyId: string,
    kind: "family" | "friend",
    friendOfId?: string,
  ) => void;
  onReorder: (ids: string[]) => void;
}) {
  const { selfId } = data;
  const mapData = useMemo(
    () => (tree ? data : automaticHouseholds(data, true)),
    [data, tree],
  );
  const people = useMemo(() => {
    // Apply starter visibility to the stored data, before regrouping for display.
    const shown = new Set(visibleFamilyMembers(data).map((p) => p.id));
    return mapData.people.filter((p) => shown.has(p.id));
  }, [data, mapData]);
  const branches = useMemo(() => deriveBranches(data), [data]);
  const layout = useMemo(
    () => makeLayout({ people, families: mapData.families, selfId }, tree),
    [people, mapData.families, selfId, tree],
  );
  function addToGroup(familyId: string, kind: "family" | "friend") {
    const host = people.find((p) => p.familyId === familyId && !isFriend(p));
    const originalFamily =
      data.people.find((p) => p.id === host?.id)?.familyId ?? familyId;
    onAddPerson(originalFamily, kind, kind === "friend" ? host?.id : undefined);
  }
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
  const sort = useRef<{
    id: string;
    pointerId: number;
    order: string[];
    initialOrder: string[];
    positions: Map<string, Position>;
    startX: number;
    originX: number;
    node: HTMLElement;
    lastTarget?: string;
  } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPress = useRef<{
    id: string;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const [expandedFamily, setExpandedFamily] = useState(() => {
    const focus = mapData.people.find((p) => p.id === focusId);
    return focus && isFriend(focus) ? focus.familyId : "";
  });
  const pointers = useRef(new Map<number, Position>());
  const gesture = useRef({ x: 0, y: 0, moved: false });
  const clickGuard = useRef(0);
  const viewMode = useRef<"auto" | "full" | "self" | "focus" | "manual">(
    "auto",
  );
  const previous = useRef<{
    tree: boolean;
    selfId: string;
    focusVersion: number;
    layout: Layout;
  } | null>(null);
  const viewportSize = useRef({ width: 0, height: 0 });
  const minScale = useRef(0.12);
  const bounds = useMemo(() => {
    let left = Infinity,
      right = -Infinity,
      top = Infinity,
      bottom = -Infinity;
    function include(x: number, y: number) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    for (const g of layout.groups) {
      include(g.x - g.width / 2, g.y - g.height / 2);
      include(g.x + g.width / 2, g.y + g.height / 2);
    }
    for (const p of linePoints) include(p.x, p.y);
    if (!Number.isFinite(left))
      return { left: 0, right: layout.width, top: 0, bottom: layout.height };
    return {
      left: left - 8,
      right: right + 8,
      top: top - 8,
      bottom: bottom + 8,
    };
  }, [layout, linePoints]);
  const focused = mapData.people.find((p) => p.id === focusId);
  const friendFocus = focused && isFriend(focused) ? focused.familyId : "";
  const focusPoint =
    layout.nodes.get(focusId) ?? layout.friendGroups.get(friendFocus);
  const fit = useCallback(
    (
      mode: "full" | "self" | "focus" | "auto",
      viewport: { width: number; height: number },
      keepScale = false,
    ) => {
      const full = fitMapView(bounds, viewport, tree);
      const overview = Math.min(
        0.95,
        Math.max(1, viewport.height - 100) /
          Math.max(1, bounds.bottom - bounds.top),
      );
      minScale.current = Math.min(0.12, full.scale, overview);
      const reference = layout.nodes.get(selfId) ?? {
        x: layout.width / 2,
        y: layout.height / 2,
      };
      const defaultScale = viewport.width < 600 ? 0.78 : 0.95;
      if (
        mode === "full" ||
        (mode === "auto" && !tree && viewport.width >= 600)
      )
        setView(full);
      else if (mode === "focus" && focusPoint)
        setView((view) => {
          const target =
            focused && isFriend(focused)
              ? { x: focusPoint.x, y: focusPoint.y + 100 }
              : focusPoint;
          const readableScale = keepScale
            ? Math.max(defaultScale, view.scale)
            : defaultScale;
          const cardFits = Math.max(
            0.1,
            Math.min(
              (viewport.width - (tree ? 72 : 0) - 16) / personCardWidth,
              (viewport.height - 60) / personCardHeight,
            ),
          );
          return centerMapView(
            target,
            Math.min(cardFits, readableScale),
            viewport,
            tree,
          );
        });
      else if (mode === "self" || !tree)
        setView(centerMapView(reference, defaultScale, viewport, tree));
      else
        setView(
          centerMapView(
            {
              x: layout.width / 2,
              y: (bounds.top + bounds.bottom) / 2,
            },
            overview,
            viewport,
            tree,
          ),
        );
    },
    [bounds, focusPoint, focused, layout, selfId, tree],
  );
  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const viewport = el.getBoundingClientRect();
    const before = previous.current;
    previous.current = { tree, selfId, focusVersion, layout };
    const newContext =
      !before || before.tree !== tree || before.selfId !== selfId;
    const newFocus =
      Boolean(focusPoint) &&
      (newContext || before.focusVersion !== focusVersion);
    const measure = () => {
      const size = el.getBoundingClientRect();
      minScale.current = Math.min(0.12, fitMapView(bounds, size, tree).scale);
      return size;
    };
    measure();
    if (newFocus || newContext) {
      viewMode.current = newFocus ? "focus" : "auto";
      setExpandedFamily(newFocus ? friendFocus : "");
      fit(viewMode.current, viewport, !newContext);
    } else if (before.layout !== layout && !sort.current) {
      const points = (map: Layout) =>
        new Map([
          ...[...map.nodes].map(
            ([id, point]) => [`person:${id}`, point] as const,
          ),
          ...[...map.friendGroups].map(
            ([id, point]) => [`friends:${id}`, point] as const,
          ),
        ]);
      // Saving or deleting data should keep the viewed branch in place.
      viewMode.current = "manual";
      setView((v) => {
        const retained = retainMapView(
          v,
          points(before.layout),
          points(layout),
          viewport,
          tree,
        );
        return {
          ...(tree
            ? confineTreeView(retained, layout.width, viewport.width)
            : retained),
          instant: true,
        };
      });
    }
    if (!viewportSize.current.width || newContext)
      viewportSize.current = viewport;
    const observer = new ResizeObserver(() => {
      const size = measure();
      const last = viewportSize.current;
      if (size.width === last.width && size.height === last.height) return;
      viewportSize.current = size;
      if (viewMode.current === "manual" || viewMode.current === "focus")
        setView((v) => ({
          ...v,
          x: v.x + (size.width - last.width) / 2,
          y: v.y + (size.height - last.height) / 2,
        }));
      else fit(viewMode.current, size);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    bounds,
    fit,
    focusPoint,
    friendFocus,
    focusVersion,
    layout,
    selfId,
    tree,
  ]);
  const world = useRef<HTMLDivElement>(null);
  const generationLabels = useRef<HTMLDivElement>(null);
  const friendsPanel = useRef<HTMLDivElement>(null);
  const liveView = useRef<MapView>(view);
  const motionFrame = useRef(0);
  const gestureRect = useRef({ left: 0, top: 0 });
  const panelPoint = layout.friendGroups.get(expandedFamily);
  // Pan and pinch paint only the moving layer. Commit React state at the end
  // so moving one finger does not reconcile every person and connection.
  useLayoutEffect(() => {
    if (!pointers.current.size) liveView.current = view;
  }, [view]);
  useEffect(() => () => cancelAnimationFrame(motionFrame.current), []);
  function paintMap() {
    const { x, y, scale } = liveView.current;
    if (world.current)
      world.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    if (generationLabels.current) {
      generationLabels.current.style.transform = `translate3d(0, ${y}px, 0)`;
      const value = String(scale);
      if (
        generationLabels.current.style.getPropertyValue("--label-scale") !==
        value
      )
        generationLabels.current.style.setProperty("--label-scale", value);
    }
    if (friendsPanel.current && panelPoint) {
      friendsPanel.current.style.left = `clamp(10px, ${x + panelPoint.x * scale + 25}px, calc(100% - 290px))`;
      friendsPanel.current.style.top = `clamp(42px, ${y + panelPoint.y * scale - 30}px, calc(100% - 280px))`;
    }
  }
  function moveMap(next: MapView) {
    viewMode.current = "manual";
    liveView.current = tree
      ? confineTreeView(next, layout.width, viewportSize.current.width)
      : next;
    if (motionFrame.current) return;
    motionFrame.current = requestAnimationFrame(() => {
      motionFrame.current = 0;
      paintMap();
    });
  }
  const wheelZoom = useCallback(
    (factor: number, point: Position) => {
      viewMode.current = "manual";
      setView((v) => {
        const next = zoomMapView(
          v,
          factor,
          Math.min(minScale.current, v.scale),
          point,
        );
        return {
          ...(tree
            ? confineTreeView(next, layout.width, viewportSize.current.width)
            : next),
          instant: true,
        };
      });
    },
    [tree, layout.width],
  );
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest(".friends-panel")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      wheelZoom(Math.exp(-e.deltaY * 0.002), {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [wheelZoom]);
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
    if (sort.current) sort.current.node.style.transform = "";
    sort.current = null;
    cancelPress();
    setSortingId("");
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
    if (pointers.current.size >= 2) return;
    if (!pointers.current.size)
      gestureRect.current = e.currentTarget.getBoundingClientRect();
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
          positions: new Map(
            order.map((member) => [member, layout.nodes.get(member)!]),
          ),
          startX: pending.x,
          originX: point.x,
          node,
        };
        setSortingId(id);
        viewMode.current = "manual";
        container.current?.setPointerCapture(pending.pointerId);
        clickGuard.current = Date.now() + 600;
      }, 450);
    }
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      moved: pointers.current.size > 1,
    };
    setDragging(true);
  }
  function pointerMove(e: ReactPointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const current = sort.current;
    if (current && current.pointerId === e.pointerId) {
      e.preventDefault();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const dx = (e.clientX - current.startX) / liveView.current.scale;
      const x = current.originX + dx;
      current.node.style.transform = `translate3d(${dx}px, 0, 0)`;
      let closest: { id: string; x: number } | undefined;
      for (const [id, point] of current.positions) {
        if (id === current.id || Math.abs(point.x - x) >= personCardWidth * 0.6)
          continue;
        if (!closest || Math.abs(point.x - x) < Math.abs(closest.x - x))
          closest = { id, x: point.x };
      }
      if (closest) {
        const after = x > closest.x;
        const key = JSON.stringify([closest.id, after]);
        if (key !== current.lastTarget) {
          current.lastTarget = key;
          current.order = reorderPersonIds(
            data.people,
            current.initialOrder,
            current.id,
            closest.id,
            after,
          );
        }
      } else if (Math.abs(dx) < personCardWidth * 0.4) {
        current.lastTarget = undefined;
        current.order = current.initialOrder;
      }
      return;
    }
    if (!gesture.current.moved) {
      // Apply the same small tap tolerance on a card and on the canvas.
      if (
        Math.hypot(
          e.clientX - gesture.current.x,
          e.clientY - gesture.current.y,
        ) < 4
      )
        return;
      gesture.current.moved = true;
      cancelPress();
    }
    const old = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const currentView = liveView.current;
    if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(
        ([id]) => id !== e.pointerId,
      )![1];
      const distance = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const previousDistance = Math.hypot(old.x - other.x, old.y - other.y);
      const { left, top } = gestureRect.current;
      if (distance > 0 && previousDistance > 0)
        moveMap(
          zoomMapView(
            currentView,
            distance / previousDistance,
            Math.min(minScale.current, currentView.scale),
            { x: (old.x + other.x) / 2 - left, y: (old.y + other.y) / 2 - top },
            {
              x: (e.clientX + other.x) / 2 - left,
              y: (e.clientY + other.y) / 2 - top,
            },
          ),
        );
    } else {
      moveMap({
        ...currentView,
        x: currentView.x + e.clientX - old.x,
        y: currentView.y + e.clientY - old.y,
      });
    }
    if (!e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerUp(e: ReactPointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    cancelPress();
    pointers.current.delete(e.pointerId);
    if (sort.current?.pointerId === e.pointerId) {
      const current = sort.current;
      const order = current.order;
      current.node.style.transform = "";
      sort.current = null;
      setSortingId("");
      clickGuard.current = Date.now() + 600;
      if (
        e.type === "pointerup" &&
        order.join() !== current.initialOrder.join()
      )
        onReorder(order);
      if (container.current?.hasPointerCapture(e.pointerId))
        container.current.releasePointerCapture(e.pointerId);
      setDragging(false);
      return;
    }
    if (gesture.current.moved) clickGuard.current = Date.now() + 250;
    if (!pointers.current.size) {
      if (motionFrame.current) {
        cancelAnimationFrame(motionFrame.current);
        motionFrame.current = 0;
        paintMap();
      }
      if (gesture.current.moved)
        setView({ ...liveView.current, instant: true });
      setDragging(false);
    }
  }
  function visible(p: Person) {
    return (
      (filter === "all" || branches.get(p.id)?.has(filter)) &&
      (!query || `${p.name}${p.relation}${p.tags.join("")}`.includes(query))
    );
  }
  const { edges, routes, siblings } = connections;
  const axisStep = Math.max(
    1,
    Math.ceil(20 / (view.scale * generationSpacing)),
  );
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
      onLostPointerCapture={(e) => {
        // Mobile browsers implicitly capture on the touched card. That card
        // loses capture when the canvas takes over; the finger is still down.
        if (e.target === e.currentTarget) pointerUp(e);
      }}
      onPointerLeave={(e) => {
        if (
          pointers.current.has(e.pointerId) &&
          !e.currentTarget.hasPointerCapture(e.pointerId)
        )
          pointerUp(e);
      }}
      onScroll={(e) => {
        e.currentTarget.scrollLeft = 0;
        e.currentTarget.scrollTop = 0;
      }}
    >
      <div className="map-hint" role="status" aria-live="polite">
        <Hand size={13} />{" "}
        {sortingId
          ? "左右拖动排序 · 越过伴侣可换位"
          : tree
            ? "同辈同层 · 长按人物排序 · 双指缩放"
            : "双指缩放，拖动发现更多家人"}
      </div>
      <div
        className="map-world"
        ref={world}
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
          transition: view.instant ? "none" : undefined,
        }}
      >
        {tree &&
          layout.generations.map((row) => (
            <div
              key={row.generation}
              className={`generation-band generation-${Math.max(0, Math.min(4, row.generation))}`}
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
            className={`${tree ? "tree-household" : "family-cluster"} ${filter !== "all" && !people.some((p) => p.familyId === g.familyId && branches.get(p.id)?.has(filter)) ? "dimmed" : ""} ${!tree && g.id === mapData.people.find((p) => p.id === selfId)?.familyId ? "my-cluster" : ""}`}
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
                  onClick={() => addToGroup(g.familyId, "family")}
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
            return (
              <button
                key={p.id}
                data-person-id={p.id}
                className={`person-node gender-${p.gender} ${p.id === sortingId ? "sorting-node" : ""} ${p.deceased ? "deceased-node" : ""} ${p.id === data.selfId ? "self-node" : ""} ${p.id === selectedId ? "selected-node" : ""} ${!visible(p) ? "dimmed" : ""}`}
                style={
                  {
                    left: point.x - cardHalfWidth,
                    top: point.y - cardHalfHeight,
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
                  const target = index + direction;
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
          const friends = people.filter(
            (p) => isFriend(p) && p.familyId === familyId,
          );
          const family = mapData.families.find((f) => f.id === familyId)!;
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
          const family = mapData.families.find((f) => f.id === expandedFamily)!;
          const friends = people.filter(
            (p) => isFriend(p) && p.familyId === expandedFamily,
          );
          return (
            <div
              className="friends-panel"
              ref={friendsPanel}
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
                          ? `${personName(data.people.find((m) => m.id === p.friendOfId) ?? p)}的朋友`
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
                  addToGroup(expandedFamily, "friend");
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
          <div
            className="generation-labels"
            ref={generationLabels}
            style={
              {
                transform: `translate3d(0, ${view.y}px, 0)`,
                "--label-scale": view.scale,
              } as CSSProperties
            }
          >
            {layout.generations
              .filter((_, i) => i % axisStep === 0)
              .map((row) => (
                <div
                  key={row.generation}
                  className={`generation-label generation-${Math.max(0, Math.min(4, row.generation))} ${row.generation === data.people.find((p) => p.id === data.selfId)?.generation ? "my-generation" : ""}`}
                  style={{ "--label-y": `${row.y}px` } as CSSProperties}
                >
                  <strong>{generationName(row.generation)}</strong>
                  <small>{row.count ? `${row.count} 位家人` : "待记录"}</small>
                </div>
              ))}
          </div>
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
            if (container.current)
              fit("full", container.current.getBoundingClientRect());
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
            if (container.current)
              fit("self", container.current.getBoundingClientRect());
          }}
        >
          <Crosshair size={18} />
        </button>
      </div>
    </div>
  );
}
