export interface MapBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface MapView {
  x: number;
  y: number;
  scale: number;
}
type MapPoint = { x: number; y: number };

// Layout coordinates can shift after a deletion (even by a whole generation).
// Keep the nearest surviving card in the same screen position at the same zoom.
export function retainMapView(
  view: MapView,
  previous: ReadonlyMap<string, MapPoint>,
  next: ReadonlyMap<string, MapPoint>,
  viewport: { width: number; height: number },
  tree: boolean,
): MapView {
  const center = {
    x: (viewport.width + (tree ? 72 : 0)) / 2,
    y: (viewport.height - 32) / 2,
  };
  let anchor: { before: MapPoint; after: MapPoint } | undefined;
  let distance = Infinity;
  for (const [id, before] of previous) {
    const after = next.get(id);
    if (!after) continue;
    const score = Math.hypot(
      before.x * view.scale + view.x - center.x,
      before.y * view.scale + view.y - center.y,
    );
    if (score < distance) {
      anchor = { before, after };
      distance = score;
    }
  }
  if (!anchor) return view;
  return {
    scale: view.scale,
    x: view.x + (anchor.before.x - anchor.after.x) * view.scale,
    y: view.y + (anchor.before.y - anchor.after.y) * view.scale,
  };
}

export function fitMapView(
  bounds: MapBounds,
  viewport: { width: number; height: number },
  tree: boolean,
) {
  const left = tree ? 84 : 16,
    right = 16,
    top = 40,
    bottom = 60;
  const width = Math.max(1, viewport.width - left - right);
  const height = Math.max(1, viewport.height - top - bottom);
  const scale = Math.min(
    width / Math.max(1, bounds.right - bounds.left),
    height / Math.max(1, bounds.bottom - bounds.top),
    1.1,
  );
  return {
    scale,
    x: left + width / 2 - ((bounds.left + bounds.right) / 2) * scale,
    y: top + height / 2 - ((bounds.top + bounds.bottom) / 2) * scale,
  };
}
