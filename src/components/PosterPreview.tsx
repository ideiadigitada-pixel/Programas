import React, { useMemo, useRef, useState, useEffect } from 'react';
import { PosterConfig, ImageInfo, PreviewBgTone } from '../types';
import { calculatePosterSheets, getPageDimensions } from '../utils/calculations';

interface PosterPreviewProps {
  imageInfo: ImageInfo | null;
  config: PosterConfig;
  bgTone?: PreviewBgTone;
}

const BG_CONFIG: Record<PreviewBgTone, {
  container: string;
  emptyContainer: string;
  emptyIconBg: string;
  emptyTitle: string;
  emptyDesc: string;
}> = {
  dark: {
    container: 'bg-slate-800 border-slate-700 shadow-inner',
    emptyContainer: 'bg-slate-800 border-dashed border-slate-650 text-slate-300 shadow-inner',
    emptyIconBg: 'bg-slate-700/80 border border-slate-600 text-blue-400',
    emptyTitle: 'text-slate-100',
    emptyDesc: 'text-slate-400',
  },
  medium: {
    container: 'bg-slate-600 border-slate-500 shadow-inner',
    emptyContainer: 'bg-slate-600 border-dashed border-slate-500 text-slate-200 shadow-inner',
    emptyIconBg: 'bg-slate-500/80 border border-slate-400 text-blue-300',
    emptyTitle: 'text-white',
    emptyDesc: 'text-slate-200',
  },
  light: {
    container: 'bg-slate-200/90 border-slate-300 shadow-inner',
    emptyContainer: 'bg-slate-200/90 border-slate-300 text-slate-600 shadow-inner',
    emptyIconBg: 'bg-white border border-slate-300 text-blue-600 shadow-xs',
    emptyTitle: 'text-slate-800',
    emptyDesc: 'text-slate-500',
  },
};

