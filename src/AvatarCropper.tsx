import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { Sheet } from "./components";
import {
  clampCrop,
  cropSource,
  initialCrop,
  maximumCropZoom,
  zoomCrop,
} from "./avatarCrop";
import type { CropPoint, CropView } from "./avatarCrop";

export function AvatarCropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (avatar: string) => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [view, setView] = useState(initialCrop);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, CropPoint>());
  const gesture = useRef<{
    view: CropView;
    center: CropPoint;
    distance: number;
  }>({ view: initialCrop, center: { x: 0, y: 0 }, distance: 0 });
  useEffect(() => {
    let active = true;
    let decoded: ImageBitmap | undefined;
    createImageBitmap(file)
      .then((image) => {
        if (!active) {
          image.close();
          return;
        }
        decoded = image;
        setBitmap(image);
      })
      .catch(() => {
        if (active) setError("这张图片暂时无法读取，请换一张图片。");
      });
    return () => {
      active = false;
      decoded?.close();
    };
  }, [file]);
  useEffect(() => {
    const back = (event: Event) => {
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("jiazu:back", back);
    return () => window.removeEventListener("jiazu:back", back);
  }, [onCancel]);
  useEffect(() => {
    if (!bitmap || !canvas.current) return;
    const context = canvas.current.getContext("2d");
    if (!context) return;
    const source = cropSource(view, bitmap.width, bitmap.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 600, 600);
    context.drawImage(
      bitmap,
      source.x,
      source.y,
      source.side,
      source.side,
      0,
      0,
      600,
      600,
    );
  }, [bitmap, view]);
  function zoom(value: number) {
    if (bitmap)
      setView((current) =>
        zoomCrop(current, value, bitmap.width, bitmap.height),
      );
  }
  function metrics() {
    const points = [...pointers.current.values()];
    const first = points[0] ?? { x: 0, y: 0 },
      second = points[1] ?? first;
    return {
      center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      distance: Math.hypot(second.x - first.x, second.y - first.y),
    };
  }
  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (!bitmap || (event.pointerType === "mouse" && event.button !== 0))
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    pointers.current.set(event.pointerId, {
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
    });
    gesture.current = { view, ...metrics() };
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!bitmap || !pointers.current.has(event.pointerId)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointers.current.set(event.pointerId, {
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
    });
    const current = metrics(),
      start = gesture.current;
    const scaled =
      start.distance > 0 && current.distance > 0
        ? zoomCrop(
            start.view,
            (start.view.zoom * current.distance) / start.distance,
            bitmap.width,
            bitmap.height,
            start.center,
          )
        : start.view;
    setView(
      clampCrop(
        {
          ...scaled,
          x: scaled.x + current.center.x - start.center.x,
          y: scaled.y + current.center.y - start.center.y,
        },
        bitmap.width,
        bitmap.height,
      ),
    );
  }
  function up(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    gesture.current = { view, ...metrics() };
  }
  function confirm() {
    if (!bitmap) return;
    try {
      const output = document.createElement("canvas");
      output.width = output.height = 240;
      const context = output.getContext("2d");
      if (!context) throw new Error();
      const source = cropSource(view, bitmap.width, bitmap.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 240, 240);
      context.drawImage(
        bitmap,
        source.x,
        source.y,
        source.side,
        source.side,
        0,
        0,
        240,
        240,
      );
      onConfirm(output.toDataURL("image/jpeg", 0.88));
    } catch {
      setError("暂时无法生成头像，请重试或换一张图片。");
    }
  }
  return createPortal(
    <div className="avatar-crop-layer">
      <Sheet title="调整头像" onClose={onCancel} dismissOnBackdrop={false}>
        <div className="avatar-crop-body">
          <p className="crop-instructions">
            拖动照片选择位置，双指或滑动下方调整大小
          </p>
          <div
            className="avatar-crop-stage"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            <canvas
              ref={canvas}
              width={600}
              height={600}
              aria-label="头像裁剪预览"
            />
            <div className="avatar-crop-guide" />
            {!bitmap && !error && (
              <span className="crop-loading" role="status">
                正在读取图片…
              </span>
            )}
          </div>
          <div className="avatar-crop-controls">
            <button
              type="button"
              aria-label="缩小头像"
              disabled={!bitmap || view.zoom <= 1}
              onClick={() => zoom(view.zoom - 0.25)}
            >
              <Minus size={18} />
            </button>
            <input
              type="range"
              aria-label="头像缩放"
              min="1"
              max={maximumCropZoom}
              step="0.01"
              value={view.zoom}
              disabled={!bitmap}
              onChange={(event) => zoom(Number(event.target.value))}
            />
            <button
              type="button"
              aria-label="放大头像"
              disabled={!bitmap || view.zoom >= maximumCropZoom}
              onClick={() => zoom(view.zoom + 0.25)}
            >
              <Plus size={18} />
            </button>
            <output aria-live="polite">{view.zoom.toFixed(2)}×</output>
          </div>
          <button
            type="button"
            className="crop-reset"
            disabled={!bitmap}
            onClick={() => setView(initialCrop)}
          >
            <RotateCcw size={14} />
            重置位置与大小
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onCancel}
            >
              取消
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!bitmap}
              onClick={confirm}
            >
              <Check size={17} />
              使用此头像
            </button>
          </div>
        </div>
      </Sheet>
    </div>,
    document.body,
  );
}
