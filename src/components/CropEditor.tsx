import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ImageInfo, CropBox } from '../types';

interface CropEditorProps {
  originalImage: ImageInfo;
  cropBox: CropBox;
  onChangeCropBox: (box: CropBox) => void;
}

type HandleType =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'move';

export const CropEditor: React.FC<CropEditorProps> = ({
  originalImage,
  cropBox,
  onChangeCropBox,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 400, height: 400 });
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initialBox: CropBox;
  } | null>(null);

  // Measure container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w > 0 && h > 0) {
          setContainerSize({ width: w, height: h });
        }
      }
    };
    updateSize();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    ro.observe(containerRef.current);

    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Compute fitted image rectangle inside the container (leaving space for padding and top bar)
  const padding = 20;
  const availW = Math.max(10, containerSize.width - padding * 2);
  const availH = Math.max(10, containerSize.height - padding * 2);

  const imgAspect = originalImage.widthPx / originalImage.heightPx;
  let displayW = availW;
  let displayH = displayW / imgAspect;

  if (displayH > availH) {
    displayH = availH;
    displayW = displayH * imgAspect;
  }

  const offsetX = (containerSize.width - displayW) / 2;
  const offsetY = (containerSize.height - displayH) / 2;

  // Normalized crop coordinates
  const [x1, y1, x2, y2] = cropBox;

  // Pointer drag handling
  const handlePointerDown = (handle: HandleType, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setActiveHandle(handle);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialBox: [...cropBox] as CropBox,
    };
  };

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!activeHandle || !dragStartRef.current || displayW <= 0 || displayH <= 0) return;

      const { startX, startY, initialBox } = dragStartRef.current;
      const deltaX = (e.clientX - startX) / displayW;
      const deltaY = (e.clientY - startY) / displayH;

      let [nx1, ny1, nx2, ny2] = initialBox;
      const minSize = 0.03; // Minimum 3% of dimension

      if (activeHandle === 'move') {
        const boxW = nx2 - nx1;
        const boxH = ny2 - ny1;
        nx1 = Math.max(0, Math.min(1 - boxW, nx1 + deltaX));
        ny1 = Math.max(0, Math.min(1 - boxH, ny1 + deltaY));
        nx2 = nx1 + boxW;
        ny2 = ny1 + boxH;
      } else {
        if (activeHandle.includes('w')) {
          nx1 = Math.max(0, Math.min(nx2 - minSize, nx1 + deltaX));
        }
        if (activeHandle.includes('e')) {
          nx2 = Math.min(1, Math.max(nx1 + minSize, nx2 + deltaX));
        }
        if (activeHandle.includes('n')) {
          ny1 = Math.max(0, Math.min(ny2 - minSize, ny1 + deltaY));
        }
        if (activeHandle.includes('s')) {
          ny2 = Math.min(1, Math.max(ny1 + minSize, ny2 + deltaY));
        }
      }

      onChangeCropBox([nx1, ny1, nx2, ny2]);
    },
    [activeHandle, displayW, displayH, onChangeCropBox]
  );

  const handlePointerUp = useCallback(() => {
    setActiveHandle(null);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    if (activeHandle) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [activeHandle, handlePointerMove, handlePointerUp]);

  return (
    <div
      ref={containerRef}
      className="relative w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-full bg-slate-200/90 border border-slate-300 shadow-inner rounded-xl overflow-hidden select-none flex flex-col justify-between"
      style={{ touchAction: 'none' }}
    >
      {/* Main Image Display */}
      {displayW > 0 && displayH > 0 && (
        <div
          className="absolute shadow-lg border border-slate-300"
          style={{
            left: `${offsetX}px`,
            top: `${offsetY}px`,
            width: `${displayW}px`,
            height: `${displayH}px`,
          }}
        >
          {/* Base Image */}
          <img
            src={originalImage.url}
            alt="Imagem original"
            className="w-full h-full object-fill pointer-events-none"
            draggable={false}
          />

          {/* Dark Overlay Outside Selection */}
          {/* Top Mask */}
          <div
            className="absolute left-0 top-0 right-0 bg-black/60 pointer-events-none"
            style={{ height: `${y1 * 100}%` }}
          />
          {/* Bottom Mask */}
          <div
            className="absolute left-0 bottom-0 right-0 bg-black/60 pointer-events-none"
            style={{ height: `${(1 - y2) * 100}%` }}
          />
          {/* Left Mask */}
          <div
            className="absolute left-0 bg-black/60 pointer-events-none"
            style={{
              top: `${y1 * 100}%`,
              height: `${(y2 - y1) * 100}%`,
              width: `${x1 * 100}%`,
            }}
          />
          {/* Right Mask */}
          <div
            className="absolute right-0 bg-black/60 pointer-events-none"
            style={{
              top: `${y1 * 100}%`,
              height: `${(y2 - y1) * 100}%`,
              width: `${(1 - x2) * 100}%`,
            }}
          />

          {/* Crop Box Window */}
          <div
            className="absolute border-2 border-blue-400 shadow-2xl cursor-move"
            style={{
              left: `${x1 * 100}%`,
              top: `${y1 * 100}%`,
              width: `${(x2 - x1) * 100}%`,
              height: `${(y2 - y1) * 100}%`,
            }}
            onPointerDown={(e) => handlePointerDown('move', e)}
          >
            {/* Rule of Thirds Grid Guidelines */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
              <div className="border-r border-b border-white/25" />
              <div className="border-r border-b border-white/25" />
              <div className="border-b border-white/25" />
              <div className="border-r border-b border-white/25" />
              <div className="border-r border-b border-white/25" />
              <div className="border-b border-white/25" />
              <div className="border-r border-white/25" />
              <div className="border-r border-white/25" />
              <div />
            </div>

            {/* Corner Handles */}
            {/* Top-Left */}
            <div
              className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-sm shadow-md cursor-nwse-resize z-20 flex items-center justify-center hover:scale-125 transition-transform"
              onPointerDown={(e) => handlePointerDown('nw', e)}
            />
            {/* Top-Right */}
            <div
              className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-sm shadow-md cursor-nesw-resize z-20 flex items-center justify-center hover:scale-125 transition-transform"
              onPointerDown={(e) => handlePointerDown('ne', e)}
            />
            {/* Bottom-Right */}
            <div
              className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-sm shadow-md cursor-nwse-resize z-20 flex items-center justify-center hover:scale-125 transition-transform"
              onPointerDown={(e) => handlePointerDown('se', e)}
            />
            {/* Bottom-Left */}
            <div
              className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-sm shadow-md cursor-nesw-resize z-20 flex items-center justify-center hover:scale-125 transition-transform"
              onPointerDown={(e) => handlePointerDown('sw', e)}
            />

            {/* Edge Midpoint Handles */}
            {/* Top */}
            <div
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-7 h-3 bg-white border-2 border-blue-600 rounded-sm shadow-md cursor-ns-resize z-20 hover:scale-110 transition-transform"
              onPointerDown={(e) => handlePointerDown('n', e)}
            />
            {/* Right */}
            <div
              className="absolute -right-2 top-1/2 -translate-y-1/2 w-3 h-7 bg-white border-2 border-blue-600 rounded-sm shadow-md cursor-ew-resize z-20 hover:scale-110 transition-transform"
              onPointerDown={(e) => handlePointerDown('e', e)}
            />
            {/* Bottom */}
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-7 h-3 bg-white border-2 border-blue-600 rounded-sm shadow-md cursor-ns-resize z-20 hover:scale-110 transition-transform"
              onPointerDown={(e) => handlePointerDown('s', e)}
            />
            {/* Left */}
            <div
              className="absolute -left-2 top-1/2 -translate-y-1/2 w-3 h-7 bg-white border-2 border-blue-600 rounded-sm shadow-md cursor-ew-resize z-20 hover:scale-110 transition-transform"
              onPointerDown={(e) => handlePointerDown('w', e)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