export const PosterPreview: React.FC<PosterPreviewProps> = ({
  imageInfo,
  config,
  bgTone = 'light',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 360,
    height: 430,
  });

  const currentTheme = BG_CONFIG[bgTone] || BG_CONFIG.light;

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

  const page = getPageDimensions(config.orientation);

  const { sheets, usableW, usableH, sheetPageNumbers, nonEmptySheets } = useMemo(() => {
    if (!imageInfo) {
      return {
        sheets: [],
        totalSheets: config.fH * config.fV,
        nonEmptySheets: 0,
        usableW: page.width - config.marginCm * 2,
        usableH: page.height - config.marginCm * 2,
        sheetPageNumbers: new Map<string, number>(),
      };
    }
    const res = calculatePosterSheets(config, imageInfo.widthPx, imageInfo.heightPx);
    const map = new Map<string, number>();
    let counter = 1;
    for (const sheet of res.sheets) {
      if (!sheet.isEmpty) {
        map.set(`${sheet.col}-${sheet.row}`, counter++);
      }
    }
    return {
      ...res,
      sheetPageNumbers: map,
    };
  }, [imageInfo, config, page.width, page.height]);

  if (!imageInfo) {
    return (
      <div
        ref={containerRef}
        className={`w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full border flex flex-col items-center justify-center p-6 text-center rounded-xl select-none transition-colors duration-200 ${currentTheme.emptyContainer}`}
      >
        <div className={`w-16 h-16 mb-3 rounded-full shadow-xs flex items-center justify-center ${currentTheme.emptyIconBg}`}>
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className={`font-bold text-sm sm:text-base ${currentTheme.emptyTitle}`}>Nenhuma imagem selecionada</p>
        <p className={`text-xs mt-1 max-w-xs ${currentTheme.emptyDesc}`}>
          Toque no botão &quot;Inserir Imagem&quot; ou arraste um arquivo até aqui para começar.
        </p>
      </div>
    );
  }

  // Calculate strict scale so every sheet is exactly proportional to A4 (21 x 29.7 cm or 29.7 x 21 cm)
  const gapPx = config.fH >= 6 || config.fV >= 6 ? 1.5 : config.fH >= 3 || config.fV >= 3 ? 2 : 3;
  // Safety margin so the grid never touches the outer borders of the visualization area
  const paddingPx = 16;

  const totalGridCmW = config.fH * page.width;
  const totalGridCmH = config.fV * page.height;

  const totalGapsW = (config.fH - 1) * gapPx;
  const totalGapsH = (config.fV - 1) * gapPx;

  const availableW = Math.max(10, containerSize.width - paddingPx * 2 - totalGapsW);
  const availableH = Math.max(10, containerSize.height - paddingPx * 2 - totalGapsH);

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

  const totalGridSheets = config.fH * config.fV;
  const minSheetDim = Math.min(sheetW, sheetH);
  let badgeFontSizePx = Math.max(9, Math.min(18, Math.round(minSheetDim * 0.12)));
  if (totalGridSheets > 25) {
    badgeFontSizePx = Math.max(7.5, Math.min(10.5, Math.round(minSheetDim * 0.08)));
  } else if (totalGridSheets > 16) {
    badgeFontSizePx = Math.max(8, Math.min(12, Math.round(minSheetDim * 0.09)));
  } else if (totalGridSheets > 9) {
    badgeFontSizePx = Math.max(9, Math.min(14, Math.round(minSheetDim * 0.10)));
  } else if (totalGridSheets > 4) {
    badgeFontSizePx = Math.max(10, Math.min(16, Math.round(minSheetDim * 0.11)));
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full flex items-center justify-center border rounded-xl overflow-hidden select-none transition-colors duration-200 ${currentTheme.container}`}
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
              className="relative shadow-md border border-slate-300 overflow-hidden w-full h-full bg-white ring-1 ring-black/10"
            >
              {/* Corner Crop Marks */}
              {config.cutMarks && !sheet.isEmpty && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none z-10 stroke-slate-500 stroke-[1.2]"
                  fill="none"
                >
                  {/* Top-Left */}
                  <line x1={marginXPx} y1={Math.max(1, marginYPx - 8)} x2={marginXPx} y2={Math.max(1, marginYPx - 2)} />
                  <line x1={Math.max(1, marginXPx - 8)} y1={marginYPx} x2={Math.max(1, marginXPx - 2)} y2={marginYPx} />

                  {/* Top-Right */}
                  <line x1={marginXPx + drawWPx} y1={Math.max(1, marginYPx - 8)} x2={marginXPx + drawWPx} y2={Math.max(1, marginYPx - 2)} />
                  <line x1={marginXPx + drawWPx + 2} y1={marginYPx} x2={marginXPx + drawWPx + 8} y2={marginYPx} />

                  {/* Bottom-Left */}
                  <line x1={marginXPx} y1={marginYPx + drawHPx + 2} x2={marginXPx} y2={marginYPx + drawHPx + 8} />
                  <line x1={Math.max(1, marginXPx - 8)} y1={marginYPx + drawHPx} x2={Math.max(1, marginXPx - 2)} y2={marginYPx + drawHPx} />

                  {/* Bottom-Right */}
                  <line x1={marginXPx + drawWPx} y1={marginYPx + drawHPx + 2} x2={marginXPx + drawWPx} y2={marginYPx + drawHPx + 8} />
                  <line x1={marginXPx + drawWPx + 2} y1={marginYPx + drawHPx} x2={marginXPx + drawWPx + 8} y2={marginYPx + drawHPx} />
                </svg>
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

              {/* Selo do número da página (somente o número quando tiver várias páginas) */}
              {!sheet.isEmpty && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  <div
                    className="bg-white/95 text-slate-900 border border-slate-400 font-bold rounded shadow-xs select-none flex items-center justify-center"
                    style={{
                      fontSize: `${badgeFontSizePx}px`,
                      paddingLeft: `${Math.max(4, Math.round(badgeFontSizePx * 0.45))}px`,
                      paddingRight: `${Math.max(4, Math.round(badgeFontSizePx * 0.45))}px`,
                      paddingTop: `${Math.max(1, Math.round(badgeFontSizePx * 0.12))}px`,
                      paddingBottom: `${Math.max(1, Math.round(badgeFontSizePx * 0.12))}px`,
                      lineHeight: 1.2,
                      borderWidth: '1px',
                    }}
                  >
                    {sheetPageNumbers.get(`${sheet.col}-${sheet.row}`) ?? sheet.sheetIndex}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
