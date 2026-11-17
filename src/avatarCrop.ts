export interface CropView {
  zoom: number;
  x: number;
  y: number;
}
export interface CropPoint {
  x: number;
  y: number;
}
export const initialCrop: CropView = { zoom: 1, x: 0, y: 0 };
export const maximumCropZoom = 5;

// Offsets use the crop square's side as one unit, independent of screen size.
export function clampCrop(
  view: CropView,
  width: number,
  height: number,
): CropView {
  const zoom = Math.max(1, Math.min(maximumCropZoom, view.zoom));
  const side = Math.min(width, height);
  const limitX = ((width / side) * zoom - 1) / 2;
  const limitY = ((height / side) * zoom - 1) / 2;
  return {
    zoom,
    x: Math.max(-limitX, Math.min(limitX, view.x)) || 0,
    y: Math.max(-limitY, Math.min(limitY, view.y)) || 0,
  };
}

export function zoomCrop(
  view: CropView,
  zoom: number,
  width: number,
  height: number,
  focus: CropPoint = { x: 0, y: 0 },
) {
  const next = Math.max(1, Math.min(maximumCropZoom, zoom));
  const ratio = next / view.zoom;
  return clampCrop(
    {
      zoom: next,
      x: focus.x - (focus.x - view.x) * ratio,
      y: focus.y - (focus.y - view.y) * ratio,
    },
    width,
    height,
  );
}

export function cropSource(view: CropView, width: number, height: number) {
  const bounded = clampCrop(view, width, height);
  const side = Math.min(width, height) / bounded.zoom;
  return {
    x: width / 2 - (0.5 + bounded.x) * side,
    y: height / 2 - (0.5 + bounded.y) * side,
    side,
  };
}
