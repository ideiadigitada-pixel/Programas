import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PosterConfig, ImageInfo, PreviewBgTone } from '../types';
import { calculatePosterSheets, calculatePosterSavings, getPageDimensions } from '../utils/calculations';
import { getSheetSeams } from '../utils/pdfGenerator';

interface PosterPreviewProps {
  imageInfo: ImageInfo | null;
  config: PosterConfig;
  bgTone?: PreviewBgTone;
  mode?: 'poster' | 'letras';
}

const BG_CONFIG: Record<PreviewBgTone, {
  container: string;
  emptyContainer: string;
  emptyIconBg: string;
  emptyTitle: string;
  emptyDesc: string;
}> = {
  dark: {
    container: 'bg-slate-800',
    emptyContainer: 'bg-slate-800 text-slate-300',
    emptyIconBg: 'bg-slate-700/80 border border-slate-600 text-blue-400',
    emptyTitle: 'text-slate-100',
    emptyDesc: 'text-slate-400',
  },
  medium: {
    container: 'bg-slate-600',
    emptyContainer: 'bg-slate-600 text-slate-200',
    emptyIconBg: 'bg-slate-500/80 border border-slate-400 text-blue-300',
    emptyTitle: 'text-white',
    emptyDesc: 'text-slate-200',
  },
  light: {
    container: 'bg-slate-200/90',
    emptyContainer: 'bg-slate-200/90 text-slate-600',
    emptyIconBg: 'bg-white border border-slate-300 text-blue-600 shadow-xs',
    emptyTitle: 'text-slate-800',
    emptyDesc: 'text-slate-500',
  },
};

const SHORT_FADE_CONFIG: Record<PreviewBgTone, { left: string; right: string }> = {
  dark: {
    left: 'from-slate-800 via-slate-800/70 to-transparent',
    right: 'from-slate-800 via-slate-800/70 to-transparent',
  },
  medium: {
    left: 'from-slate-600 via-slate-600/70 to-transparent',
    right: 'from-slate-600 via-slate-600/70 to-transparent',
  },
  light: {
    left: 'from-slate-200 via-slate-200/70 to-transparent',
    right: 'from-slate-200 via-slate-200/70 to-transparent',
  },
};

