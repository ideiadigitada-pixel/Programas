import React, { useMemo, useRef, useState, useEffect } from 'react';
import { MontagemConfig, ImageInfo } from '../types';
import { calculateMontagemDimensions, getPageDimensions } from '../utils/calculations';

interface MontagemPreviewProps {
  imageInfo: ImageInfo | null;
  config: MontagemConfig;
}

export const MontagemPreview: React.FC<MontagemPreviewProps> = ({ imageInfo, config }) => {
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

  const { cardW, cardH, spacing, pageW, pageH, totalCards, quantity } = useMemo(() => {
    if (!imageInfo) {
      return {
        cardW: 9,
        cardH: 5,
        areaW: page.width - config.marginCm * 2,
        areaH: page.height - config.marginCm * 2,
        spacing: config.cardSpacing ? 0.2 : 0,
        pageW: page.width,
        pageH: page.height,
        totalCards: config.fH * config.fV,
        quantity: config.fH * config.fV,
      };
    }
    return calculateMontagemDimensions(config, imageInfo.widthPx, imageInfo.heightPx);
  }, [imageInfo, config, page.width, page.height]);

  if (!imageInfo) {
    return (
      <div className="w-full aspect-[4/3] min-h-[360px] sm:min-h-[460px] max-h-[620px] bg-white border border-dashed border-slate-300 flex flex-col items-center justify-center p-6 text-center text-slate-500 shadow-xs rounded-xl">
        <div className="w-16 h-16 mb-3 rounded-full bg-blue-50 border border-blue-100 shadow-xs flex items-center justify-center text-blue-600">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <p className="font-bold text-slate-800 text-sm sm:text-base">Nenhuma imagem selecionada</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Toque no botão &quot;Inserir Imagem&quot; acima para montar vários cartões na folha A4.
        </p>
      </div>
    );
  }

  // Calculate strict scale so the single sheet is exactly proportional to A4 (21 x 29.7 cm or 29.7 x 21 cm)
  const safetyMarginPx = 4;
  const availableW = Math.max(10, containerSize.width - safetyMarginPx * 2);
  const availableH = Math.max(10, containerSize.height - safetyMarginPx * 2);

  const scale = Math.max(0.001, Math.min(availableW / pageW, availableH / pageH));

  const sheetW = pageW * scale;
  const sheetH = pageH * scale;

  const marginXPx = config.marginCm * scale;
  const marginYPx = config.marginCm * scale;
  const usableWPx = (pageW - config.marginCm * 2) * scale;
  const usableHPx = (pageH - config.marginCm * 2) * scale;

  const cardWPx = cardW * scale;
  const cardHPx = cardH * scale;
  const spacingPx = spacing * scale;

  const totalGridWPx = config.fH * cardWPx + (config.fH - 1) * spacingPx;
  const totalGridHPx = config.fV * cardHPx + (config.fV - 1) * spacingPx;

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* Page Preview Stage */}
      <div
        ref={containerRef}
        className="relative w-full flex items-center justify-center p-1.5 sm:p-2.5 bg-slate-100/90 border border-slate-200/90 rounded-xl h-[430px] sm:h-[520px] overflow-hidden"
      >
        <div
          className="relative bg-white shadow-md border border-slate-300 overflow-hidden"
          style={{
            width: `${sheetW}px`,
            height: `${sheetH}px`,
          }}
        >
          {/* Margin Guide boundary (dashed printable area) */}
          <div
            className="absolute border border-dashed border-slate-300/90 pointer-events-none"
            style={{
              left: `${marginXPx}px`,
              top: `${marginYPx}px`,
              width: `${usableWPx}px`,
              height: `${usableHPx}px`,
            }}
          />

          {/* Cards Grid Centered Inside Printable Area */}
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: `${marginXPx}px`,
              top: `${marginYPx}px`,
              width: `${usableWPx}px`,
              height: `${usableHPx}px`,
            }}
          >
            <div
              className="grid justify-center items-center"
              style={{
                gridTemplateColumns: `repeat(${config.fH}, ${cardWPx}px)`,
                gridTemplateRows: `repeat(${config.fV}, ${cardHPx}px)`,
                gap: `${spacingPx}px`,
                width: `${totalGridWPx}px`,
                height: `${totalGridHPx}px`,
              }}
            >
              {Array.from({ length: totalCards }).map((_, index) => {
                const hasCard = index < quantity;
                return (
                  <div
                    key={index}
                    className={`relative overflow-hidden flex items-center justify-center ${
                      hasCard
                        ? `bg-white ${config.cardBorder ? 'border border-slate-300' : ''}`
                        : 'bg-slate-50/50 border border-dashed border-slate-200'
                    }`}
                    style={{
                      width: `${cardWPx}px`,
                      height: `${cardHPx}px`,
                    }}
                  >
                    {hasCard && (
                      <img
                        src={imageInfo.url}
                        alt={`Cartão ${index + 1}`}
                        className={`w-full h-full ${
                          config.keepRatio ? 'object-contain' : 'object-fill'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
