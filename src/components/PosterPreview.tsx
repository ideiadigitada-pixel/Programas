import React, { useMemo, useRef, useState, useEffect } from 'react';
import { PosterConfig, ImageInfo } from '../types';
import { calculatePosterSheets, getPageDimensions } from '../utils/calculations';

interface PosterPreviewProps {
  imageInfo: ImageInfo | null;
  config: PosterConfig;
}

export const PosterPreview: React.FC<PosterPreviewProps> = ({ imageInfo, config }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 360,
    height: 430,
  });

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
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const page = getPageDimensions(config.orientation);

  const { sheets, nonEmptySheets, usableW, usableH } = useMemo(() => {
    if (!imageInfo) {
      return {
        sheets: [],
        totalSheets: config.fH * config.fV,
        nonEmptySheets: 0,
        usableW: page.width - config.marginCm * 2,
        usableH: page.height - config.marginCm * 2,
      };
    }
    return calculatePosterSheets(config, imageInfo.widthPx, imageInfo.heightPx);
  }, [imageInfo, config, page.width, page.height]);

  if (!imageInfo) {
    return (
      <div className="w-full aspect-[4/3] min-h-[360px] sm:min-h-[460px] lg:min-h-[560px] xl:min-h-[620px] bg-white border border-dashed border-slate-300 flex flex-col items-center justify-center p-6 text-center text-slate-500 shadow-xs rounded-xl">
        <div className="w-16 h-16 mb-3 rounded-full bg-blue-50 border border-blue-100 shadow-xs flex items-center justify-center text-blue-600">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="font-bold text-slate-800 text-sm sm:text-base">Nenhuma imagem selecionada</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Toque no botão &quot;Inserir Imagem&quot; ou arraste um arquivo até aqui para começar.
        </p>
      </div>
    );
  }

  // Calculate strict scale so every sheet is exactly proportional to A4 (21 x 29.7 cm or 29.7 x 21 cm)
  const gapPx = config.fH >= 6 || config.fV >= 6 ? 1.5 : config.fH >= 3 || config.fV >= 3 ? 2 : 3;
  // Safety margin so the grid never touches the outer borders of the visualization area
  const safetyMarginPx = 6;

  const totalGridCmW = config.fH * page.width;
  const totalGridCmH = config.fV * page.height;

  const totalGapsW = (config.fH - 1) * gapPx;
  const totalGapsH = (config.fV - 1) * gapPx;

  const availableW = Math.max(10, containerSize.width - safetyMarginPx * 2 - totalGapsW);
  const availableH = Math.max(10, containerSize.height - safetyMarginPx * 2 - totalGapsH);

  // Strict fit inside both available width and height
  const scale = Math.max(0.001, Math.min(availableW / totalGridCmW, availableH / totalGridCmH));

  // Sheet dimensions strictly derived from A4 proportions
  const sheetW = page.width * scale;
  const sheetH = page.height * scale;

  const marginXPx = config.marginCm * scale;
  const marginYPx = config.marginCm * scale;
  const usableWPx = usableW * scale;
  const usableHPx = usableH * scale;

  const totalPosterWPx = config.widthCm * scale;
  const totalPosterHPx = config.heightCm * scale;

  const gridTotalWPx = config.fH * sheetW + totalGapsW;
  const gridTotalHPx = config.fV * sheetH + totalGapsH;

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* Page Preview Stage */}
      <div
        ref={containerRef}
        className="relative w-full flex items-center justify-center p-1.5 sm:p-2.5 bg-slate-100/90 border border-slate-200/90 rounded-xl h-[430px] sm:h-[520px] lg:h-[560px] xl:h-[620px] overflow-hidden"
      >
        <div
          className="grid justify-center items-center transition-all duration-150"
          style={{
            gridTemplateColumns: `repeat(${config.fH}, 1fr)`,
            gridTemplateRows: `repeat(${config.fV}, 1fr)`,
            gap: `${gapPx}px`,
            width: `${gridTotalWPx}px`,
            height: `${gridTotalHPx}px`,
          }}
        >
          {sheets.map((sheet) => {
            const drawWPx = sheet.drawW * scale;
            const drawHPx = sheet.drawH * scale;
            const offsetXPx = -(sheet.col * usableW * scale);
            const offsetYPx = -(sheet.row * usableH * scale);

            return (
              <div
                key={`${sheet.col}-${sheet.row}`}
                className="relative bg-white shadow-xs border border-slate-300 overflow-hidden w-full h-full"
              >
                {/* Cut Border indicator */}
                {config.cutBorder && !sheet.isEmpty && (
                  <div
                    className="absolute border border-dashed border-blue-400/80 pointer-events-none z-10"
                    style={{
                      left: `${marginXPx}px`,
                      top: `${marginYPx}px`,
                      width: `${usableWPx}px`,
                      height: `${usableHPx}px`,
                    }}
                  />
                )}

                {/* Sheet Content: Image Slice or Empty Cross */}
                {sheet.isEmpty ? (
                  <div className="w-full h-full flex items-center justify-center bg-slate-50/70 text-slate-300 relative">
                    <svg className="w-full h-full stroke-slate-300 stroke-[1.5]" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <line x1="0" y1="0" x2="100" y2="100" />
                      <line x1="100" y1="0" x2="0" y2="100" />
                    </svg>
                    <span className="absolute text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-sm shadow-xs">
                      Vazia
                    </span>
                  </div>
                ) : (
                  <div
                    className="absolute overflow-hidden"
                    style={{
                      left: `${marginXPx}px`,
                      top: `${marginYPx}px`,
                      width: `${usableWPx}px`,
                      height: `${usableHPx}px`,
                    }}
                  >
                    {/* Exact slice portion */}
                    <div
                      className="relative overflow-hidden bg-white"
                      style={{
                        width: `${drawWPx}px`,
                        height: `${drawHPx}px`,
                      }}
                    >
                      <img
                        src={imageInfo.url}
                        alt={`Folha ${sheet.sheetIndex}`}
                        className="absolute pointer-events-none"
                        style={{
                          width: `${totalPosterWPx}px`,
                          height: `${totalPosterHPx}px`,
                          left: `${offsetXPx}px`,
                          top: `${offsetYPx}px`,
                          maxWidth: 'none',
                          maxHeight: 'none',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