export const PosterPreview: React.FC<PosterPreviewProps> = ({
  imageInfo,
  config,
  bgTone = 'light',
  mode,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 360,
    height: 430,
  });

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [thumbWidthRatio, setThumbWidthRatio] = useState(0.2);

  const checkScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);

    const maxScroll = Math.max(1, scrollWidth - clientWidth);
    setScrollProgress(Math.max(0, Math.min(1, scrollLeft / maxScroll)));
    setThumbWidthRatio(Math.max(0.1, Math.min(1, clientWidth / scrollWidth)));
  };

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startScrollLeftRef.current = containerRef.current?.scrollLeft || 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !containerRef.current || !trackRef.current) return;
    const deltaX = e.clientX - startXRef.current;
    const trackWidth = trackRef.current.clientWidth;
    const scrollWidth = containerRef.current.scrollWidth;
    const clientWidth = containerRef.current.clientWidth;
    const maxScroll = Math.max(1, scrollWidth - clientWidth);
    const scrollDelta = (deltaX / trackWidth) * scrollWidth;
    containerRef.current.scrollLeft = Math.max(0, Math.min(maxScroll, startScrollLeftRef.current + scrollDelta));
    checkScroll();
  };

  const handleThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    if (containerRef.current) {
      const maxScroll = containerRef.current.scrollWidth - containerRef.current.clientWidth;
      containerRef.current.scrollTo({ left: ratio * maxScroll, behavior: 'smooth' });
      setTimeout(checkScroll, 200);
    }
  };

  const currentTheme = BG_CONFIG[bgTone] || BG_CONFIG.light;
  const shortFade = SHORT_FADE_CONFIG[bgTone] || SHORT_FADE_CONFIG.light;
  const isLetras = mode === 'letras';
  const isPagesView = isLetras;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setContainerSize({ width: w, height: h });
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
    ro.observe(el);

    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const page = getPageDimensions(config.orientation);
  const usableW = Math.max(0.1, page.width - config.marginCm * 2);
  const usableH = Math.max(0.1, page.height - config.marginCm * 2);

  const { sheets, sheetPageNumbers } = useMemo(() => {
    const res = calculatePosterSheets(config, page.width, page.height);
    const map = new Map<string, number>();
    let pageNum = 1;
    for (let r = 0; r < config.fV; r++) {
      for (let c = 0; c < config.fH; c++) {
        const sheet = res.sheets.find((s) => s.col === c && s.row === r);
        if (sheet && !sheet.isEmpty) {
          map.set(`${c}-${r}`, pageNum++);
        }
      }
    }
    return {
      ...res,
      sheetPageNumbers: map,
    };
  }, [imageInfo, config, page.width, page.height]);

  const savingsInfo = useMemo(() => {
    if (!imageInfo) return null;
    return calculatePosterSavings(config, imageInfo.widthPx, imageInfo.heightPx);
  }, [imageInfo, config]);

  const isEconomizeActive = Boolean(config.economizarFolhas && savingsInfo?.canEconomize);

  // Colunas e linhas com dimensões físicas em cm (cada parte tem margem nos quatro cantos)
  const colCm = useMemo(() => {
    const cols: number[] = [];
    for (let c = 0; c < config.fH; c++) {
      const isTargetCol =
        isEconomizeActive &&
        ((savingsInfo?.type === 'col' && c === savingsInfo?.partialIndex) ||
          (savingsInfo?.type === 'both' && c === (savingsInfo?.partialColIndex ?? savingsInfo?.partialIndex)));
      if (isTargetCol) {
        const colSheets = sheets.filter((s) => s.col === c && !s.isEmpty);
        const maxW = colSheets.length > 0 ? Math.max(...colSheets.map((s) => s.drawW)) : page.width / (savingsInfo?.partsPerSheet ?? 2);
        cols.push(maxW + config.marginCm * 2);
      } else {
        cols.push(page.width);
      }
    }
    return cols;
  }, [config.fH, isEconomizeActive, savingsInfo, page.width, sheets, config.marginCm]);

  const rowCm = useMemo(() => {
    const rows: number[] = [];
    for (let r = 0; r < config.fV; r++) {
      const isTargetRow =
        isEconomizeActive &&
        ((savingsInfo?.type === 'row' && r === savingsInfo?.partialIndex) ||
          (savingsInfo?.type === 'both' && r === (savingsInfo?.partialRowIndex ?? savingsInfo?.partialIndex)));
      if (isTargetRow) {
        const rowSheets = sheets.filter((s) => s.row === r && !s.isEmpty);
        const maxH = rowSheets.length > 0 ? Math.max(...rowSheets.map((s) => s.drawH)) : page.height / (savingsInfo?.partsPerSheet ?? 2);
        rows.push(maxH + config.marginCm * 2);
      } else {
        rows.push(page.height);
      }
    }
    return rows;
  }, [config.fV, isEconomizeActive, savingsInfo, page.height, sheets, config.marginCm]);

  // Lista de folhas a exibir no carrossel de páginas (oculta folhas totalmente vazias na navegação de páginas)
  const displaySheets = useMemo(() => {
    if (isPagesView) {
      const active = sheets.filter((s) => !s.isEmpty);
      return active.length > 0 ? active : sheets;
    }
    return sheets;
  }, [sheets, isPagesView]);

  // Colunas para o modo molde de letras (cada coluna agrupa suas páginas verticais fV)
  const columnSheets = useMemo(() => {
    if (!isLetras) return [];
    const cols: (typeof sheets)[] = [];
    for (let c = 0; c < config.fH; c++) {
      const colSheets = sheets.filter((s) => s.col === c);
      if (colSheets.some((s) => !s.isEmpty) || config.fH === 1) {
        cols.push(colSheets.sort((a, b) => a.row - b.row));
      }
    }
    return cols.length > 0 ? cols : [sheets];
  }, [isLetras, sheets, config.fH]);

  // Listener para rolagem horizontal suave com o mouse
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (container.scrollWidth > container.clientWidth) {
        if (e.deltaY !== 0 && e.deltaX === 0) {
          e.preventDefault();
          container.scrollLeft += e.deltaY;
          checkScroll();
        }
      }
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    checkScroll();
    const t = setTimeout(checkScroll, 80);
    return () => clearTimeout(t);
  }, [containerSize.width, containerSize.height, config.fH, config.fV, config.orientation, imageInfo, isLetras]);

  if (!imageInfo) {
    return (
      <div
        ref={wrapperRef}
        className={`w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full flex flex-col items-center justify-center p-6 text-center rounded-xl select-none transition-colors duration-200 ${currentTheme.emptyContainer}`}
      >
        <div className={`w-16 h-16 mb-3 rounded-full shadow-xs flex items-center justify-center ${currentTheme.emptyIconBg}`}>
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className={`font-bold text-sm sm:text-base ${currentTheme.emptyTitle}`}>
          {isLetras ? 'Nenhum molde criado ainda' : 'Nenhuma imagem selecionada'}
        </p>
        <p className={`text-xs mt-1 max-w-xs ${currentTheme.emptyDesc}`}>
          {isLetras
            ? 'Insira uma fonte ou clique em "Usar fonte padrão de exemplo" para começar.'
            : 'Toque no botão "Inserir Imagem" ou arraste um arquivo até aqui para começar.'}
        </p>
      </div>
    );
  }

  const gapBetweenPagesPx = 10;
  const paddingXPx = 18;
  const paddingYPx = 18;

  // No modo Molde Letras:
  // Todas as páginas verticais da coluna (config.fV) são mostradas na visualização
  // Se a palavra for grande e precisar de duas páginas A4 na vertical, ambas aparecem na visualização
  const totalVerticalGaps = Math.max(0, config.fV - 1) * gapBetweenPagesPx;
  const availableColH = Math.max(10, containerSize.height - paddingYPx * 2 - totalVerticalGaps);
  const scaleLetrasH = availableColH / (config.fV * page.height);

  const availableSingleSheetW = Math.max(10, containerSize.width - paddingXPx * 2);
  const scaleLetrasW = availableSingleSheetW / page.width;

  const scaleLetras = Math.max(0.001, Math.min(scaleLetrasW, scaleLetrasH));

  // No modo Pôster Montado: Grade 2D completa
  const totalGridCmW = colCm.reduce((acc, v) => acc + v, 0);
  const totalGridCmH = rowCm.reduce((acc, v) => acc + v, 0);

  const gapGridPx = config.fH >= 6 || config.fV >= 6 ? 1.5 : config.fH >= 3 || config.fV >= 3 ? 2 : 3;
  const totalGridGapsW = (config.fH - 1) * gapGridPx;
  const totalGridGapsH = (config.fV - 1) * gapGridPx;

  const availableGridW = Math.max(10, containerSize.width - paddingXPx * 2 - totalGridGapsW);
  const availableGridH = Math.max(10, containerSize.height - paddingYPx * 2 - totalGridGapsH);
  const scaleGrid = Math.max(0.001, Math.min(availableGridW / totalGridCmW, availableGridH / totalGridCmH));

  const scale = isLetras ? scaleLetras : scaleGrid;

  const sheetW = page.width * scale;
  const sheetH = page.height * scale;

  const marginXPx = config.marginCm * scale;
  const marginYPx = config.marginCm * scale;
  const usableWPx = usableW * scale;
  const usableHPx = usableH * scale;

  const totalPosterWPx = config.widthCm * scale;
  const totalPosterHPx = config.heightCm * scale;

  const gridTotalWPx = totalGridCmW * scale + totalGridGapsW;
  const gridTotalHPx = totalGridCmH * scale + totalGridGapsH;

  const colTotalHPx = isLetras
    ? config.fV * sheetH + totalVerticalGaps
    : gridTotalHPx;

  const totalPagesCount = isLetras
    ? displaySheets.length
    : config.fH * config.fV;

  const totalContentWPx = isLetras
    ? columnSheets.length * sheetW + Math.max(0, columnSheets.length - 1) * gapBetweenPagesPx
    : gridTotalWPx;

  const isHorizontalScroll = isLetras
    ? columnSheets.length > 1 && totalContentWPx > availableSingleSheetW
    : gridTotalWPx > availableSingleSheetW;

  const scrollStep = Math.max(200, sheetW + gapBetweenPagesPx);

  const totalGridSheets = config.fH * config.fV;
  const minSheetDim = Math.min(page.width * scale, page.height * scale);
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
      ref={wrapperRef}
      className={`relative w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full flex items-center justify-center overflow-hidden select-none transition-colors duration-200 rounded-xl ${currentTheme.container}`}
    >
      {/* Área com rolagem horizontal sem barra nativa */}
      <div
        ref={containerRef}
        onScroll={checkScroll}
        className={`w-full h-full ${
          isHorizontalScroll
            ? 'overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : 'overflow-hidden'
        }`}
      >
        <div
          className={`min-w-full h-full flex items-center py-2 ${
            isHorizontalScroll ? 'justify-start px-6 sm:px-8' : 'justify-center px-4'
          }`}
        >
          {isLetras ? (
            /* Modo Molde Letras: Colunas na horizontal à direita, com todas as páginas verticais empilhadas e visíveis */
            <div
              className="flex items-center gap-2.5 sm:gap-3 transition-all duration-150 shrink-0 my-auto"
              style={{
                height: `${colTotalHPx}px`,
              }}
            >
              {columnSheets.map((colGroup, colIdx) => (
                <div
                  key={`col-${colIdx}`}
                  className="flex flex-col gap-2.5 shrink-0"
                  style={{
                    width: `${sheetW}px`,
                    height: `${colTotalHPx}px`,
                  }}
                >
                  {colGroup.map((sheet) => {
                    const drawWPx = sheet.drawW * scale;
                    const drawHPx = sheet.drawH * scale;
                    const offsetXPx = -(sheet.col * usableW * scale);
                    const offsetYPx = -(sheet.row * usableH * scale);

                    const sliceLeftXPx = marginXPx;
                    const sliceTopYPx = marginYPx;

                    const pageData = isEconomizeActive && savingsInfo
                      ? savingsInfo.sheetPageMap.get(`${sheet.col}-${sheet.row}`)
                      : null;

                    const pageNum = sheetPageNumbers.get(`${sheet.col}-${sheet.row}`) ?? sheet.sheetIndex;

                    return (
                      <div
                        key={`${sheet.col}-${sheet.row}`}
                        className={`relative overflow-hidden bg-white transition-all a4-sheet-shadow ring-1 ring-black/20 border border-slate-300 shrink-0 ${
                          pageData?.isCombined
                            ? 'border-emerald-400/80 ring-emerald-500/20'
                            : ''
                        }`}
                        style={{
                          width: `${sheetW}px`,
                          height: `${sheetH}px`,
                        }}
                      >
                        {/* Selo indicador da folha / página no canto superior esquerdo */}
                        {totalPagesCount > 1 && !sheet.isEmpty && (
                          <div className="absolute top-1.5 left-2 z-30 pointer-events-none">
                            <span className="text-[9px] sm:text-[10px] font-black text-slate-800 bg-white/95 border border-slate-300/80 px-1.5 py-0.5 rounded shadow-xs">
                              Pág. {pageNum}/{totalPagesCount}
                            </span>
                          </div>
                        )}

                        {/* Limite da margem de corte / imprimível tracejada */}
                        {!sheet.isEmpty && (
                          <div
                            className="absolute border border-dashed border-slate-400/90 pointer-events-none"
                            style={{
                              left: `${marginXPx}px`,
                              top: `${marginYPx}px`,
                              width: `${usableWPx}px`,
                              height: `${usableHPx}px`,
                            }}
                          />
                        )}

                        {/* Conteúdo da folha: Imagem ou vazia */}
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
                              left: `${sliceLeftXPx}px`,
                              top: `${sliceTopYPx}px`,
                              width: `${drawWPx}px`,
                              height: `${drawHPx}px`,
                            }}
                          >
                            <img
                              src={imageInfo.url}
                              alt={`Folha ${pageNum}`}
                              className="absolute max-w-none pointer-events-none"
                              style={{
                                width: `${totalPosterWPx}px`,
                                height: `${totalPosterHPx}px`,
                                left: `${offsetXPx}px`,
                                top: `${offsetYPx}px`,
                                imageRendering: 'auto',
                              }}
                              draggable={false}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            /* Modo Mosaico Montado: Grade 2D completa do pôster */
            <div
              className={`grid transition-all duration-150 shrink-0 my-auto ${totalGridSheets > 1 ? 'a4-sheet-shadow' : ''}`}
              style={{
                gridTemplateColumns: colCm.map((w) => `${w * scale}px`).join(' '),
                gridTemplateRows: rowCm.map((h) => `${h * scale}px`).join(' '),
                gap: `${gapGridPx}px`,
                width: `${gridTotalWPx}px`,
                height: `${gridTotalHPx}px`,
              }}
            >
              {sheets.map((sheet) => {
                const drawWPx = sheet.drawW * scale;
                const drawHPx = sheet.drawH * scale;
                const offsetXPx = -(sheet.col * usableW * scale);
                const offsetYPx = -(sheet.row * usableH * scale);

                const sliceLeftXPx = marginXPx;
                const sliceTopYPx = marginYPx;

                const pageData = isEconomizeActive && savingsInfo
                  ? savingsInfo.sheetPageMap.get(`${sheet.col}-${sheet.row}`)
                  : null;

                const badgeDisplay = pageData
                  ? (pageData.isCombined ? pageData.badgeText : String(pageData.pageNumber))
                  : String(sheetPageNumbers.get(`${sheet.col}-${sheet.row}`) ?? sheet.sheetIndex);

                return (
                  <div
                    key={`${sheet.col}-${sheet.row}`}
                    className={`relative overflow-hidden w-full h-full bg-white transition-all a4-sheet-shadow ring-1 ring-black/20 border border-slate-300 ${
                      pageData?.isCombined
                        ? 'border-emerald-400/80 ring-emerald-500/20'
                        : ''
                    }`}
                  >
                    {/* Corner Crop Marks */}
                    {config.cutMarks && !sheet.isEmpty && (() => {
                      const { hasLeftSeam, hasRightSeam, hasTopSeam, hasBottomSeam } = getSheetSeams(sheet, config);
                      const isLetrasPorPagina = Boolean(config.letrasPorPagina);
                      const drawTopLeft = !isLetrasPorPagina || (hasTopSeam || hasLeftSeam);
                      const drawTopRight = !isLetrasPorPagina || (hasTopSeam || hasRightSeam);
                      const drawBottomLeft = !isLetrasPorPagina || (hasBottomSeam || hasLeftSeam);
                      const drawBottomRight = !isLetrasPorPagina || (hasBottomSeam || hasRightSeam);

                      if (!drawTopLeft && !drawTopRight && !drawBottomLeft && !drawBottomRight) {
                        return null;
                      }

                      return (
                        <svg
                          className="absolute inset-0 w-full h-full pointer-events-none z-10 stroke-slate-500 stroke-[1.2]"
                          fill="none"
                        >
                          {/* Top-Left */}
                          {drawTopLeft && (
                            <>
                              <line x1={sliceLeftXPx} y1={Math.max(1, sliceTopYPx - 8)} x2={sliceLeftXPx} y2={Math.max(1, sliceTopYPx - 2)} />
                              <line x1={Math.max(1, sliceLeftXPx - 8)} y1={sliceTopYPx} x2={Math.max(1, sliceLeftXPx - 2)} y2={sliceTopYPx} />
                            </>
                          )}

                          {/* Top-Right */}
                          {drawTopRight && (
                            <>
                              <line x1={sliceLeftXPx + drawWPx} y1={Math.max(1, sliceTopYPx - 8)} x2={sliceLeftXPx + drawWPx} y2={Math.max(1, sliceTopYPx - 2)} />
                              <line x1={sliceLeftXPx + drawWPx + 2} y1={sliceTopYPx} x2={sliceLeftXPx + drawWPx + 8} y2={sliceTopYPx} />
                            </>
                          )}

                          {/* Bottom-Left */}
                          {drawBottomLeft && (
                            <>
                              <line x1={sliceLeftXPx} y1={sliceTopYPx + drawHPx + 2} x2={sliceLeftXPx} y2={sliceTopYPx + drawHPx + 8} />
                              <line x1={Math.max(1, sliceLeftXPx - 8)} y1={sliceTopYPx + drawHPx} x2={Math.max(1, sliceLeftXPx - 2)} y2={sliceTopYPx + drawHPx} />
                            </>
                          )}

                          {/* Bottom-Right */}
                          {drawBottomRight && (
                            <>
                              <line x1={sliceLeftXPx + drawWPx} y1={sliceTopYPx + drawHPx + 2} x2={sliceLeftXPx + drawWPx} y2={sliceTopYPx + drawHPx + 8} />
                              <line x1={sliceLeftXPx + drawWPx + 2} y1={sliceTopYPx + drawHPx} x2={sliceLeftXPx + drawWPx + 8} y2={sliceTopYPx + drawHPx} />
                            </>
                          )}
                        </svg>
                      );
                    })()}

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
                          left: `${sliceLeftXPx}px`,
                          top: `${sliceTopYPx}px`,
                          width: `${drawWPx}px`,
                          height: `${drawHPx}px`,
                        }}
                      >
                        <img
                          src={imageInfo.url}
                          alt={`Folha ${sheet.sheetIndex}`}
                          className="absolute max-w-none pointer-events-none"
                          style={{
                            width: `${totalPosterWPx}px`,
                            height: `${totalPosterHPx}px`,
                            left: `${offsetXPx}px`,
                            top: `${offsetYPx}px`,
                            imageRendering: 'auto',
                          }}
                          draggable={false}
                        />
                      </div>
                    )}

                    {/* Selo do número da página no modo pôster montado */}
                    {!sheet.isEmpty && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                        <div
                          className={`font-black rounded-lg shadow-md select-none flex items-center justify-center transition-all ${
                            pageData?.isCombined
                              ? 'bg-emerald-600 text-white border-2 border-emerald-400 ring-2 ring-emerald-300/80 shadow-emerald-800/30'
                              : 'bg-white/95 text-slate-900 border border-slate-400'
                          }`}
                          style={{
                            fontSize: `${badgeFontSizePx}px`,
                            paddingLeft: `${Math.max(5, Math.round(badgeFontSizePx * 0.5))}px`,
                            paddingRight: `${Math.max(5, Math.round(badgeFontSizePx * 0.5))}px`,
                            paddingTop: `${Math.max(2, Math.round(badgeFontSizePx * 0.15))}px`,
                            paddingBottom: `${Math.max(2, Math.round(badgeFontSizePx * 0.15))}px`,
                            lineHeight: 1.15,
                          }}
                        >
                          {badgeDisplay}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fadin bem discreto no canto esquerdo durante a rolagem */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-2 sm:w-2.5 pointer-events-none z-20 bg-gradient-to-r ${shortFade.left} transition-opacity duration-200 ${
          isHorizontalScroll && canScrollLeft ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Fadin bem discreto no canto direito durante a rolagem */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-2 sm:w-2.5 pointer-events-none z-20 bg-gradient-to-l ${shortFade.right} transition-opacity duration-200 ${
          isHorizontalScroll && canScrollRight ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Barra de rolagem horizontal fixa na parte de baixo da visualização (somente visível no desktop) */}
      {isHorizontalScroll && (
        <div className="hidden lg:flex absolute bottom-0.5 sm:bottom-1 left-8 right-8 sm:left-12 sm:right-12 z-30 items-center h-2.5 pointer-events-auto select-none">
          <div
            ref={trackRef}
            className="w-full h-1 bg-slate-400/20 hover:bg-slate-400/30 rounded-full relative cursor-pointer transition-colors"
            onClick={handleTrackClick}
          >
            <div
              className="absolute top-0 bottom-0 bg-slate-400/70 hover:bg-slate-400/90 active:bg-slate-500 rounded-full cursor-grab active:cursor-grabbing transition-[left] duration-75"
              style={{
                width: `${Math.max(15, thumbWidthRatio * 100)}%`,
                left: `${scrollProgress * (100 - Math.max(15, thumbWidthRatio * 100))}%`,
              }}
              onPointerDown={handleThumbPointerDown}
              onPointerMove={handleThumbPointerMove}
              onPointerUp={handleThumbPointerUp}
              onPointerCancel={handleThumbPointerUp}
            />
          </div>
        </div>
      )}

      {/* Botões que surgem na tela para navegar entre as telas/folhas (tamanho padronizado/menor) */}
      {isHorizontalScroll && canScrollLeft && (
        <button
          type="button"
          onClick={() => {
            containerRef.current?.scrollBy({ left: -scrollStep, behavior: 'smooth' });
            setTimeout(checkScroll, 250);
          }}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 shadow-md border border-slate-200 flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95"
          title="Página anterior"
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {isHorizontalScroll && canScrollRight && (
        <button
          type="button"
          onClick={() => {
            containerRef.current?.scrollBy({ left: scrollStep, behavior: 'smooth' });
            setTimeout(checkScroll, 250);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 shadow-md border border-slate-200 flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95"
          title="Próxima página"
          aria-label="Próxima página"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
