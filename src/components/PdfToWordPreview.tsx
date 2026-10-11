import React, { useRef, useState, useEffect } from 'react';
import {
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { PdfPageItem, PreviewBgTone } from '../types';

interface PdfToWordPreviewProps {
  pages: PdfPageItem[];
  rowCount?: number; // padrão: 1 linha (máx. 4)
  isProcessing: boolean;
  hasPdf: boolean;
  onUploadPdfClick: () => void;
  onTogglePage?: (pageNumber: number) => void;
  bgTone?: PreviewBgTone;
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

export const PdfToWordPreview: React.FC<PdfToWordPreviewProps> = ({
  pages,
  rowCount = 1,
  isProcessing,
  hasPdf,
  onTogglePage,
  bgTone = 'light',
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

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const currentTheme = BG_CONFIG[bgTone];
  const shortFade = SHORT_FADE_CONFIG[bgTone];

  // Observa redimensionamento do container para manter escala sempre precisa
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
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
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);

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
      containerRef.current.scrollTo({
        left: ratio * maxScroll,
        behavior: 'smooth',
      });
    }
  };

  // Suporte a rolagem horizontal via roda do mouse
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

  const totalPages = pages.length;
  // Até 4 linhas no máximo
  const validRowCount = Math.min(4, Math.max(1, rowCount));

  // Quantidade de colunas necessárias para acomodar as páginas nas linhas selecionadas
  const colCount = Math.max(1, Math.ceil(totalPages / validRowCount));
  const totalSlots = colCount * validRowCount;
  // Se tiver 5 páginas e colocar em 2 linhas (3 colunas x 2 linhas = 6 slots), a última (6ª) fica em branco
  const blankSlotsCount = Math.max(0, totalSlots - totalPages);

  // Espaçamentos e cálculo de altura das páginas para caber exatamente no container
  // O painel fica com o tamanho idêntico aos outros modos e as páginas diminuem conforme aumentam as linhas
  const paddingYPx = 16;
  const paddingXPx = 16;
  const gapPx = validRowCount >= 4 ? 6 : validRowCount >= 3 ? 8 : 12;
  const totalVerticalGaps = (validRowCount - 1) * gapPx;
  const availableH = Math.max(80, (containerSize.height || 430) - paddingYPx * 2 - totalVerticalGaps);
  const rowHeight = Math.max(50, Math.floor(availableH / validRowCount));

  // Proporção de aspecto base (A4 padrão 21 x 29.7 cm ou baseada na primeira página)
  const firstPage = pages[0];
  const aspect = firstPage && firstPage.heightCm > 0
    ? firstPage.widthCm / firstPage.heightCm
    : 210 / 297;
  const cardWidth = Math.round(rowHeight * aspect);
  const cardHeight = rowHeight;

  // Largura total ocupada pela grade
  const totalGridWidth = colCount * cardWidth + (colCount - 1) * gapPx;
  const availableW = Math.max(60, (containerSize.width || 360) - paddingXPx * 2);
  const isHorizontalScroll = totalGridWidth > availableW;

  useEffect(() => {
    checkScroll();
    const t = setTimeout(checkScroll, 80);
    return () => clearTimeout(t);
  }, [containerSize.width, containerSize.height, validRowCount, totalPages, isHorizontalScroll]);

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full flex items-center justify-center overflow-hidden select-none transition-colors duration-200 rounded-xl ${currentTheme.container}`}
    >
      {/* 1. ESTADO: PROCESSANDO / CARREGANDO */}
      {isProcessing && (
        <div className="absolute inset-0 z-40 bg-white/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <h4 className="text-sm font-bold text-slate-800">Processando arquivo PDF...</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">
            Renderizando páginas com alta resolução para visualização e edição.
          </p>
        </div>
      )}

      {/* 2. ESTADO: SEM PDF CARREGADO (Idêntico aos outros modos, sem botão inserir na visualização) */}
      {!hasPdf && !isProcessing && (
        <div
          className={`w-full h-full flex flex-col items-center justify-center p-6 text-center select-none ${currentTheme.emptyContainer}`}
        >
          <div
            className={`w-16 h-16 mb-3 rounded-full shadow-xs flex items-center justify-center ${currentTheme.emptyIconBg}`}
          >
            <FileText className="w-8 h-8" />
          </div>

          <p className={`font-bold text-sm sm:text-base ${currentTheme.emptyTitle}`}>
            Nenhum arquivo PDF carregado
          </p>
          <p className={`text-xs mt-1 max-w-xs ${currentTheme.emptyDesc}`}>
            Toque no botão &quot;Inserir PDF&quot; ou arraste um arquivo até aqui para começar.
          </p>
        </div>
      )}

      {/* 3. ESTADO: COM PÁGINAS RENDERIZADAS */}
      {hasPdf && !isProcessing && totalPages > 0 && (
        <>
          {/* Área com rolagem horizontal sem barra nativa quando necessário */}
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
              {/* Grade de páginas organizadas nas linhas solicitadas */}
              <div
                className="grid transition-all duration-200 shrink-0 my-auto"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${colCount}, ${cardWidth}px)`,
                  gridTemplateRows: `repeat(${validRowCount}, ${cardHeight}px)`,
                  gap: `${gapPx}px`,
                }}
              >
                {/* 1. Páginas reais do PDF (quadradas/cantos retos sem contorno azul e sem botões de ativada/desativada) */}
                {pages.map((page) => {
                  const isSelected = page.selected !== false;

                  return (
                    <div
                      key={page.pageNumber}
                      onClick={() => onTogglePage?.(page.pageNumber)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onTogglePage?.(page.pageNumber);
                        }
                      }}
                      title={
                        isSelected
                          ? `Página ${page.pageNumber} (inclusa no Word) - Clique para desmarcar`
                          : `Página ${page.pageNumber} (removida do Word) - Clique para incluir`
                      }
                      className={`relative overflow-hidden transition-all duration-200 cursor-pointer select-none group flex flex-col items-center justify-center a4-sheet-shadow ring-1 ring-black/20 ${
                        isSelected
                          ? 'bg-white border border-slate-300 hover:border-slate-400'
                          : 'bg-white/70 border border-dashed border-slate-400 hover:border-slate-500'
                      }`}
                      style={{
                        height: `${cardHeight}px`,
                        width: `${cardWidth}px`,
                      }}
                    >
                      {/* Imagem da página com efeito desfocado/apagado quando desmarcada */}
                      <div
                        className={`w-full h-full flex items-center justify-center overflow-hidden pointer-events-none transition-all duration-200 ${
                          isSelected
                            ? 'opacity-100 filter-none'
                            : 'opacity-[0.15] filter grayscale-[70%] blur-[1.5px]'
                        }`}
                      >
                        <img
                          src={page.dataUrl}
                          alt={`Página ${page.pageNumber}`}
                          className="w-full h-full object-contain pointer-events-none"
                          draggable={false}
                        />
                      </div>

                      {/* Selo do número da página no canto superior esquerdo */}
                      <div className="absolute top-1 left-1 sm:top-1.5 sm:left-1.5 z-10 pointer-events-none">
                        <span
                          className={`text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 shadow-xs transition-colors ${
                            isSelected
                              ? 'bg-slate-900/90 text-white'
                              : 'bg-slate-500/80 text-white line-through'
                          }`}
                        >
                          Pág. {page.pageNumber}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* 2. Slots em branco (ex: 5 páginas em 2 linhas = 3 colunas x 2 linhas = 6 slots; a 6ª fica em branco) */}
                {Array.from({ length: blankSlotsCount }).map((_, blankIdx) => (
                  <div
                    key={`blank-slot-${blankIdx}`}
                    className="relative overflow-hidden border border-slate-300 ring-1 ring-black/20 bg-white a4-sheet-shadow select-none pointer-events-none transition-all duration-200"
                    style={{
                      height: `${cardHeight}px`,
                      width: `${cardWidth}px`,
                    }}
                  >
                    {/* Folha limpa em branco */}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Fade nas bordas durante a rolagem horizontal */}
          <div
            className={`absolute left-0 top-0 bottom-0 w-2.5 pointer-events-none z-20 bg-gradient-to-r ${shortFade.left} transition-opacity duration-200 ${
              isHorizontalScroll && canScrollLeft ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            className={`absolute right-0 top-0 bottom-0 w-2.5 pointer-events-none z-20 bg-gradient-to-l ${shortFade.right} transition-opacity duration-200 ${
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

          {/* Botões de rolagem suave para esquerda e direita */}
          {isHorizontalScroll && canScrollLeft && (
            <button
              type="button"
              onClick={() => {
                if (containerRef.current) {
                  containerRef.current.scrollBy({
                    left: -Math.max(160, cardWidth + gapPx),
                    behavior: 'smooth',
                  });
                }
              }}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 shadow-md border border-slate-200 flex items-center justify-center cursor-pointer transition-all hover:scale-105"
              title="Rolar para a esquerda"
              aria-label="Rolar para a esquerda"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {isHorizontalScroll && canScrollRight && (
            <button
              type="button"
              onClick={() => {
                if (containerRef.current) {
                  containerRef.current.scrollBy({
                    left: Math.max(160, cardWidth + gapPx),
                    behavior: 'smooth',
                  });
                }
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 shadow-md border border-slate-200 flex items-center justify-center cursor-pointer transition-all hover:scale-105"
              title="Rolar para a direita"
              aria-label="Rolar para a direita"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </>
      )}
    </div>
  );
};
