import React, { useMemo, useRef, useState, useEffect } from 'react';
import { MontagemConfig, ImageInfo, PreviewBgTone } from '../types';
import { calculateMontagemDimensions, getPageDimensions } from '../utils/calculations';

interface MontagemPreviewProps {
  imageInfo: ImageInfo | null;
  config: MontagemConfig;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (newPage: number) => void;
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

export const MontagemPreview: React.FC<MontagemPreviewProps> = ({
  imageInfo,
  config,
  currentPage = 1,
  onPageChange,
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

  const { cardW, cardH, spacing, pageW, pageH, totalCards, quantity: totalQuantity } = useMemo(() => {
    return calculateMontagemDimensions(config, imageInfo?.widthPx, imageInfo?.heightPx);
  }, [imageInfo, config]);

  const cardsPerPage = totalCards;
  const calcTotalPages = Math.max(1, Math.ceil(totalQuantity / cardsPerPage));
  const activePage = Math.min(calcTotalPages, Math.max(1, currentPage));
  const startCardIndex = (activePage - 1) * cardsPerPage;
  const cardsOnThisPage = Math.max(0, Math.min(cardsPerPage, totalQuantity - startCardIndex));

  if (!imageInfo) {
    return (
      <div
        ref={containerRef}
        className={`w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full border flex flex-col items-center justify-center p-6 text-center rounded-xl select-none transition-colors duration-200 ${currentTheme.emptyContainer}`}
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

  // Calculate strict scale so the single sheet is exactly proportional to A4 (21 x 29.7 cm or 29.7 x 21 cm)
  const paddingPx = 16;
  const availableW = Math.max(10, containerSize.width - paddingPx * 2);
  const availableH = Math.max(10, containerSize.height - paddingPx * 2);

  const scale = Math.max(0.001, Math.min(availableW / pageW, availableH / pageH));

  const sheetW = pageW * scale;
  const sheetH = pageH * scale;

  const fixedMarginCm = 0.4;
  const marginXPx = fixedMarginCm * scale;
  const marginYPx = fixedMarginCm * scale;
  const usableWPx = (pageW - fixedMarginCm * 2) * scale;
  const usableHPx = (pageH - fixedMarginCm * 2) * scale;

  const cardWPx = cardW * scale;
  const cardHPx = cardH * scale;
  const spacingPx = spacing * scale;

  const totalGridWPx = config.fH * cardWPx + (config.fH - 1) * spacingPx;
  const totalGridHPx = config.fV * cardHPx + (config.fV - 1) * spacingPx;

  return (
    <div
      ref={containerRef}
      className={`relative w-full flex-1 min-h-[380px] sm:min-h-[460px] lg:min-h-0 h-[380px] sm:h-[460px] lg:h-full flex items-center justify-center border rounded-xl overflow-hidden select-none transition-colors duration-200 ${currentTheme.container}`}
    >
      <div
        className="relative bg-white shadow-2xl ring-1 ring-black/20 border border-slate-300 overflow-hidden transition-all duration-150"
        style={{
          width: `${sheetW}px`,
          height: `${sheetH}px`,
        }}
      >
        {/* Margin Guide boundary (dashed printable area) */}
        <div
          className="absolute border border-dashed border-slate-400/90 pointer-events-none"
          style={{
            left: `${marginXPx}px`,
            top: `${marginYPx}px`,
            width: `${usableWPx}px`,
            height: `${usableHPx}px`,
          }}
        />

        {/* Cards Grid Aligned to Top-Left of Printable Area */}
        <div
          className="absolute flex items-start justify-start overflow-hidden"
          style={{
            left: `${marginXPx}px`,
            top: `${marginYPx}px`,
            width: `${usableWPx}px`,
            height: `${usableHPx}px`,
          }}
        >
          <div
            className="grid justify-start items-start"
            style={{
              gridTemplateColumns: `repeat(${config.fH}, ${cardWPx}px)`,
              gridTemplateRows: `repeat(${config.fV}, ${cardHPx}px)`,
              gap: `${spacingPx}px`,
              maxWidth: `${usableWPx}px`,
              maxHeight: `${usableHPx}px`,
              width: `${totalGridWPx}px`,
              height: `${totalGridHPx}px`,
            }}
          >
            {Array.from({ length: totalCards }).map((_, index) => {
              const r = Math.floor(index / config.fH);
              const c = index % config.fH;
              const cardXPx = c * (cardWPx + spacingPx);
              const cardYPx = r * (cardHPx + spacingPx);
              const fitsOnPage = cardXPx + cardWPx <= usableWPx + 0.5 && cardYPx + cardHPx <= usableHPx + 0.5;

              const hasCard = index < cardsOnThisPage && fitsOnPage;

              const minCardDim = Math.min(cardWPx, cardHPx);
              let cardBadgeFontSizePx = Math.max(7, Math.min(16, Math.round(minCardDim * 0.22)));
              if (totalCards > 50) {
                cardBadgeFontSizePx = Math.max(6.5, Math.min(9.5, Math.round(minCardDim * 0.18)));
              } else if (totalCards > 25) {
                cardBadgeFontSizePx = Math.max(7.5, Math.min(11.5, Math.round(minCardDim * 0.20)));
              } else if (totalCards > 12) {
                cardBadgeFontSizePx = Math.max(8.5, Math.min(13.5, Math.round(minCardDim * 0.22)));
              }

              return (
                <div
                  key={index}
                  className={`relative overflow-hidden flex items-center justify-center ${
                    fitsOnPage
                      ? hasCard
                        ? `bg-white ${config.cardBorder ? 'border border-slate-600' : 'border border-slate-400'}`
                        : 'bg-slate-50/50 border border-dashed border-slate-300/70'
                      : 'opacity-0 pointer-events-none'
                  }`}
                  style={{
                    width: `${cardWPx}px`,
                    height: `${cardHPx}px`,
                  }}
                >
                  {hasCard ? (
                    <>
                      <img
                        src={imageInfo.url}
                        alt={`Cartão ${startCardIndex + index + 1}`}
                        className="w-full h-full object-fill"
                      />
                      {/* Selo numérico do cartão com tamanho de fonte dinâmico */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                        <div
                          className="bg-white/95 text-slate-900 border border-slate-400 font-bold rounded shadow-xs select-none flex items-center justify-center"
                          style={{
                            fontSize: `${cardBadgeFontSizePx}px`,
                            paddingLeft: `${Math.max(3, Math.round(cardBadgeFontSizePx * 0.45))}px`,
                            paddingRight: `${Math.max(3, Math.round(cardBadgeFontSizePx * 0.45))}px`,
                            paddingTop: `${Math.max(1, Math.round(cardBadgeFontSizePx * 0.1))}px`,
                            paddingBottom: `${Math.max(1, Math.round(cardBadgeFontSizePx * 0.1))}px`,
                            lineHeight: 1.15,
                            borderWidth: '1px',
                          }}
                        >
                          {startCardIndex + index + 1}
                        </div>
                      </div>
                    </>
                  ) : (
                    fitsOnPage && (
                      /* Onde tem somente a grade, sem os cartões: número visível e um pouco mais escuro */
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div
                          className="bg-white/80 text-slate-500 border border-slate-300 font-bold rounded shadow-2xs select-none flex items-center justify-center"
                          style={{
                            fontSize: `${cardBadgeFontSizePx}px`,
                            paddingLeft: `${Math.max(3, Math.round(cardBadgeFontSizePx * 0.45))}px`,
                            paddingRight: `${Math.max(3, Math.round(cardBadgeFontSizePx * 0.45))}px`,
                            paddingTop: `${Math.max(1, Math.round(cardBadgeFontSizePx * 0.1))}px`,
                            paddingBottom: `${Math.max(1, Math.round(cardBadgeFontSizePx * 0.1))}px`,
                            lineHeight: 1.15,
                            borderWidth: '1px',
                          }}
                        >
                          {startCardIndex + index + 1}
                        </div>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
