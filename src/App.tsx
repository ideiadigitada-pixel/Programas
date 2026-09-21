import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Plus,
  Minus,
  Download,
  FileText,
  Grid,
  Check,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  AppMode,
  Orientation,
  ImageInfo,
  PosterConfig,
  MontagemConfig,
  FOLHA_MENOR,
  FOLHA_MAIOR,
  DPI_PADRAO,
  MARGEM_MINIMA_POSTER,
  MARGEM_MAXIMA_POSTER,
  MARGEM_PADRAO_POSTER,
  MARGEM_MINIMA_MONTAGEM,
  MARGEM_MAXIMA_MONTAGEM,
  MARGEM_PADRAO_MONTAGEM,
  LIMITE_MAX_POSTER_CM,
} from './types';
import {
  calculateInitialPoster,
  calculatePosterWithFixedSheets,
  calculatePosterSheets,
  calculateMontagemDimensions,
  formatCm,
  formatCardCm,
  parseCm,
  getPageDimensions,
} from './utils/calculations';
import { generatePosterPdf, generateMontagemPdf } from './utils/pdfGenerator';
import { PosterPreview } from './components/PosterPreview';
import { MontagemPreview } from './components/MontagemPreview';
import { CmInput } from './components/CmInput';

export default function App() {
  const [mode, setMode] = useState<AppMode>('poster');
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; text: string } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState<{ fileName: string; pages: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poster configuration state
  const [posterConfig, setPosterConfig] = useState<PosterConfig>({
    orientation: 'vertical',
    widthCm: 19.4,
    heightCm: 28.1,
    fH: 1,
    fV: 1,
    marginCm: MARGEM_PADRAO_POSTER,
    keepRatio: true,
    cutBorder: false,
    cutMarks: true,
  });

  // Montagem configuration state
  const [montagemConfig, setMontagemConfig] = useState<MontagemConfig>(() => {
    const initialDims = calculateMontagemDimensions({
      orientation: 'vertical',
      fH: 2,
      fV: 4,
      cardWidthCm: 10.1,
      cardHeightCm: 7.2,
      marginCm: MARGEM_PADRAO_MONTAGEM,
      keepRatio: true,
      cardBorder: false,
      cardSpacing: false,
      manualSize: false,
    });
    return {
      orientation: 'vertical',
      fH: 2,
      fV: 4,
      cardWidthCm: initialDims.cardW,
      cardHeightCm: initialDims.cardH,
      marginCm: MARGEM_PADRAO_MONTAGEM,
      keepRatio: true,
      cardBorder: false,
      cardSpacing: false,
      manualSize: false,
      quantity: undefined,
    };
  });

  // Track the last edited field for keepRatio calculations
  const lastEditedField = useRef<'width' | 'height'>('width');

  // Load a file into ImageInfo
  const handleLoadImage = useCallback((file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const widthPx = img.naturalWidth;
      const heightPx = img.naturalHeight;
      const widthCm = (widthPx / DPI_PADRAO) * 2.54;
      const heightCm = (heightPx / DPI_PADRAO) * 2.54;

      const newInfo: ImageInfo = {
        name: file.name,
        url: objectUrl,
        imgElement: img,
        widthPx,
        heightPx,
        widthCm,
        heightCm,
      };

      setImageInfo(newInfo);
      setErrorMessage(null);

      // Initialize poster to maximum size on 1 page
      const initialPoster = calculateInitialPoster(
        widthPx,
        heightPx,
        posterConfig.orientation,
        posterConfig.marginCm
      );

      setPosterConfig((prev) => ({
        ...prev,
        widthCm: initialPoster.widthCm,
        heightCm: initialPoster.heightCm,
        fH: initialPoster.fH,
        fV: initialPoster.fV,
      }));

      // Initialize montagem
      const dims = calculateMontagemDimensions(
        { ...montagemConfig, manualSize: false },
        widthPx,
        heightPx
      );
      setMontagemConfig((prev) => ({
        ...prev,
        cardWidthCm: dims.cardW,
        cardHeightCm: dims.cardH,
        manualSize: false,
        quantity: undefined,
      }));
    };

    img.onerror = () => {
      setErrorMessage('Não foi possível carregar o arquivo de imagem.');
    };

    img.src = objectUrl;
  }, [posterConfig.orientation, posterConfig.marginCm, montagemConfig]);

  // Drag and drop state for desktop & mobile
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        handleLoadImage(file);
      } else {
        setErrorMessage('Por favor selecione um arquivo de imagem válido (PNG, JPG, WebP).');
      }
    }
  };

  // Handle file input change
  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleLoadImage(files[0]);
    }
  };

  // Provide a quick sample image so the user can test immediately
  const loadSampleImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Create an artistic poster placeholder
      const grad = ctx.createLinearGradient(0, 0, 1200, 1600);
      grad.addColorStop(0, '#1E3A8A');
      grad.addColorStop(0.5, '#2563EB');
      grad.addColorStop(1, '#0284C7');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1200, 1600);

      // Decorative circles
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(600, 600, 380, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(600, 600, 260, 0, Math.PI * 2);
      ctx.fill();

      // Typography
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 80px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PÔSTER A4', 600, 580);

      ctx.font = 'normal 42px sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText('& MONTAGEM', 600, 650);

      ctx.font = 'normal 32px sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText('Exemplo de Impressão de Alta Qualidade', 600, 1200);

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'exemplo_poster.jpg', { type: 'image/jpeg' });
          handleLoadImage(file);
        }
      }, 'image/jpeg', 0.92);
    }
  };

  // ----------------------------------------------------
  // PLUS AND MINUS HANDLERS (RIGHT & BOTTOM CONTROLS)
  // ----------------------------------------------------

  // Right Buttons: Columns / Horizontal (fH)
  const handleAdjustColumns = (delta: number) => {
    if (mode === 'poster') {
      const newFH = Math.max(1, posterConfig.fH + delta);
      const newFV = posterConfig.fV;

      if (imageInfo) {
        const { widthCm, heightCm } = calculatePosterWithFixedSheets(
          imageInfo.widthPx,
          imageInfo.heightPx,
          newFH,
          newFV,
          posterConfig.orientation,
          posterConfig.marginCm,
          posterConfig.keepRatio
        );

        setPosterConfig((prev) => ({
          ...prev,
          fH: newFH,
          fV: newFV,
          widthCm,
          heightCm,
        }));
      } else {
        setPosterConfig((prev) => ({
          ...prev,
          fH: newFH,
        }));
      }
    } else {
      // Montagem: columns
      const newFH = Math.max(1, montagemConfig.fH + delta);
      setMontagemConfig((prev) => {
        const updated = { ...prev, fH: newFH, manualSize: false, quantity: undefined };
        const dims = calculateMontagemDimensions(updated, imageInfo?.widthPx, imageInfo?.heightPx);
        return {
          ...updated,
          cardWidthCm: dims.cardW,
          cardHeightCm: dims.cardH,
        };
      });
    }
  };

  // Bottom Buttons: Rows / Vertical (fV)
  const handleAdjustRows = (delta: number) => {
    if (mode === 'poster') {
      const newFH = posterConfig.fH;
      const newFV = Math.max(1, posterConfig.fV + delta);

      if (imageInfo) {
        const { widthCm, heightCm } = calculatePosterWithFixedSheets(
          imageInfo.widthPx,
          imageInfo.heightPx,
          newFH,
          newFV,
          posterConfig.orientation,
          posterConfig.marginCm,
          posterConfig.keepRatio
        );

        setPosterConfig((prev) => ({
          ...prev,
          fH: newFH,
          fV: newFV,
          widthCm,
          heightCm,
        }));
      } else {
        setPosterConfig((prev) => ({
          ...prev,
          fV: newFV,
        }));
      }
    } else {
      // Montagem: rows
      const newFV = Math.max(1, montagemConfig.fV + delta);
      setMontagemConfig((prev) => {
        const updated = { ...prev, fV: newFV, manualSize: false, quantity: undefined };
        const dims = calculateMontagemDimensions(updated, imageInfo?.widthPx, imageInfo?.heightPx);
        return {
          ...updated,
          cardWidthCm: dims.cardW,
          cardHeightCm: dims.cardH,
        };
      });
    }
  };

  // ----------------------------------------------------
  // SIZE INPUT HANDLERS (WIDTH & HEIGHT)
  // ----------------------------------------------------
  const handleWidthChange = (valInput: number | string) => {
    lastEditedField.current = 'width';

    if (mode === 'poster') {
      const val = typeof valInput === 'number' ? valInput : parseCm(valInput, 0);
      if (val <= 0) return;

      const page = getPageDimensions(posterConfig.orientation);
      const usableW = Math.max(0.1, page.width - posterConfig.marginCm * 2);
      const usableH = Math.max(0.1, page.height - posterConfig.marginCm * 2);

      let newWidth = Math.min(LIMITE_MAX_POSTER_CM, Math.max(0.1, val));
      let newHeight = posterConfig.heightCm;

      if (posterConfig.keepRatio && imageInfo && val > 0) {
        const aspect = imageInfo.widthPx / imageInfo.heightPx;
        newHeight = Math.min(LIMITE_MAX_POSTER_CM, Math.round((newWidth / aspect) * 10) / 10);
      }

      const newFH = Math.max(1, Math.ceil((newWidth || 1) / usableW));
      const newFV = Math.max(1, Math.ceil((newHeight || 1) / usableH));

      setPosterConfig((prev) => ({
        ...prev,
        widthCm: newWidth,
        heightCm: newHeight,
        fH: newFH,
        fV: newFV,
      }));
    } else {
      // Montagem card width (provided in cm, e.g. 3.41 cm)
      const valCm = typeof valInput === 'number' ? valInput : parseCm(valInput, 0);
      if (valCm <= 0) return;
      const valMm = valCm * 10;

      const page = getPageDimensions(montagemConfig.orientation);
      const pageWMm = Math.round(page.width * 10);
      const pageHMm = Math.round(page.height * 10);
      const marginMm = Math.round(montagemConfig.marginCm * 10);
      const areaWMm = Math.max(10, pageWMm - marginMm * 2);
      const areaHMm = Math.max(10, pageHMm - marginMm * 2);
      const spacingMm = montagemConfig.cardSpacing ? 2 : 0;

      let newCardWMm = Math.min(areaWMm, Math.max(5, valMm));
      let newCardHMm = montagemDims.cardHMm;

      if (montagemConfig.keepRatio && imageInfo && valMm > 0) {
        const aspect = imageInfo.widthPx / imageInfo.heightPx;
        newCardHMm = Math.min(areaHMm, Math.floor((newCardWMm / aspect) * 10) / 10);
      }

      const fH = Math.max(1, Math.floor((areaWMm + spacingMm) / (newCardWMm + spacingMm) + 1e-9));
      const fV = Math.max(1, Math.floor((areaHMm + spacingMm) / (newCardHMm + spacingMm) + 1e-9));

      setMontagemConfig((prev) => ({
        ...prev,
        cardWidthCm: Math.round((newCardWMm / 10) * 100) / 100,
        cardHeightCm: Math.round((newCardHMm / 10) * 100) / 100,
        fH,
        fV,
        manualSize: true,
        quantity: undefined,
      }));
    }
  };

  const handleHeightChange = (valInput: number | string) => {
    lastEditedField.current = 'height';

    if (mode === 'poster') {
      const val = typeof valInput === 'number' ? valInput : parseCm(valInput, 0);
      if (val <= 0) return;

      const page = getPageDimensions(posterConfig.orientation);
      const usableW = Math.max(0.1, page.width - posterConfig.marginCm * 2);
      const usableH = Math.max(0.1, page.height - posterConfig.marginCm * 2);

      let newHeight = Math.min(LIMITE_MAX_POSTER_CM, Math.max(0.1, val));
      let newWidth = posterConfig.widthCm;

      if (posterConfig.keepRatio && imageInfo && val > 0) {
        const aspect = imageInfo.widthPx / imageInfo.heightPx;
        newWidth = Math.min(LIMITE_MAX_POSTER_CM, Math.round((newHeight * aspect) * 10) / 10);
      }

      const newFH = Math.max(1, Math.ceil((newWidth || 1) / usableW));
      const newFV = Math.max(1, Math.ceil((newHeight || 1) / usableH));

      setPosterConfig((prev) => ({
        ...prev,
        widthCm: newWidth,
        heightCm: newHeight,
        fH: newFH,
        fV: newFV,
      }));
    } else {
      // Montagem card height (provided in cm, e.g. 4.52 cm)
      const valCm = typeof valInput === 'number' ? valInput : parseCm(valInput, 0);
      if (valCm <= 0) return;
      const valMm = valCm * 10;

      const page = getPageDimensions(montagemConfig.orientation);
      const pageWMm = Math.round(page.width * 10);
      const pageHMm = Math.round(page.height * 10);
      const marginMm = Math.round(montagemConfig.marginCm * 10);
      const areaWMm = Math.max(10, pageWMm - marginMm * 2);
      const areaHMm = Math.max(10, pageHMm - marginMm * 2);
      const spacingMm = montagemConfig.cardSpacing ? 2 : 0;

      let newCardHMm = Math.min(areaHMm, Math.max(5, valMm));
      let newCardWMm = montagemDims.cardWMm;

      if (montagemConfig.keepRatio && imageInfo && valMm > 0) {
        const aspect = imageInfo.widthPx / imageInfo.heightPx;
        newCardWMm = Math.min(areaWMm, Math.floor((newCardHMm * aspect) * 10) / 10);
      }

      const fH = Math.max(1, Math.floor((areaWMm + spacingMm) / (newCardWMm + spacingMm) + 1e-9));
      const fV = Math.max(1, Math.floor((areaHMm + spacingMm) / (newCardHMm + spacingMm) + 1e-9));

      setMontagemConfig((prev) => ({
        ...prev,
        cardWidthCm: Math.round((newCardWMm / 10) * 100) / 100,
        cardHeightCm: Math.round((newCardHMm / 10) * 100) / 100,
        fH,
        fV,
        manualSize: true,
        quantity: undefined,
      }));
    }
  };

  const handleQuantityChange = (valStr: string) => {
    const val = parseInt(valStr, 10);
    const capacity = montagemConfig.fH * montagemConfig.fV;
    if (isNaN(val) || val <= 0) {
      setMontagemConfig((prev) => ({ ...prev, quantity: undefined }));
    } else {
      setMontagemConfig((prev) => ({ ...prev, quantity: Math.min(val, capacity) }));
    }
  };

  // Orientation toggle
  const handleOrientationChange = (newOrientation: Orientation) => {
    if (mode === 'poster') {
      const page = getPageDimensions(newOrientation);
      const usableW = Math.max(0.1, page.width - posterConfig.marginCm * 2);
      const usableH = Math.max(0.1, page.height - posterConfig.marginCm * 2);
      const newFH = Math.max(1, Math.ceil(posterConfig.widthCm / usableW));
      const newFV = Math.max(1, Math.ceil(posterConfig.heightCm / usableH));

      setPosterConfig((prev) => ({
        ...prev,
        orientation: newOrientation,
        fH: newFH,
        fV: newFV,
      }));
    } else {
      setMontagemConfig((prev) => {
        const updated = { ...prev, orientation: newOrientation, manualSize: false, quantity: undefined };
        const dims = calculateMontagemDimensions(updated, imageInfo?.widthPx, imageInfo?.heightPx);
        return {
          ...updated,
          cardWidthCm: dims.cardW,
          cardHeightCm: dims.cardH,
        };
      });
    }
  };

  // Toggle Keep Ratio
  const handleToggleKeepRatio = () => {
    if (mode === 'poster') {
      const nextRatio = !posterConfig.keepRatio;
      setPosterConfig((prev) => {
        if (nextRatio && imageInfo) {
          // Re-sync dimension based on last edited
          const aspect = imageInfo.widthPx / imageInfo.heightPx;
          let newW = prev.widthCm;
          let newH = prev.heightCm;
          if (lastEditedField.current === 'height') {
            newW = Math.round((newH * aspect) * 10) / 10;
          } else {
            newH = Math.round((newW / aspect) * 10) / 10;
          }
          const page = getPageDimensions(prev.orientation);
          const usableW = Math.max(0.1, page.width - prev.marginCm * 2);
          const usableH = Math.max(0.1, page.height - prev.marginCm * 2);
          return {
            ...prev,
            keepRatio: nextRatio,
            widthCm: newW,
            heightCm: newH,
            fH: Math.max(1, Math.ceil(newW / usableW)),
            fV: Math.max(1, Math.ceil(newH / usableH)),
          };
        }
        return { ...prev, keepRatio: nextRatio };
      });
    } else {
      setMontagemConfig((prev) => {
        const updated = { ...prev, keepRatio: !prev.keepRatio, manualSize: false };
        const dims = calculateMontagemDimensions(updated, imageInfo?.widthPx, imageInfo?.heightPx);
        return {
          ...updated,
          cardWidthCm: dims.cardW,
          cardHeightCm: dims.cardH,
        };
      });
    }
  };

  // Margin Change
  const handleMarginChange = (valInput: number | string) => {
    const val = typeof valInput === 'number' ? valInput : parseCm(valInput, mode === 'poster' ? MARGEM_MINIMA_POSTER : MARGEM_MINIMA_MONTAGEM);
    if (val <= 0) return;

    if (mode === 'poster') {
      const clamped = Math.max(MARGEM_MINIMA_POSTER, Math.min(val, MARGEM_MAXIMA_POSTER));
      const page = getPageDimensions(posterConfig.orientation);
      const usableW = Math.max(0.1, page.width - clamped * 2);
      const usableH = Math.max(0.1, page.height - clamped * 2);
      setPosterConfig((prev) => ({
        ...prev,
        marginCm: clamped,
        fH: Math.max(1, Math.ceil(prev.widthCm / usableW)),
        fV: Math.max(1, Math.ceil(prev.heightCm / usableH)),
      }));
    } else {
      const clamped = Math.max(MARGEM_MINIMA_MONTAGEM, Math.min(val, MARGEM_MAXIMA_MONTAGEM));
      setMontagemConfig((prev) => {
        const updated = { ...prev, marginCm: clamped, manualSize: false };
        const dims = calculateMontagemDimensions(updated, imageInfo?.widthPx, imageInfo?.heightPx);
        return {
          ...updated,
          cardWidthCm: dims.cardW,
          cardHeightCm: dims.cardH,
        };
      });
    }
  };

  // ----------------------------------------------------
  // SAVE / EXPORT PDF HANDLER
  // ----------------------------------------------------
  const handleExportPdf = async () => {
    if (!imageInfo) {
      setErrorMessage('Selecione uma imagem primeiro para exportar o PDF.');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);

    try {
      if (mode === 'poster') {
        await generatePosterPdf(imageInfo, posterConfig, (percent, text) => {
          setExportProgress({ percent, text });
        });
        const { nonEmptySheets } = calculatePosterSheets(
          posterConfig,
          imageInfo.widthPx,
          imageInfo.heightPx
        );
        setShowSuccessModal({
          fileName: `${imageInfo.name.replace(/\.[^/.]+$/, '')}_poster.pdf`,
          pages: nonEmptySheets,
        });
      } else {
        await generateMontagemPdf(imageInfo, montagemConfig, (percent, text) => {
          setExportProgress({ percent, text });
        });
        setShowSuccessModal({
          fileName: `${imageInfo.name.replace(/\.[^/.]+$/, '')}_montagem.pdf`,
          pages: 1,
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Erro ao gerar PDF: ${err.message || 'Tente novamente.'}`);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  // Derived calculations for summary & suggestions
  const posterSheetsData = useMemo(() => {
    if (!imageInfo) return { nonEmptySheets: 1, totalSheets: posterConfig.fH * posterConfig.fV };
    return calculatePosterSheets(posterConfig, imageInfo.widthPx, imageInfo.heightPx);
  }, [imageInfo, posterConfig]);

  const montagemDims = useMemo(() => {
    return calculateMontagemDimensions(montagemConfig, imageInfo?.widthPx, imageInfo?.heightPx);
  }, [imageInfo, montagemConfig]);

  // Current values for input display
  const currentWidthValue =
    mode === 'poster' ? posterConfig.widthCm : montagemDims.cardW;
  const currentHeightValue =
    mode === 'poster' ? posterConfig.heightCm : montagemDims.cardH;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/bmp"
        className="hidden"
        onChange={onFileSelected}
      />

      {/* Main Container: Mobile single-column with spacious card gaps, Desktop spacious 2-column workspace */}
      <main className="w-full max-w-xl sm:max-w-2xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-3.5 sm:px-5 lg:px-8 py-4 lg:py-7 pb-16 flex flex-col gap-5 sm:gap-6 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
        {/* HEADER / MODE SWITCHER */}
        <header className="lg:col-span-12 flex flex-col items-center gap-2 mb-1 lg:mb-2">
          <div className="w-full max-w-xl bg-slate-100 p-1 rounded-xl flex border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => setMode('poster')}
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                mode === 'poster'
                  ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>CRIAR PÔSTER</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('montagem')}
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                mode === 'montagem'
                  ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>MONTAR CARTÕES</span>
            </button>
          </div>

          <p className="text-[11px] sm:text-xs text-slate-500 text-center">
            {mode === 'poster'
              ? 'Amplie e divida sua imagem em folhas A4 para imprimir e montar.'
              : 'Crie vários cartões em uma folha A4, com guias de corte.'}
          </p>
        </header>

        {/* 1. EM CIMA: BOTÃO DE INSERIR A IMAGEM (Desktop: topo coluna direita) */}
        <section
          id="section-upload"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`order-1 lg:order-none lg:col-start-8 lg:col-span-5 xl:col-span-5 2xl:col-start-9 2xl:col-span-4 lg:row-start-2 w-full transition-all ${
            isDragging ? 'opacity-90 ring-2 ring-blue-500 rounded-xl' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 text-sm sm:text-base cursor-pointer"
          >
            <Upload className="w-5 h-5 shrink-0" />
            <span>{imageInfo ? 'TROCAR IMAGEM' : 'INSERIR IMAGEM'}</span>
          </button>

          {/* If image is selected, show subtle file pill */}
          {imageInfo ? (
            <div className="mt-2 flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs whitespace-nowrap overflow-hidden">
              <div className="flex items-center gap-1.5 min-w-0">
                <ImageIcon className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                <span className="font-semibold text-slate-800 truncate" title={imageInfo.name}>
                  {imageInfo.name}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 shrink-0">
                {imageInfo.widthPx}x{imageInfo.heightPx} px ({formatCm(imageInfo.widthCm)}x{formatCm(imageInfo.heightCm)} cm)
              </span>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-center">
              <button
                type="button"
                onClick={loadSampleImage}
                className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium hover:underline cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Usar imagem de exemplo para testar</span>
              </button>
            </div>
          )}
        </section>

        {/* 2. ÁREA DE VISUALIZAÇÃO (Desktop: coluna esquerda ampla e fixada) */}
        <section
          id="section-preview"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`order-2 lg:order-none lg:col-start-1 lg:col-span-7 xl:col-span-7 2xl:col-span-8 lg:row-start-2 lg:row-span-4 lg:sticky lg:top-4 w-full bg-white rounded-2xl p-2.5 sm:p-4 border transition-all shadow-xs flex flex-col ${
            isDragging ? 'border-blue-500 ring-2 ring-blue-400/40 bg-blue-50/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span>Tamanho:</span>
              <span className="normal-case font-semibold text-slate-800">
                {imageInfo
                  ? mode === 'poster'
                    ? `${formatCm(posterConfig.widthCm)} x ${formatCm(posterConfig.heightCm)} cm`
                    : `${formatCardCm(montagemDims.cardW)} x ${formatCardCm(montagemDims.cardH)} cm`
                  : mode === 'poster'
                  ? 'A4'
                  : `${formatCardCm(montagemDims.cardW)} x ${formatCardCm(montagemDims.cardH)} cm`}
              </span>
            </div>

            {imageInfo && (
              <span className="text-xs font-semibold text-slate-600">
                {mode === 'poster'
                  ? `${posterSheetsData.nonEmptySheets} ${posterSheetsData.nonEmptySheets === 1 ? 'folha' : 'folhas'}`
                  : `${montagemDims.quantity} ${montagemDims.quantity === 1 ? 'cartão' : 'cartões'}`}
              </span>
            )}
          </div>

          {mode === 'poster' ? (
            <PosterPreview imageInfo={imageInfo} config={posterConfig} />
          ) : (
            <MontagemPreview imageInfo={imageInfo} config={montagemConfig} />
          )}

          {/* CONTROLES DE AJUSTE DE GRADE INTEGRADOS NO PAINEL DE VISUALIZAÇÃO */}
          <div className="mt-3.5 pt-3 border-t border-slate-200/80 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>AJUSTE DE GRADE</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Botões de Linhas (Vertical) */}
              <div className="flex flex-col gap-1.5 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                  <span>Linhas</span>
                  <span className="text-blue-700 font-bold text-xs bg-white px-2 py-0.5 rounded border border-slate-200 shadow-xs">
                    {mode === 'poster' ? posterConfig.fV : montagemConfig.fV}
                  </span>
                </span>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleAdjustRows(-1)}
                    disabled={mode === 'poster' ? (!imageInfo || posterConfig.fV <= 1) : montagemConfig.fV <= 1}
                    className="flex-1 h-10 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-lg text-slate-800 font-black text-lg flex items-center justify-center shadow-xs cursor-pointer"
                    title="Diminuir linhas"
                    aria-label="Diminuir linhas"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustRows(1)}
                    disabled={mode === 'poster' && !imageInfo}
                    className="flex-1 h-10 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-lg text-blue-700 font-black text-lg flex items-center justify-center shadow-xs cursor-pointer"
                    title="Aumentar linhas"
                    aria-label="Aumentar linhas"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Botões de Colunas (Horizontal) */}
              <div className="flex flex-col gap-1.5 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                  <span>Colunas</span>
                  <span className="text-blue-700 font-bold text-xs bg-white px-2 py-0.5 rounded border border-slate-200 shadow-xs">
                    {mode === 'poster' ? posterConfig.fH : montagemConfig.fH}
                  </span>
                </span>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleAdjustColumns(-1)}
                    disabled={mode === 'poster' ? (!imageInfo || posterConfig.fH <= 1) : montagemConfig.fH <= 1}
                    className="flex-1 h-10 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-lg text-slate-800 font-black text-lg flex items-center justify-center shadow-xs cursor-pointer"
                    title="Diminuir colunas"
                    aria-label="Diminuir colunas"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustColumns(1)}
                    disabled={mode === 'poster' && !imageInfo}
                    className="flex-1 h-10 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-lg text-blue-700 font-black text-lg flex items-center justify-center shadow-xs cursor-pointer"
                    title="Aumentar colunas"
                    aria-label="Aumentar colunas"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. LOGO ABAIXO: O INPUT DE TAMANHO (Desktop: 2º bloco coluna direita) */}
        <section
          id="section-size-inputs"
          className="order-3 lg:order-none lg:col-start-8 lg:col-span-5 xl:col-span-5 2xl:col-start-9 2xl:col-span-4 lg:row-start-3 w-full bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex flex-col gap-2.5"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
            <span>{mode === 'poster' ? 'TAMANHO DO PÔSTER' : 'TAMANHO DO CARTÃO'}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Input Largura */}
            <div className="flex flex-col gap-1">
              <label htmlFor="input-largura" className="text-xs font-semibold text-slate-700">
                Largura
              </label>
              <CmInput
                id="input-largura"
                value={currentWidthValue}
                onChange={handleWidthChange}
                placeholder={mode === 'poster' ? '0,0' : '0,00'}
                disabled={!imageInfo}
                min={mode === 'poster' ? 1 : 0.5}
                max={mode === 'poster' ? LIMITE_MAX_POSTER_CM : 50}
                unit="cm"
                formatFn={mode === 'poster' ? formatCm : formatCardCm}
                parseFn={parseCm}
                className="w-full h-11 px-3 py-2 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
              />
            </div>

            {/* Input Altura */}
            <div className="flex flex-col gap-1">
              <label htmlFor="input-altura" className="text-xs font-semibold text-slate-700">
                Altura
              </label>
              <CmInput
                id="input-altura"
                value={currentHeightValue}
                onChange={handleHeightChange}
                placeholder={mode === 'poster' ? '0,0' : '0,00'}
                disabled={!imageInfo}
                min={mode === 'poster' ? 1 : 0.5}
                max={mode === 'poster' ? LIMITE_MAX_POSTER_CM : 50}
                unit="cm"
                formatFn={mode === 'poster' ? formatCm : formatCardCm}
                parseFn={parseCm}
                className="w-full h-11 px-3 py-2 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
              />
            </div>
          </div>

          {/* Manter Proporção */}
          <div className="pt-1.5 border-t border-slate-100 flex items-center">
            <label className="flex items-center gap-2 cursor-pointer py-0.5 select-none">
              <input
                type="checkbox"
                checked={mode === 'poster' ? posterConfig.keepRatio : montagemConfig.keepRatio}
                onChange={handleToggleKeepRatio}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white"
              />
              <span className="text-xs font-semibold text-slate-700">
                Manter proporção
              </span>
            </label>
          </div>
        </section>

        {/* 5. E DEPOIS AS OPÇÕES (Desktop: 3º bloco coluna direita) */}
        <section
          id="section-options"
          className="order-4 lg:order-none lg:col-start-8 lg:col-span-5 xl:col-span-5 2xl:col-start-9 2xl:col-span-4 lg:row-start-4 w-full bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-xs flex flex-col gap-3.5"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
            <span>IMPRESSÃO E RECORTE</span>
          </div>

          {/* Orientação */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-700">Orientação da folha</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleOrientationChange('vertical')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  (mode === 'poster' ? posterConfig.orientation : montagemConfig.orientation) === 'vertical'
                    ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="w-2.5 h-3.5 border border-current rounded-xs"></div>
                <span>Retrato</span>
              </button>
              <button
                type="button"
                onClick={() => handleOrientationChange('horizontal')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  (mode === 'poster' ? posterConfig.orientation : montagemConfig.orientation) === 'horizontal'
                    ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="w-3.5 h-2.5 border border-current rounded-xs"></div>
                <span>Paisagem</span>
              </button>
            </div>
          </div>

          {/* Margem da Folha e Quantidade */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            {/* Input Margem */}
            <div className="flex flex-col gap-1">
              <label htmlFor="input-margem" className="text-xs font-semibold text-slate-700">
                Margem da folha
              </label>
              <CmInput
                id="input-margem"
                value={mode === 'poster' ? posterConfig.marginCm : montagemConfig.marginCm}
                onChange={handleMarginChange}
                min={mode === 'poster' ? MARGEM_MINIMA_POSTER : MARGEM_MINIMA_MONTAGEM}
                max={mode === 'poster' ? MARGEM_MAXIMA_POSTER : MARGEM_MAXIMA_MONTAGEM}
                unitClassName="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-semibold pointer-events-none"
                className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-center font-bold text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
              />
              <span className="text-[10px] text-slate-400">
                {mode === 'poster' ? 'Min 0,6 • Max 1,0' : 'Min 0,4 • Max 1,0'}
              </span>
            </div>

            {/* Input Quantidade */}
            <div className="flex flex-col gap-1">
              <label htmlFor="input-quantidade" className="text-xs font-semibold text-slate-700">
                {mode === 'poster' ? 'Páginas do pôster' : 'Quantidade de cartões'}
              </label>
              <div className="relative">
                <input
                  id="input-quantidade"
                  type="number"
                  min="1"
                  max={mode === 'poster' ? 999 : montagemConfig.fH * montagemConfig.fV}
                  value={
                    mode === 'poster'
                      ? posterSheetsData.nonEmptySheets
                      : (montagemConfig.quantity ?? montagemDims.quantity)
                  }
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => mode === 'montagem' && handleQuantityChange(e.target.value)}
                  readOnly={mode === 'poster'}
                  disabled={!imageInfo}
                  className={`w-full h-9 px-3 py-1.5 border rounded-lg text-center font-bold text-xs shadow-xs ${
                    mode === 'poster'
                      ? 'bg-slate-50 border-slate-200 text-slate-700 cursor-not-allowed'
                      : 'bg-white border-slate-300 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500'
                  }`}
                />
              </div>
              <span className="text-[10px] text-slate-400">
                {mode === 'poster'
                  ? `${posterSheetsData.nonEmptySheets} com imagem`
                  : `Máximo ${montagemConfig.fH * montagemConfig.fV} na folha`}
              </span>
            </div>
          </div>

          {/* Specific Options for Poster vs Montagem */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-col gap-2.5">
            {mode === 'poster' ? (
              <>
                <label className="flex items-center gap-2.5 cursor-pointer py-0.5 select-none">
                  <input
                    type="checkbox"
                    checked={posterConfig.cutMarks}
                    onChange={(e) =>
                      setPosterConfig((prev) => ({ ...prev, cutMarks: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800">RECORTE AQUI</span>
                    <span className="text-[11px] text-slate-500">Guias para unir as folhas</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer py-0.5 select-none">
                  <input
                    type="checkbox"
                    checked={posterConfig.cutBorder}
                    onChange={(e) =>
                      setPosterConfig((prev) => ({ ...prev, cutBorder: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800">BORDA DE CORTE</span>
                    <span className="text-[11px] text-slate-500">Borda cinza para facilitar o corte</span>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className="flex items-center gap-2.5 cursor-pointer py-0.5 select-none">
                  <input
                    type="checkbox"
                    checked={montagemConfig.cardBorder}
                    onChange={(e) =>
                      setMontagemConfig((prev) => ({ ...prev, cardBorder: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800">CONTORNO DOS CARTÕES</span>
                    <span className="text-[11px] text-slate-500">Borda fina para guiar o corte</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer py-0.5 select-none">
                  <input
                    type="checkbox"
                    checked={montagemConfig.cardSpacing}
                    onChange={(e) =>
                      setMontagemConfig((prev) => {
                        const updated = { ...prev, cardSpacing: e.target.checked, manualSize: false };
                        const dims = calculateMontagemDimensions(updated, imageInfo?.widthPx, imageInfo?.heightPx);
                        return {
                          ...updated,
                          cardWidthCm: dims.cardW,
                          cardHeightCm: dims.cardH,
                        };
                      })
                    }
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800">ESPAÇAMENTO</span>
                    <span className="text-[11px] text-slate-500">Espaço entre cartões</span>
                  </div>
                </label>
              </>
            )}
          </div>
        </section>

        {/* 6. E O BOTÃO DE SALVAR ABAIXO (Desktop: 4º bloco coluna direita) */}
        <section
          id="section-save"
          className="order-5 lg:order-none lg:col-start-8 lg:col-span-5 xl:col-span-5 2xl:col-start-9 2xl:col-span-4 lg:row-start-5 w-full pt-1"
        >
          {/* Error notification if any */}
          {errorMessage && (
            <div className="w-full mb-3 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2 shadow-xs">
              <span className="font-bold">Aviso:</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!imageInfo || isExporting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 px-5 rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 text-base sm:text-lg cursor-pointer"
          >
            {isExporting ? (
              <>
                <RotateCcw className="w-5 h-5 animate-spin" />
                <span>{exportProgress?.text || 'Gerando PDF...'}</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>SALVAR EM PDF</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-slate-500 font-medium text-center mt-2">
            Gere um PDF A4 com medidas precisas, pronto para imprimir.
          </p>
        </section>
      </main>

      {/* MODAL DE SUCESSO AO SALVAR */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 flex items-center justify-center mb-3">
              <Check className="w-8 h-8 stroke-[2.5]" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">PDF Gerado com Sucesso!</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              O arquivo foi baixado no seu dispositivo.
              <br />
              <strong className="text-slate-800 font-semibold">{showSuccessModal.pages}</strong> {showSuccessModal.pages === 1 ? 'folha A4 configurada' : 'folhas A4 configuradas'}.
            </p>

            <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 mt-4 text-xs font-mono text-slate-700 truncate">
              {showSuccessModal.fileName}
            </div>

            <button
              type="button"
              onClick={() => setShowSuccessModal(null)}
              className="mt-5 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all shadow-md hover:shadow-lg cursor-pointer"
            >
              OK, Concluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
