import React, { useRef, useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ImageIcon,
  Sparkles,
} from 'lucide-react';
import { DividedDrawing, PreviewBgTone, Orientation } from '../types';
import { SensitivityLevel, getGridColsRows } from '../utils/drawingSplitter';

interface DividirDesenhosPreviewProps {
  drawings: DividedDrawing[];
  partesPorFolha?: number; // padrão: 1 parte por folha
  isProcessing: boolean;
  hasImage: boolean;
  onUploadClick: () => void;
  onRedetect?: (level?: SensitivityLevel) => void;
  onToggleDrawing?: (id: number) => void;
  currentSensitivity?: SensitivityLevel;
  bgTone?: PreviewBgTone;
  orientation?: Orientation;
}

const BG_CONFIG: Record<
  PreviewBgTone,
  {
    container: string;
    emptyContainer: string;
    emptyIconBg: string;
    emptyTitle: string;
    emptyDesc: string;
  }
> = {
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

export const DividirDesenhosPreview: React.FC<DividirDesenhosPreviewProps> = ({
  drawings,
  partesPorFolha = 1,
  isProcessing,
  hasImage,
  onUploadClick,
  onRedetect,
  onToggleDrawing,
  bgTone = 'light',
  orientation = 'vertical',
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 360,
    height: 430,
  });

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [thumbWidthRatio, setThumbWidthRatio] = useState(0.2);

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);

  const currentTheme = BG_CONFIG[bgTone] || BG_CONFIG.light;
  const shortFade = SHORT_FADE_CONFIG[bgTone] || SHORT_FADE_CONFIG.light;

  // Visualização sempre em Retrato (A4: 21 x 29.7 cm)
  const isPortrait = true;
  const pageW = 21;
  const pageH = 29.7;

  const validPartesPorFolha = Math.max(1, partesPorFolha);
  const calcTotalPages = Math.max(1, Math.ceil(drawings.length / validPartesPorFolha));

  // Redimensionamento e cálculo do container
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

  // Suporte a scroll com a rodinha do mouse na horizontal (idêntico ao de cartão)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 && calcTotalPages > 1) {
        e.preventDefault();
        container.scrollBy({ left: e.deltaY, behavior: 'auto' });
        checkScroll();
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [calcTotalPages]);

  useEffect(() => {
    checkScroll();
    const t = setTimeout(checkScroll, 80);
    return () => clearTimeout(t);
  }, [containerSize.width, containerSize.height, calcTotalPages, drawings.length]);

  // Se não houver imagem inserida: IDÊNTICO aos outros painéis das outras ferramentas
  if (!hasImage) {
    return (
      <div
        ref={wrapperRef}
        className={`w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full flex flex-col items-center justify-center p-6 text-center rounded-xl select-none transition-colors duration-200 ${currentTheme.emptyContainer}`}
      >
        <div className={`w-16 h-16 mb-3 rounded-full shadow-xs flex items-center justify-center ${currentTheme.emptyIconBg}`}>
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <p className={`font-bold text-sm sm:text-base ${currentTheme.emptyTitle}`}>Nenhuma imagem selecionada</p>
        <p className={`text-xs mt-1 max-w-xs ${currentTheme.emptyDesc}`}>
          Toque no botão &quot;Inserir Imagem&quot; ou arraste um arquivo até aqui para começar.
        </p>
      </div>
    );
  }

  // Se estiver processando
  if (isProcessing) {
    return (
      <div
        ref={wrapperRef}
        className={`w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full flex flex-col items-center justify-center p-6 text-center rounded-xl select-none transition-colors duration-200 ${currentTheme.emptyContainer}`}
      >
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-3" />
        <p className={`font-bold text-sm sm:text-base ${currentTheme.emptyTitle}`}>Processando desenhos...</p>
        <p className={`text-xs mt-1 max-w-xs ${currentTheme.emptyDesc}`}>
          Detectando partes individuais e organizando nas folhas A4.
        </p>
      </div>
    );
  }

  // Se nenhuma parte for encontrada
  if (drawings.length === 0) {
    return (
      <div
        ref={wrapperRef}
        className={`w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full flex flex-col items-center justify-center p-6 text-center rounded-xl select-none transition-colors duration-200 ${currentTheme.emptyContainer}`}
      >
        <div className={`w-14 h-14 mb-3 rounded-full shadow-xs flex items-center justify-center ${currentTheme.emptyIconBg}`}>
          <ImageIcon className="w-7 h-7 text-amber-500" />
        </div>
        <p className={`font-bold text-sm sm:text-base ${currentTheme.emptyTitle}`}>Nenhum desenho detectado</p>
        <p className={`text-xs mt-1 max-w-xs ${currentTheme.emptyDesc}`}>
          Aumente a sensibilidade de detecção no painel lateral para detectar traços mais claros.
        </p>
        {onRedetect && (
          <button
            type="button"
            onClick={() => onRedetect('alta')}
            className="mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold h-8 px-4 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tentar sensibilidade alta</span>
          </button>
        )}
      </div>
    );
  }

  // Escala para exibir as folhas A4 ocupando a maior área de visualização possível (idêntico ao de cartão)
  const paddingXPx = 18;
  const paddingYPx = 18;
  const availableSingleSheetW = Math.max(10, containerSize.width - paddingXPx * 2);
  const availableColH = Math.max(10, containerSize.height - paddingYPx * 2);

  const scale = Math.max(0.001, Math.min(availableSingleSheetW / pageW, availableColH / pageH));

  const sheetW = pageW * scale;
  const sheetH = pageH * scale;

  const fixedMarginCm = 0.4;
  const marginXPx = fixedMarginCm * scale;
  const marginYPx = fixedMarginCm * scale;
  const usableWPx = (pageW - fixedMarginCm * 2) * scale;
  const usableHPx = (pageH - fixedMarginCm * 2) * scale;

  const gapBetweenPagesPx = 12;
  const totalContentWPx = calcTotalPages * sheetW + (calcTotalPages - 1) * gapBetweenPagesPx;
  const isHorizontalScroll = calcTotalPages > 1 && totalContentWPx > availableSingleSheetW;
  const scrollStep = Math.max(200, sheetW + gapBetweenPagesPx);

  // Calcula a grade de slots dentro de cada folha A4
  const { cols, rows } = getGridColsRows(validPartesPorFolha, isPortrait);
  const slotGapPx = validPartesPorFolha > 1 ? Math.max(2, Math.round(4 * (scale / 12))) : 0;
  const slotWPx = (usableWPx - slotGapPx * (cols - 1)) / cols;
  const slotHPx = (usableHPx - slotGapPx * (rows - 1)) / rows;

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full flex items-center justify-center overflow-hidden select-none transition-colors duration-200 rounded-xl ${currentTheme.container}`}
    >
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
          <div
            className="flex items-center gap-3 transition-all duration-150 shrink-0 my-auto"
            style={{ height: `${sheetH}px` }}
          >
            {Array.from({ length: calcTotalPages }, (_, pageIdx) => {
              const pageNum = pageIdx + 1;
              const pageStartIndex = pageIdx * validPartesPorFolha;
              const drawingsOnThisPage = drawings.slice(pageStartIndex, pageStartIndex + validPartesPorFolha);

              return (
                <div
                  key={pageNum}
                  className="relative bg-white a4-sheet-shadow ring-1 ring-black/20 border border-slate-300 overflow-hidden transition-all duration-150 shrink-0"
                  style={{
                    width: `${sheetW}px`,
                    height: `${sheetH}px`,
                  }}
                >
                  {/* Indicador da folha A4 no canto superior */}
                  {calcTotalPages > 1 && (
                    <div className="absolute top-1.5 left-2 z-30 pointer-events-none">
                      <span className="text-[9px] sm:text-[10px] font-black text-slate-800 bg-white/95 border border-slate-300/80 px-1.5 py-0.5 rounded shadow-xs">
                        Pág. {pageNum}/{calcTotalPages}
                      </span>
                    </div>
                  )}

                  {/* Margem imprimível da folha A4 (tracejado) */}
                  <div
                    className="absolute border border-dashed border-slate-400/80 pointer-events-none"
                    style={{
                      left: `${marginXPx}px`,
                      top: `${marginYPx}px`,
                      width: `${usableWPx}px`,
                      height: `${usableHPx}px`,
                    }}
                  />

                  {/* Área de partes dos desenhos na folha */}
                  <div
                    className="absolute overflow-hidden"
                    style={{
                      left: `${marginXPx}px`,
                      top: `${marginYPx}px`,
                      width: `${usableWPx}px`,
                      height: `${usableHPx}px`,
                    }}
                  >
                    {drawingsOnThisPage.map((drawing, slotIndex) => {
                      const col = slotIndex % cols;
                      const row = Math.floor(slotIndex / cols);

                      const slotX = col * (slotWPx + slotGapPx);
                      const slotY = row * (slotHPx + slotGapPx);

                      const isSelected = drawing.selected !== false;

                      return (
                        <div
                          key={drawing.id}
                          onClick={() => onToggleDrawing?.(drawing.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onToggleDrawing?.(drawing.id);
                            }
                          }}
                          title={
                            isSelected
                              ? `Parte ${drawing.id} (ativa) - Clique para desativar`
                              : `Parte ${drawing.id} (desativada) - Clique para ativar`
                          }
                          className={`absolute flex items-center justify-center p-1 rounded-sm overflow-hidden transition-all duration-200 cursor-pointer select-none ${
                            isSelected
                              ? 'bg-white border border-slate-200/90 shadow-xs hover:border-blue-400 hover:ring-2 hover:ring-blue-400/30'
                              : 'bg-white/70 border border-dashed border-slate-400 hover:border-slate-500 hover:bg-white/90'
                          }`}
                          style={{
                            left: `${slotX}px`,
                            top: `${slotY}px`,
                            width: `${slotWPx}px`,
                            height: `${slotHPx}px`,
                          }}
                        >
                          {/* Imagem do desenho com efeito desfocado/apagado quando desmarcado (idêntico à grade de cartões sem cartão) */}
                          <div
                            className={`w-full h-full flex items-center justify-center overflow-hidden pointer-events-none transition-all duration-200 ${
                              isSelected
                                ? 'opacity-100 filter-none'
                                : 'opacity-[0.15] filter grayscale-[70%] blur-[1.5px]'
                            }`}
                          >
                            <img
                              src={drawing.dataUrl}
                              alt={`Parte ${drawing.id}`}
                              className="max-w-full max-h-full object-contain pointer-events-none"
                              draggable={false}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Efeito de fade no canto esquerdo durante a rolagem */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-2.5 pointer-events-none z-20 bg-gradient-to-r ${shortFade.left} transition-opacity duration-200 ${
          isHorizontalScroll && canScrollLeft ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Efeito de fade no canto direito durante a rolagem */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-2.5 pointer-events-none z-20 bg-gradient-to-l ${shortFade.right} transition-opacity duration-200 ${
          isHorizontalScroll && canScrollRight ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Barra de rolagem horizontal fixa na parte inferior (somente visível no desktop) */}
      {isHorizontalScroll && (
        <div className="hidden lg:flex absolute bottom-1 left-8 right-8 sm:left-12 sm:right-12 z-30 items-center h-2.5 pointer-events-auto select-none">
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

      {/* Botão flutuante para navegar para a página anterior (tamanho padronizado/menor) */}
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

      {/* Botão flutuante para navegar para a próxima página (tamanho padronizado/menor) */}
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
