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
  Smartphone,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  AppMode,
  Orientation,
  ImageInfo,
  PosterConfig,
  MontagemConfig,
  CropBox,
  FOLHA_MENOR,
  FOLHA_MAIOR,
  DPI_PADRAO,
  MARGEM_MINIMA_POSTER,
  MARGEM_MAXIMA_POSTER,
  MARGEM_PADRAO_POSTER,
  MARGEM_FIXA_MONTAGEM,
  ESPACO_MINIMO_MONTAGEM,
  ESPACO_MAXIMO_MONTAGEM,
  ESPACO_PADRAO_MONTAGEM,
  LIMITE_MAX_POSTER_CM,
} from './types';
import {
  calculateInitialPoster,
  calculatePosterWithFixedSheets,
  calculatePosterSheets,
  calculateBestPosterGrid,
  findAdjacentPosterGrid,
  findAdjacentMontagemGrid,
  getAllValidMontagemGrids,
  isValidGridCount,
  calculateMontagemDimensions,
  formatCm,
  formatCardCm,
  parseCm,
  getPageDimensions,
} from './utils/calculations';
import { generatePosterPdf, generateMontagemPdf } from './utils/pdfGenerator';
import { createCroppedImage } from './utils/imageCropper';
import { PosterPreview } from './components/PosterPreview';
import { MontagemPreview } from './components/MontagemPreview';
import { CropEditor } from './components/CropEditor';
import { CmInput } from './components/CmInput';
import { HoldButton } from './components/HoldButton';
import { PdfToWordModal } from './components/PdfToWordModal';

export default function App() {
  const [mode, setMode] = useState<AppMode>('poster');
  const [originalImageInfo, setOriginalImageInfo] = useState<ImageInfo | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [cropBox, setCropBox] = useState<CropBox>([0, 0, 1, 1]);
  const [isCropMode, setIsCropMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; text: string } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState<{ fileName: string; pages: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPdfToWordModalOpen, setIsPdfToWordModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poster configuration state
  const [posterConfig, setPosterConfig] = useState<PosterConfig>({
    orientation: 'vertical',
    widthCm: 19.6,
    heightCm: 28.3,
    fH: 1,
    fV: 1,
    marginCm: MARGEM_PADRAO_POSTER,
    keepRatio: true,
    cutMarks: true,
    cornerMarks: true,
    includeMontage: true,
    customAspect: 19.6 / 28.3,
  });

  // Montagem configuration state
  const [montagemConfig, setMontagemConfig] = useState<MontagemConfig>(() => {
    const initialDims = calculateMontagemDimensions({
      orientation: 'vertical',
      fH: 2,
      fV: 2,
      cardWidthCm: 10.1,
      cardHeightCm: 7.2,
      marginCm: MARGEM_FIXA_MONTAGEM,
      spacingCm: ESPACO_PADRAO_MONTAGEM,
      keepRatio: true,
      cardBorder: false,
      manualSize: false,
      quantity: 4,
    });
    return {
      orientation: 'vertical',
      fH: 2,
      fV: 2,
      cardWidthCm: initialDims.cardW,
      cardHeightCm: initialDims.cardH,
      marginCm: MARGEM_FIXA_MONTAGEM,
      spacingCm: ESPACO_PADRAO_MONTAGEM,
      keepRatio: true,
      cardBorder: false,
      manualSize: false,
      quantity: 4,
      customAspect: initialDims.cardW / initialDims.cardH,
    };
  });

  // Track the last edited field for keepRatio calculations
  const lastEditedField = useRef<'width' | 'height'>('width');

  // Input temporário para quantidade de páginas digitadas no modo pôster
  const [posterPagesInput, setPosterPagesInput] = useState<string | null>(null);

  // Página atual na visualização da montagem com múltiplas páginas
  const [montagemCurrentPage, setMontagemCurrentPage] = useState<number>(1);

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

      const initialAspect = widthPx / heightPx;

      setOriginalImageInfo(newInfo);
      setImageInfo(newInfo);
      setCropBox([0, 0, 1, 1]);
      setIsCropMode(false);
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
        customAspect: initialAspect,
      }));

      // Initialize montagem com 4 cartões fixos
      const dims = calculateMontagemDimensions(
        { ...montagemConfig, manualSize: false, customAspect: initialAspect, quantity: 4 },
        widthPx,
        heightPx,
        initialAspect
      );
      setMontagemConfig((prev) => ({
        ...prev,
        cardWidthCm: dims.cardW,
        cardHeightCm: dims.cardH,
        manualSize: false,
        quantity: 4,
        customAspect: initialAspect,
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

  // Dimensões do recorte em cm em tempo real
  const cropDimensions = useMemo(() => {
    if (!originalImageInfo) return { widthCm: '0,0', heightCm: '0,0' };
    const [x1, y1, x2, y2] = cropBox;
    const selW = Math.max(1, Math.round((x2 - x1) * originalImageInfo.widthPx));
    const selH = Math.max(1, Math.round((y2 - y1) * originalImageInfo.heightPx));
    const widthCm = ((selW / DPI_PADRAO) * 2.54).toFixed(1).replace('.', ',');
    const heightCm = ((selH / DPI_PADRAO) * 2.54).toFixed(1).replace('.', ',');
    return { widthCm, heightCm };
  }, [cropBox, originalImageInfo]);

  const handleApplyCrop = async (newBox: CropBox) => {
    if (!originalImageInfo) return;
    setIsCropMode(false);
    setCropBox(newBox);
    const cropped = await createCroppedImage(originalImageInfo, newBox);
    setImageInfo(cropped);

    const croppedAspect = cropped.widthPx / cropped.heightPx;

    // Update poster sizing based on cropped aspect ratio
    const page = getPageDimensions(posterConfig.orientation);
    const usableW = Math.max(0.1, page.width - posterConfig.marginCm * 2);
    const usableH = Math.max(0.1, page.height - posterConfig.marginCm * 2);

    let newW = posterConfig.widthCm;
    let newH = posterConfig.heightCm;

    if (posterConfig.keepRatio) {
      if (lastEditedField.current === 'height') {
        newW = Math.min(LIMITE_MAX_POSTER_CM, Math.round(newH * croppedAspect * 10) / 10);
      } else {
        newH = Math.min(LIMITE_MAX_POSTER_CM, Math.round((newW / croppedAspect) * 10) / 10);
      }
    }

    setPosterConfig((prev) => ({
      ...prev,
      widthCm: newW,
      heightCm: newH,
      fH: Math.max(1, Math.ceil(newW / usableW)),
      fV: Math.max(1, Math.ceil(newH / usableH)),
      customAspect: croppedAspect,
    }));

    // Update montagem sizing
    setMontagemConfig((prev) => {
      const updated = { ...prev, manualSize: false, customAspect: croppedAspect };
      const dims = calculateMontagemDimensions(updated, cropped.widthPx, cropped.heightPx, croppedAspect);
      return {
        ...updated,
        cardWidthCm: dims.cardW,
        cardHeightCm: dims.cardH,
        quantity: prev.quantity ?? 4,
        customAspect: croppedAspect,
      };
    });
  };

  const handleResetCrop = async () => {
    if (!originalImageInfo) return;
    const fullBox: CropBox = [0, 0, 1, 1];
    setCropBox(fullBox);
    setImageInfo(originalImageInfo);
    setIsCropMode(false);

    const resetAspect = originalImageInfo.widthPx / originalImageInfo.heightPx;

    const page = getPageDimensions(posterConfig.orientation);
    const usableW = Math.max(0.1, page.width - posterConfig.marginCm * 2);
    const usableH = Math.max(0.1, page.height - posterConfig.marginCm * 2);

    let newW = posterConfig.widthCm;
    let newH = posterConfig.heightCm;

    if (posterConfig.keepRatio) {
      if (lastEditedField.current === 'height') {
        newW = Math.min(LIMITE_MAX_POSTER_CM, Math.round(newH * resetAspect * 10) / 10);
      } else {
        newH = Math.min(LIMITE_MAX_POSTER_CM, Math.round((newW / resetAspect) * 10) / 10);
      }
    }

    setPosterConfig((prev) => ({
      ...prev,
      widthCm: newW,
      heightCm: newH,
      fH: Math.max(1, Math.ceil(newW / usableW)),
      fV: Math.max(1, Math.ceil(newH / usableH)),
      customAspect: resetAspect,
    }));

    setMontagemConfig((prev) => {
      const updated = { ...prev, manualSize: false, customAspect: resetAspect };
      const dims = calculateMontagemDimensions(updated, originalImageInfo.widthPx, originalImageInfo.heightPx, resetAspect);
      return {
        ...updated,
        cardWidthCm: dims.cardW,
        cardHeightCm: dims.cardH,
        quantity: prev.quantity ?? 4,
        customAspect: resetAspect,
      };
    });
  };

  const handleToggleCropMode = async () => {
    if (!originalImageInfo) return;
    if (isCropMode) {
      // Desativa imediatamente para resposta instantânea na interface
      setIsCropMode(false);
      const [x1, y1, x2, y2] = cropBox;
      const isCornerReset = x1 <= 0.015 && y1 <= 0.015 && x2 >= 0.985 && y2 >= 0.985;
      if (isCornerReset) {
        await handleResetCrop();
      } else {
        await handleApplyCrop(cropBox);
      }
    } else {
      setIsCropMode(true);
    }
  };

  // ----------------------------------------------------
  // PLUS AND MINUS HANDLERS (RIGHT & BOTTOM CONTROLS)
  // ----------------------------------------------------



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

      if (posterConfig.keepRatio && val > 0) {
        const aspect = posterConfig.customAspect ?? (imageInfo ? imageInfo.widthPx / imageInfo.heightPx : 1);
        newHeight = Math.min(LIMITE_MAX_POSTER_CM, newWidth / aspect);
      }

      const newFH = Math.max(1, Math.ceil((newWidth || 1) / usableW));
      const newFV = Math.max(1, Math.ceil((newHeight || 1) / usableH));
      const newAspect = newWidth / newHeight;

      setPosterConfig((prev) => ({
        ...prev,
        widthCm: newWidth,
        heightCm: newHeight,
        fH: newFH,
        fV: newFV,
        customAspect: newAspect,
      }));
    } else {
      // Montagem card width (provided in cm, e.g. 3.41 cm)
      const valCm = typeof valInput === 'number' ? valInput : parseCm(valInput, 0);
      if (valCm <= 0) return;
      const valMm = valCm * 10;

      const page = getPageDimensions(montagemConfig.orientation);
      const pageWMm = Math.round(page.width * 10);
      const pageHMm = Math.round(page.height * 10);
      const marginMm = Math.round(MARGEM_FIXA_MONTAGEM * 10);
      const areaWMm = Math.max(10, pageWMm - marginMm * 2);
      const areaHMm = Math.max(10, pageHMm - marginMm * 2);
      const spacingMm = Math.max(0, Math.round((montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM) * 10));

      let newCardWMm = Math.min(areaWMm, Math.max(5, valMm));
      let newCardHMm = montagemDims.cardHMm;

      if (montagemConfig.keepRatio && valMm > 0) {
        const aspect = montagemConfig.customAspect ?? (imageInfo ? imageInfo.widthPx / imageInfo.heightPx : 1);
        newCardHMm = Math.min(areaHMm, Math.floor((newCardWMm / aspect) * 10) / 10);
        let testFH = Math.max(1, Math.floor((areaWMm + spacingMm) / (newCardWMm + spacingMm) + 1e-9));
        let testFV = Math.max(1, Math.floor((areaHMm + spacingMm) / (newCardHMm + spacingMm) + 1e-9));
        while (testFH * testFV > 100 && newCardWMm < areaWMm) {
          newCardWMm = Math.round((newCardWMm + 0.2) * 10) / 10;
          newCardHMm = Math.min(areaHMm, Math.floor((newCardWMm / aspect) * 10) / 10);
          testFH = Math.max(1, Math.floor((areaWMm + spacingMm) / (newCardWMm + spacingMm) + 1e-9));
          testFV = Math.max(1, Math.floor((areaHMm + spacingMm) / (newCardHMm + spacingMm) + 1e-9));
        }
      } else {
        const curFV = Math.max(1, Math.floor((areaHMm + spacingMm) / (newCardHMm + spacingMm) + 1e-9));
        const maxAllowedFH = Math.max(1, Math.floor(100 / curFV));
        const curFH = Math.max(1, Math.floor((areaWMm + spacingMm) / (newCardWMm + spacingMm) + 1e-9));
        if (curFH > maxAllowedFH) {
          const minCardWMm = Math.ceil(((areaWMm + spacingMm) / (maxAllowedFH + 1) + 0.05) * 10) / 10;
          newCardWMm = Math.max(newCardWMm, minCardWMm);
        }
      }

      const fH = Math.max(1, Math.floor((areaWMm + spacingMm) / (newCardWMm + spacingMm) + 1e-9));
      const fV = Math.max(1, Math.floor((areaHMm + spacingMm) / (newCardHMm + spacingMm) + 1e-9));

      const finalCardWCm = Math.round((newCardWMm / 10) * 100) / 100;
      const finalCardHCm = Math.round((newCardHMm / 10) * 100) / 100;
      const newAspect = finalCardWCm / finalCardHCm;

      setMontagemConfig((prev) => ({
        ...prev,
        cardWidthCm: finalCardWCm,
        cardHeightCm: finalCardHCm,
        fH,
        fV,
        manualSize: true,
        customAspect: newAspect,
        quantity: prev.quantity ?? 4,
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

      if (posterConfig.keepRatio && val > 0) {
        const aspect = posterConfig.customAspect ?? (imageInfo ? imageInfo.widthPx / imageInfo.heightPx : 1);
        newWidth = Math.min(LIMITE_MAX_POSTER_CM, newHeight * aspect);
      }

      const newFH = Math.max(1, Math.ceil((newWidth || 1) / usableW));
      const newFV = Math.max(1, Math.ceil((newHeight || 1) / usableH));
      const newAspect = newWidth / newHeight;

      setPosterConfig((prev) => ({
        ...prev,
        widthCm: newWidth,
        heightCm: newHeight,
        fH: newFH,
        fV: newFV,
        customAspect: newAspect,
      }));
    } else {
      // Montagem card height (provided in cm, e.g. 4.52 cm)
      const valCm = typeof valInput === 'number' ? valInput : parseCm(valInput, 0);
      if (valCm <= 0) return;
      const valMm = valCm * 10;

      const page = getPageDimensions(montagemConfig.orientation);
      const pageWMm = Math.round(page.width * 10);
      const pageHMm = Math.round(page.height * 10);
      const marginMm = Math.round(MARGEM_FIXA_MONTAGEM * 10);
      const areaWMm = Math.max(10, pageWMm - marginMm * 2);
      const areaHMm = Math.max(10, pageHMm - marginMm * 2);
      const spacingMm = Math.max(0, Math.round((montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM) * 10));

      let newCardHMm = Math.min(areaHMm, Math.max(5, valMm));
      let newCardWMm = montagemDims.cardWMm;

      if (montagemConfig.keepRatio && valMm > 0) {
        const aspect = montagemConfig.customAspect ?? (imageInfo ? imageInfo.widthPx / imageInfo.heightPx : 1);
        newCardWMm = Math.min(areaWMm, Math.floor((newCardHMm * aspect) * 10) / 10);
        let testFH = Math.max(1, Math.floor((areaWMm + spacingMm) / (newCardWMm + spacingMm) + 1e-9));
        let testFV = Math.max(1, Math.floor((areaHMm + spacingMm) / (newCardHMm + spacingMm) + 1e-9));
        while (testFH * testFV > 100 && newCardHMm < areaHMm) {
          newCardHMm = Math.round((newCardHMm + 0.2) * 10) / 10;
          newCardWMm = Math.min(areaWMm, Math.floor((newCardHMm * aspect) * 10) / 10);
          testFH = Math.max(1, Math.floor((areaWMm + spacingMm) / (newCardWMm + spacingMm) + 1e-9));
          testFV = Math.max(1, Math.floor((areaHMm + spacingMm) / (newCardHMm + spacingMm) + 1e-9));
        }
      } else {
        const curFH = Math.max(1, Math.floor((areaWMm + spacingMm) / (newCardWMm + spacingMm) + 1e-9));
        const maxAllowedFV = Math.max(1, Math.floor(100 / curFH));
        const curFV = Math.max(1, Math.floor((areaHMm + spacingMm) / (newCardHMm + spacingMm) + 1e-9));
        if (curFV > maxAllowedFV) {
          const minCardHMm = Math.ceil(((areaHMm + spacingMm) / (maxAllowedFV + 1) + 0.05) * 10) / 10;
          newCardHMm = Math.max(newCardHMm, minCardHMm);
        }
      }

      const fH = Math.max(1, Math.floor((areaWMm + spacingMm) / (newCardWMm + spacingMm) + 1e-9));
      const fV = Math.max(1, Math.floor((areaHMm + spacingMm) / (newCardHMm + spacingMm) + 1e-9));

      const finalCardWCm = Math.round((newCardWMm / 10) * 100) / 100;
      const finalCardHCm = Math.round((newCardHMm / 10) * 100) / 100;
      const newAspect = finalCardWCm / finalCardHCm;

      setMontagemConfig((prev) => ({
        ...prev,
        cardWidthCm: finalCardWCm,
        cardHeightCm: finalCardHCm,
        fH,
        fV,
        manualSize: true,
        customAspect: newAspect,
        quantity: prev.quantity ?? 4,
      }));
    }
  };

  const handleQuantityChange = (valStr: string) => {
    const val = parseInt(valStr, 10);
    if (isNaN(val) || val <= 0) {
      setMontagemConfig((prev) => ({ ...prev, quantity: 4 }));
    } else {
      setMontagemConfig((prev) => ({ ...prev, quantity: Math.max(1, Math.min(500, val)) }));
    }
  };

  const handlePosterPagesChange = (valStr: string) => {
    const val = parseInt(valStr, 10);
    if (isNaN(val) || val <= 0) return;
    if (!imageInfo) return;

    // A contagem não inclui a página modelo montado
    const targetSheets = val;
    const effectiveAspect = posterConfig.customAspect ?? (imageInfo.widthPx / imageInfo.heightPx);

    const { fH, fV, orientation, widthCm, heightCm } = calculateBestPosterGrid(
      targetSheets,
      imageInfo.widthPx,
      imageInfo.heightPx,
      posterConfig.orientation,
      posterConfig.marginCm,
      true,
      effectiveAspect
    );

    setPosterConfig((prev) => ({
      ...prev,
      fH,
      fV,
      orientation,
      widthCm,
      heightCm,
    }));
  };

  const handleAdjustQuantity = (delta: number) => {
    if (mode === 'poster') {
      if (!imageInfo) return;
      const current = posterSheetsData.nonEmptySheets;
      const direction: 1 | -1 = delta > 0 ? 1 : -1;
      const effectiveAspect = posterConfig.customAspect ?? (imageInfo.widthPx / imageInfo.heightPx);
      const nextGrid = findAdjacentPosterGrid(
        current,
        direction,
        imageInfo.widthPx,
        imageInfo.heightPx,
        posterConfig.orientation,
        posterConfig.marginCm,
        true,
        effectiveAspect
      );

      if (nextGrid) {
        setPosterPagesInput(null);
        setPosterConfig((prev) => ({
          ...prev,
          fH: nextGrid.fH,
          fV: nextGrid.fV,
          orientation: nextGrid.orientation,
          widthCm: nextGrid.widthCm,
          heightCm: nextGrid.heightCm,
        }));
      }
    } else {
      const current = montagemConfig.quantity ?? 4;
      const next = Math.max(1, Math.min(500, current + delta));
      if (next !== current) {
        setMontagemConfig((prev) => ({
          ...prev,
          quantity: next,
        }));
        const capacity = montagemConfig.fH * montagemConfig.fV;
        const targetPage = Math.ceil(next / capacity);
        if (delta > 0 && targetPage > montagemCurrentPage) {
          setMontagemCurrentPage(targetPage);
        }
      }
    }
  };

  const handleAdjustMontagemGrid = (delta: number) => {
    if (!imageInfo) return;
    const currentCapacity = montagemConfig.fH * montagemConfig.fV;
    const direction: 1 | -1 = delta > 0 ? 1 : -1;
    const effectiveAspect = montagemConfig.customAspect ?? (imageInfo.widthPx / imageInfo.heightPx);
    const nextGrid = findAdjacentMontagemGrid(
      currentCapacity,
      direction,
      imageInfo.widthPx,
      imageInfo.heightPx,
      montagemConfig,
      effectiveAspect
    );

    if (nextGrid) {
      const nextCap = nextGrid.fH * nextGrid.fV;
      const nextTotalPages = Math.max(1, Math.ceil((montagemConfig.quantity ?? 4) / nextCap));
      if (delta < 0 && nextTotalPages > 1) {
        setMontagemCurrentPage(nextTotalPages);
      }
      setMontagemConfig((prev) => ({
        ...prev,
        fH: nextGrid.fH,
        fV: nextGrid.fV,
        orientation: nextGrid.orientation,
        cardWidthCm: nextGrid.cardW,
        cardHeightCm: nextGrid.cardH,
        manualSize: false,
        quantity: prev.quantity ?? 4,
      }));
    }
  };



  // Toggle Keep Ratio
  // Ao ativar manter proporção, volta para a proporção original da imagem.
  const handleToggleKeepRatio = () => {
    if (mode === 'poster') {
      const willBeActive = !posterConfig.keepRatio;
      setPosterConfig((prev) => {
        if (willBeActive && imageInfo) {
          const originalAspect = originalImageInfo
            ? originalImageInfo.widthPx / originalImageInfo.heightPx
            : imageInfo.widthPx / imageInfo.heightPx;

          let newW = prev.widthCm;
          let newH = prev.heightCm;

          if (lastEditedField.current === 'height') {
            newW = Math.min(LIMITE_MAX_POSTER_CM, Math.round(newH * originalAspect * 10) / 10);
          } else {
            newH = Math.min(LIMITE_MAX_POSTER_CM, Math.round((newW / originalAspect) * 10) / 10);
          }

          const page = getPageDimensions(prev.orientation);
          const usableW = Math.max(0.1, page.width - prev.marginCm * 2);
          const usableH = Math.max(0.1, page.height - prev.marginCm * 2);

          return {
            ...prev,
            keepRatio: true,
            widthCm: newW,
            heightCm: newH,
            fH: Math.max(1, Math.ceil(newW / usableW)),
            fV: Math.max(1, Math.ceil(newH / usableH)),
            customAspect: originalAspect,
          };
        }
        return {
          ...prev,
          keepRatio: willBeActive,
        };
      });
    } else {
      const willBeActive = !montagemConfig.keepRatio;
      setMontagemConfig((prev) => {
        if (willBeActive && imageInfo) {
          const originalAspect = originalImageInfo
            ? originalImageInfo.widthPx / originalImageInfo.heightPx
            : imageInfo.widthPx / imageInfo.heightPx;

          const updated = {
            ...prev,
            keepRatio: true,
            manualSize: false,
            customAspect: originalAspect,
          };
          const dims = calculateMontagemDimensions(
            updated,
            imageInfo.widthPx,
            imageInfo.heightPx,
            originalAspect
          );
          return {
            ...updated,
            cardWidthCm: dims.cardW,
            cardHeightCm: dims.cardH,
            quantity: prev.quantity ?? 4,
            customAspect: originalAspect,
          };
        }
        return {
          ...prev,
          keepRatio: willBeActive,
        };
      });
    }
  };

  // Margin Change (Poster: desconta no tamanho do pôster mantendo as folhas da grade)
  const handleMarginChange = (valInput: number | string) => {
    const val = typeof valInput === 'number' ? valInput : parseCm(valInput, MARGEM_PADRAO_POSTER);
    if (val <= 0) return;

    const clamped = Math.max(MARGEM_MINIMA_POSTER, Math.min(val, MARGEM_MAXIMA_POSTER));
    const effectiveAspect = posterConfig.customAspect ?? (imageInfo ? imageInfo.widthPx / imageInfo.heightPx : posterConfig.widthCm / posterConfig.heightCm);

    const dims = calculatePosterWithFixedSheets(
      imageInfo ? imageInfo.widthPx : 1,
      imageInfo ? imageInfo.heightPx : 1,
      posterConfig.fH,
      posterConfig.fV,
      posterConfig.orientation,
      clamped,
      true,
      effectiveAspect
    );

    setPosterConfig((prev) => ({
      ...prev,
      marginCm: clamped,
      widthCm: dims.widthCm,
      heightCm: dims.heightCm,
    }));
  };

  // Spacing Change (Montagem: Espaço entre cartões)
  const handleSpacingChange = (valInput: number | string) => {
    const val = typeof valInput === 'number' ? valInput : parseCm(valInput, ESPACO_PADRAO_MONTAGEM);
    const clamped = Math.max(ESPACO_MINIMO_MONTAGEM, Math.min(val, ESPACO_MAXIMO_MONTAGEM));
    setMontagemConfig((prev) => {
      const updated = { ...prev, spacingCm: clamped, manualSize: false };
      const dims = calculateMontagemDimensions(updated, imageInfo?.widthPx, imageInfo?.heightPx);
      return {
        ...updated,
        cardWidthCm: dims.cardW,
        cardHeightCm: dims.cardH,
      };
    });
  };

  const handleAdjustMargin = (delta: number) => {
    if (mode === 'poster') {
      const current = posterConfig.marginCm;
      const next = Math.max(
        MARGEM_MINIMA_POSTER,
        Math.min(MARGEM_MAXIMA_POSTER, Math.round((current + delta) * 10) / 10)
      );
      if (next !== current) {
        handleMarginChange(next);
      }
    } else {
      const current = montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM;
      const next = Math.max(
        ESPACO_MINIMO_MONTAGEM,
        Math.min(ESPACO_MAXIMO_MONTAGEM, Math.round((current + delta) * 10) / 10)
      );
      if (next !== current) {
        handleSpacingChange(next);
      }
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
          pages: nonEmptySheets + (posterConfig.includeMontage ? 1 : 0),
        });
      } else {
        await generateMontagemPdf(imageInfo, montagemConfig, (percent, text) => {
          setExportProgress({ percent, text });
        });
        setShowSuccessModal({
          fileName: `${imageInfo.name.replace(/\.[^/.]+$/, '')}_montagem.pdf`,
          pages: montagemTotalPages,
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
    const effectiveAspect = montagemConfig.customAspect ?? (imageInfo ? imageInfo.widthPx / imageInfo.heightPx : undefined);
    return calculateMontagemDimensions(montagemConfig, imageInfo?.widthPx, imageInfo?.heightPx, effectiveAspect);
  }, [imageInfo, montagemConfig]);

  // Current values for input display
  const currentWidthValue =
    mode === 'poster' ? posterConfig.widthCm : montagemDims.cardW;
  const currentHeightValue =
    mode === 'poster' ? posterConfig.heightCm : montagemDims.cardH;

  const montagemCardsPerPage = montagemConfig.fH * montagemConfig.fV;
  const montagemTotalQuantity = montagemConfig.quantity ?? 4;
  const montagemTotalPages = Math.max(1, Math.ceil(montagemTotalQuantity / montagemCardsPerPage));

  // Quando tiver várias páginas e for diminuindo o tamanho da grade (capacidade por página diminuiu), sempre mostrar a última página
  const prevMontagemCardsPerPageRef = useRef<number>(montagemCardsPerPage);
  useEffect(() => {
    const prevCap = prevMontagemCardsPerPageRef.current;
    prevMontagemCardsPerPageRef.current = montagemCardsPerPage;
    if (montagemCardsPerPage < prevCap && montagemTotalPages > 1) {
      setMontagemCurrentPage(montagemTotalPages);
    }
  }, [montagemCardsPerPage, montagemTotalPages]);

  // Clamping de página da montagem se ultrapassar o total de páginas
  useEffect(() => {
    if (montagemCurrentPage > montagemTotalPages) {
      setMontagemCurrentPage(montagemTotalPages);
    }
  }, [montagemTotalPages, montagemCurrentPage]);

  const isMinQuantity =
    mode === 'poster'
      ? posterSheetsData.nonEmptySheets <= 1
      : montagemTotalQuantity <= 1;

  const isMaxQuantity =
    mode === 'poster'
      ? posterSheetsData.nonEmptySheets >= 500
      : montagemTotalQuantity >= 500;

  const isMinMargin =
    mode === 'poster'
      ? posterConfig.marginCm <= MARGEM_MINIMA_POSTER + 0.001
      : (montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM) <= ESPACO_MINIMO_MONTAGEM + 0.001;

  const isMaxMargin =
    mode === 'poster'
      ? posterConfig.marginCm >= MARGEM_MAXIMA_POSTER - 0.001
      : (montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM) >= ESPACO_MAXIMO_MONTAGEM - 0.001;

  const validMontagemGrids = useMemo(() => {
    if (!imageInfo) return [];
    const effectiveAspect = montagemConfig.customAspect ?? (imageInfo.widthPx / imageInfo.heightPx);
    return getAllValidMontagemGrids(imageInfo.widthPx, imageInfo.heightPx, montagemConfig, effectiveAspect);
  }, [imageInfo, montagemConfig.customAspect, montagemConfig.spacingCm, montagemConfig.cardSpacing]);

  const currentMontagemCap = montagemConfig.fH * montagemConfig.fV;
  const isMinMontagemGrid = !validMontagemGrids.some((g) => g.capacity < currentMontagemCap);
  const isMaxMontagemGrid = !validMontagemGrids.some((g) => g.capacity > currentMontagemCap);



  return (
    <div className="min-h-screen lg:h-screen lg:max-h-screen lg:overflow-hidden bg-slate-50 text-slate-800 flex flex-col items-center select-none">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/bmp"
        className="hidden"
        onChange={onFileSelected}
      />

      {/* Main Container: Mobile single-column, Desktop 2-column workspace adjusting to screen height */}
      <main className="w-full max-w-xl sm:max-w-2xl lg:max-w-none mx-auto px-3.5 sm:px-5 lg:px-6 xl:px-8 2xl:px-10 py-2.5 sm:py-3.5 lg:py-3 pb-4 sm:pb-6 lg:pb-3 flex flex-col gap-4 sm:gap-5 lg:flex-1 lg:min-h-0 lg:h-full lg:flex-row lg:gap-5 xl:gap-6">
        {/* 2. ÁREA DE VISUALIZAÇÃO (Desktop: largura máxima ajustando ao tamanho da tela e altura total; Mobile: fixa no topo) */}
        <section
          id="section-preview"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`order-2 lg:order-none lg:flex-1 lg:min-w-0 sticky top-2 z-20 lg:static lg:z-auto w-full lg:h-full lg:min-h-0 bg-white rounded-2xl p-2.5 sm:p-3.5 border transition-all shadow-md lg:shadow-xs flex flex-col overflow-hidden ${
            isDragging ? 'border-blue-500 ring-2 ring-blue-400/40 bg-blue-50/20' : 'border-slate-200'
          }`}
        >
          {isCropMode ? (
            <div className="flex items-center justify-between mb-2 gap-2 min-w-0 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 shrink-0">
                  MODO RECORTE
                </span>
              </div>
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 shrink-0">
                <span>Tam.</span>
                <span className="font-semibold text-slate-800">
                  {cropDimensions.widthCm} x {cropDimensions.heightCm} cm
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-2 gap-2 min-w-0 shrink-0">
              {/* Esquerda: Tam. */}
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 shrink-0">
                <span>Tam.</span>
                <span className="font-semibold text-slate-800">
                  {imageInfo
                    ? mode === 'poster'
                      ? `${formatCm(posterConfig.widthCm)} x ${formatCm(posterConfig.heightCm)} cm`
                      : `${formatCardCm(montagemDims.cardW)} x ${formatCardCm(montagemDims.cardH)} cm`
                    : mode === 'poster'
                    ? 'A4'
                    : `${formatCardCm(montagemDims.cardW)} x ${formatCardCm(montagemDims.cardH)} cm`}
                </span>
              </div>

              {/* Direita no modo pôster: folhas */}
              {mode === 'poster' && (
                <div className="ml-auto shrink-0 whitespace-nowrap">
                  <span className="text-xs font-semibold text-slate-600 shrink-0">
                    {posterSheetsData.nonEmptySheets} {posterSheetsData.nonEmptySheets === 1 ? 'folha' : 'folhas'}
                  </span>
                </div>
              )}

              {/* Direita no modo montagem: páginas e quantidade de cartões */}
              {mode === 'montagem' && (
                <div className="ml-auto shrink-0 whitespace-nowrap">
                  {montagemTotalPages > 1 ? (
                    <div className="text-xs font-bold text-slate-700 flex items-center gap-1 shrink-0 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setMontagemCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={montagemCurrentPage <= 1}
                        className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-slate-700 transition-colors"
                        title="Página anterior"
                        aria-label="Página anterior"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="whitespace-nowrap">
                        Pág. {montagemCurrentPage} de {montagemTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMontagemCurrentPage((p) => Math.min(montagemTotalPages, p + 1))}
                        disabled={montagemCurrentPage >= montagemTotalPages}
                        className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-slate-700 transition-colors"
                        title="Próxima página"
                        aria-label="Próxima página"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-semibold text-slate-800 ml-0.5 whitespace-nowrap">
                        ({montagemTotalQuantity} {montagemTotalQuantity === 1 ? 'cartão' : 'cartões'})
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                      <span className="whitespace-nowrap">Pág. 1 de 1</span>
                      <span className="font-semibold text-slate-800 whitespace-nowrap">
                        ({montagemTotalQuantity} {montagemTotalQuantity === 1 ? 'cartão' : 'cartões'})
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isCropMode && originalImageInfo ? (
            <CropEditor
              originalImage={originalImageInfo}
              cropBox={cropBox}
              onChangeCropBox={setCropBox}
            />
          ) : mode === 'poster' ? (
            <PosterPreview imageInfo={imageInfo} config={posterConfig} />
          ) : (
            <MontagemPreview
              imageInfo={imageInfo}
              config={montagemConfig}
              currentPage={montagemCurrentPage}
              totalPages={montagemTotalPages}
              onPageChange={setMontagemCurrentPage}
            />
          )}
        </section>

        {/* COLUNA DE CONFIGURAÇÕES (Desktop: largura fixa ideal com rolagem independente; Mobile: contents para ordem flex) */}
        <div className="contents lg:flex lg:flex-col lg:w-80 xl:w-[350px] 2xl:w-[370px] lg:shrink-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1.5 lg:gap-3 xl:gap-3.5 custom-scrollbar">
          {/* MODO: CRIAR PÔSTER / MONTAR CARTÕES + DESCRIÇÃO */}
          <section
            id="section-mode-switcher"
            className={`order-first lg:order-none shrink-0 w-full flex flex-col items-center gap-1.5 transition-all duration-200 ${
              isCropMode ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''
            }`}
          >
            <div className="w-full bg-slate-100 p-0.5 sm:p-1 rounded-xl flex border border-slate-200 shadow-xs">
              <button
                type="button"
                onClick={() => setMode('poster')}
                className={`flex-1 h-8 sm:h-8.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  mode === 'poster'
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Criar pôster</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('montagem')}
                className={`flex-1 h-8 sm:h-8.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  mode === 'montagem'
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Grid className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Montar cartões</span>
              </button>
            </div>

            <p className="text-[11px] sm:text-xs text-slate-500 text-center px-1">
              {mode === 'poster'
                ? 'Amplie e divida sua imagem em folhas A4 para imprimir e montar.'
                : 'Crie vários cartões em uma folha A4, com guias de corte.'}
            </p>
          </section>

          {/* 1. EM CIMA: BOTÃO DE INSERIR A IMAGEM */}
          <section
            id="section-upload"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`order-1 lg:order-none shrink-0 w-full transition-all duration-200 ${
              isDragging ? 'opacity-90 ring-2 ring-blue-500 rounded-xl' : ''
            } ${isCropMode ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''}`}
          >
            <button
              type="button"
              disabled={isCropMode}
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold h-8 sm:h-8.5 py-1.5 px-3 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>{imageInfo ? 'Trocar imagem' : 'Inserir imagem'}</span>
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
                  disabled={isCropMode}
                  onClick={loadSampleImage}
                  className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium hover:underline cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Usar imagem de exemplo para testar</span>
                </button>
              </div>
            )}
          </section>

          {/* 2. SEÇÃO: TAMANHO (Largura, Altura, Manter Proporção e Modo Recorte) */}
          <section
            id="section-size"
            className={`order-3 lg:order-none shrink-0 w-full bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200 shadow-xs flex flex-col gap-2 transition-all duration-200 ${
              !imageInfo
                ? 'opacity-40 pointer-events-none select-none text-slate-400'
                : ''
            }`}
          >
            <div className={`flex items-center justify-between text-xs font-bold transition-colors ${!imageInfo || isCropMode ? 'text-slate-400' : 'text-slate-800'}`}>
              <span>TAMANHO</span>
            </div>

            <div className={`grid grid-cols-2 gap-2.5 sm:gap-3 transition-all duration-200 ${!imageInfo || isCropMode ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''}`}>
              {/* Input Largura */}
              <div className="flex flex-col gap-1">
                <label htmlFor="input-largura" className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-700'}`}>
                  Largura
                </label>
                <CmInput
                  id="input-largura"
                  value={currentWidthValue}
                  onChange={handleWidthChange}
                  placeholder="0,0"
                  disabled={!imageInfo || isCropMode}
                  min={mode === 'poster' ? 1 : 0.5}
                  max={mode === 'poster' ? LIMITE_MAX_POSTER_CM : 50}
                  unit="cm"
                  unitClassName="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-semibold pointer-events-none"
                  formatFn={mode === 'poster' ? formatCm : formatCardCm}
                  parseFn={parseCm}
                  className="w-full h-8 px-3 py-1 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
                />
              </div>

              {/* Input Altura */}
              <div className="flex flex-col gap-1">
                <label htmlFor="input-altura" className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-700'}`}>
                  Altura
                </label>
                <CmInput
                  id="input-altura"
                  value={currentHeightValue}
                  onChange={handleHeightChange}
                  placeholder="0,0"
                  disabled={!imageInfo || isCropMode}
                  min={mode === 'poster' ? 1 : 0.5}
                  max={mode === 'poster' ? LIMITE_MAX_POSTER_CM : 50}
                  unit="cm"
                  unitClassName="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-semibold pointer-events-none"
                  formatFn={mode === 'poster' ? formatCm : formatCardCm}
                  parseFn={parseCm}
                  className="w-full h-8 px-3 py-1 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
                />
              </div>
            </div>

            {/* Manter Proporção e Modo Recorte */}
            <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
              <label
                className={`flex items-center gap-2 cursor-pointer py-0.5 select-none transition-all duration-200 ${
                  !imageInfo || isCropMode ? 'opacity-30 pointer-events-none text-slate-300' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={mode === 'poster' ? posterConfig.keepRatio : montagemConfig.keepRatio}
                  onChange={handleToggleKeepRatio}
                  disabled={!imageInfo || isCropMode}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white cursor-pointer disabled:cursor-not-allowed"
                />
                <span className={`text-xs font-semibold ${!imageInfo || isCropMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Manter proporção
                </span>
              </label>

              <label
                className={`flex items-center gap-1.5 py-1 px-2.5 rounded-xl select-none cursor-pointer transition-all duration-150 ${
                  !imageInfo || !originalImageInfo
                    ? 'opacity-40 cursor-not-allowed text-slate-400 pointer-events-none'
                    : isCropMode
                    ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold shadow-sm ring-2 ring-blue-400 cursor-pointer pointer-events-auto'
                    : 'text-slate-700 hover:text-blue-600 hover:bg-slate-100'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isCropMode}
                  disabled={!imageInfo || !originalImageInfo}
                  onChange={handleToggleCropMode}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white cursor-pointer"
                />
                <span className="text-xs font-semibold">
                  {isCropMode ? 'Desativar modo recorte' : 'Ativar modo recorte'}
                </span>
              </label>
            </div>
          </section>

          {/* 3. SEÇÃO: QUANTIDADE (Destaque com fundo azul bem claro) */}
          <section
            id="section-quantity"
            className={`order-4 lg:order-none shrink-0 w-full bg-blue-50/60 rounded-2xl p-3 sm:p-3.5 border border-blue-200/70 shadow-xs flex flex-col gap-2 transition-all duration-200 ${
              !imageInfo
                ? 'opacity-40 pointer-events-none select-none text-slate-400'
                : ''
            }`}
          >
            <div className={`flex items-center justify-between text-xs font-bold transition-colors ${!imageInfo || isCropMode ? 'text-slate-400' : 'text-slate-800'}`}>
              <span>QUANTIDADE</span>
            </div>

            {/* No modo montagem: Grade de cartões na folha */}
            {mode === 'montagem' && (
              <div className={`flex flex-col gap-1 transition-all duration-200 ${!imageInfo || isCropMode ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''}`}>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="input-grade-cartoes" className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-700'}`}>
                      Grade de cartões
                    </label>
                    <div className="relative">
                      <input
                        id="input-grade-cartoes"
                        type="text"
                        inputMode="none"
                        readOnly
                        value={`${montagemConfig.fH * montagemConfig.fV} (${montagemConfig.fH}x${montagemConfig.fV})`}
                        disabled={!imageInfo || isCropMode}
                        className="w-full h-8 px-2.5 py-1 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs cursor-default select-none focus:outline-none focus:ring-0 disabled:bg-slate-100 disabled:opacity-60 shadow-xs truncate"
                      />
                    </div>
                  </div>

                  {/* Botões - e + para Grade de Cartões */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-transparent select-none">&nbsp;</span>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <HoldButton
                        onAction={() => handleAdjustMontagemGrid(-1)}
                        disabled={!imageInfo || isCropMode || isMinMontagemGrid}
                        className="flex-1 h-8 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                        title="Diminuir grade na folha"
                        aria-label="Diminuir grade na folha"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </HoldButton>
                      <HoldButton
                        onAction={() => handleAdjustMontagemGrid(1)}
                        disabled={!imageInfo || isCropMode || isMaxMontagemGrid}
                        className="flex-1 h-8 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-xl text-blue-700 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                        title="Aumentar grade na folha"
                        aria-label="Aumentar grade na folha"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </HoldButton>
                    </div>
                  </div>
                </div>
                <p className={`text-[11px] mt-0.5 ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
                  Monta a grade na página com rotação automática
                </p>
              </div>
            )}

            {/* Input Quantidade (Quantidade de páginas no Pôster / Quantidade de cartões na Montagem) */}
            <div className={`flex flex-col gap-1 transition-all duration-200 ${mode === 'montagem' ? 'pt-2 border-t border-blue-200/60' : ''} ${!imageInfo || isCropMode ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''}`}>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="input-quantidade" className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-700'}`}>
                    {mode === 'poster' ? 'Quantidade de páginas' : 'Quantidade de cartões'}
                  </label>
                  <div className="relative">
                    <input
                      id="input-quantidade"
                      type="text"
                      inputMode="none"
                      readOnly
                      value={
                        mode === 'poster'
                          ? posterSheetsData.nonEmptySheets
                          : montagemTotalQuantity
                      }
                      disabled={!imageInfo || isCropMode}
                      className="w-full h-8 px-3 py-1 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs cursor-default select-none focus:outline-none focus:ring-0 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
                    />
                  </div>
                </div>

                {/* Botões - e + para Quantidade */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-transparent select-none">&nbsp;</span>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <HoldButton
                      onAction={() => handleAdjustQuantity(-1)}
                      disabled={!imageInfo || isCropMode || isMinQuantity}
                      className="flex-1 h-8 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                      title={mode === 'poster' ? 'Diminuir páginas' : 'Diminuir cartões'}
                      aria-label={mode === 'poster' ? 'Diminuir páginas' : 'Diminuir cartões'}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </HoldButton>
                    <HoldButton
                      onAction={() => handleAdjustQuantity(1)}
                      disabled={!imageInfo || isCropMode || isMaxQuantity}
                      className="flex-1 h-8 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-xl text-blue-700 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                      title={mode === 'poster' ? 'Aumentar páginas' : 'Aumentar cartões'}
                      aria-label={mode === 'poster' ? 'Aumentar páginas' : 'Aumentar cartões'}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </HoldButton>
                  </div>
                </div>
              </div>
              <p className={`text-[11px] mt-0.5 ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
                {mode === 'poster'
                  ? 'O poster será montado de acordo a quantidade de páginas'
                  : 'Reduza ou aumente a quantidade de cartões'}
              </p>
            </div>
          </section>

          {/* 5. E DEPOIS AS OPÇÕES */}
          <section
            id="section-options"
            className={`order-5 lg:order-none shrink-0 w-full bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200 shadow-xs flex flex-col gap-2.5 sm:gap-3 transition-all duration-200 ${
              !imageInfo
                ? 'opacity-40 pointer-events-none select-none text-slate-400'
                : isCropMode
                ? 'opacity-30 pointer-events-none select-none text-slate-300'
                : ''
            }`}
          >
          <div className={`flex items-center justify-between text-xs font-bold ${!imageInfo ? 'text-slate-400' : 'text-slate-800'}`}>
            <span>IMPRESSÃO E RECORTE</span>
          </div>

          {/* Margem da Folha / Espaço entre cartões */}
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-2 gap-3">
              {/* Input Margem / Espaço entre cartões */}
              <div className="flex flex-col gap-1">
                <label htmlFor="input-margem" className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-700'}`}>
                  {mode === 'poster' ? 'Margem da folha' : 'Espaço entre cartões'}
                </label>
                <CmInput
                  id="input-margem"
                  readOnly
                  value={mode === 'poster' ? posterConfig.marginCm : (montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM)}
                  onChange={mode === 'poster' ? handleMarginChange : handleSpacingChange}
                  disabled={!imageInfo || isCropMode}
                  min={mode === 'poster' ? MARGEM_MINIMA_POSTER : ESPACO_MINIMO_MONTAGEM}
                  max={mode === 'poster' ? MARGEM_MAXIMA_POSTER : ESPACO_MAXIMO_MONTAGEM}
                  unitClassName="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-semibold pointer-events-none"
                  className="w-full h-8 px-3 py-1 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs cursor-default select-none focus:outline-none focus:ring-0 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
                />
              </div>

              {/* Botões - e + para Margem / Espaço */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-transparent select-none">&nbsp;</span>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <HoldButton
                    onAction={() => handleAdjustMargin(-0.1)}
                    disabled={!imageInfo || isCropMode || isMinMargin}
                    className="flex-1 h-8 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                    title={mode === 'poster' ? 'Diminuir margem' : 'Diminuir espaço'}
                    aria-label={mode === 'poster' ? 'Diminuir margem' : 'Diminuir espaço'}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </HoldButton>
                  <HoldButton
                    onAction={() => handleAdjustMargin(0.1)}
                    disabled={!imageInfo || isCropMode || isMaxMargin}
                    className="flex-1 h-8 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-xl text-blue-700 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                    title={mode === 'poster' ? 'Aumentar margem' : 'Aumentar espaço'}
                    aria-label={mode === 'poster' ? 'Aumentar margem' : 'Aumentar espaço'}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </HoldButton>
                </div>
              </div>
            </div>
            <p className={`text-[11px] mt-0.5 ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
              {mode === 'poster'
                ? 'Margem de borda em branco em cada folha para impressão'
                : 'Espaço para corte entre cada cartão na folha A4'}
            </p>
          </div>

          {/* Specific Options for Poster vs Montagem */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-col gap-2.5">
            {mode === 'poster' ? (
              <>
                <label className={`flex items-center gap-2.5 cursor-pointer py-0.5 select-none ${!imageInfo ? 'pointer-events-none text-slate-400' : ''}`}>
                  <input
                    type="checkbox"
                    checked={Boolean(posterConfig.includeMontage)}
                    disabled={!imageInfo || isCropMode}
                    onChange={(e) =>
                      setPosterConfig((prev) => ({ ...prev, includeMontage: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white disabled:cursor-not-allowed"
                  />
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-800'}`}>Modelo montado do pôster</span>
                    <span className={`text-[11px] ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>Adicionar montagem na primeira página do PDF</span>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className={`flex items-center gap-2.5 cursor-pointer py-0.5 select-none ${!imageInfo ? 'pointer-events-none text-slate-400' : ''}`}>
                  <input
                    type="checkbox"
                    checked={montagemConfig.cardBorder}
                    disabled={!imageInfo || isCropMode}
                    onChange={(e) =>
                      setMontagemConfig((prev) => ({ ...prev, cardBorder: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white disabled:cursor-not-allowed"
                  />
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-800'}`}>Contorno dos cartões</span>
                    <span className={`text-[11px] ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>Borda fina para guiar o corte</span>
                  </div>
                </label>
              </>
            )}
          </div>
        </section>

        {/* 6. E O BOTÃO DE SALVAR ABAIXO */}
        <section
          id="section-save"
          className={`order-6 lg:order-none shrink-0 w-full pt-0.5 pb-2 transition-all duration-200 ${
            isCropMode
              ? 'opacity-30 pointer-events-none select-none text-slate-300'
              : ''
          }`}
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
            disabled={!imageInfo || isExporting || isCropMode}
            className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold h-8 sm:h-8.5 py-1.5 px-3 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
          >
            {isExporting ? (
              <>
                <RotateCcw className="w-4 h-4 shrink-0 animate-spin" />
                <span>{exportProgress?.text || 'Gerando PDF...'}</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 shrink-0" />
                <span>Salvar em PDF</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-slate-500 font-medium text-center mt-2">
            Gere um PDF A4 com medidas precisas, pronto para imprimir.
          </p>

          {/* Botão de Inserir páginas do PDF no Word:
              Visível e ATIVO somente antes de inserir uma imagem. Depois de inserir imagem, é retirado. */}
          {!imageInfo && !isCropMode && (
            <div className="mt-2.5 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setIsPdfToWordModalOpen(true)}
                className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium hover:underline cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span>Inserir páginas de PDF no arquivo Word</span>
              </button>
            </div>
          )}
        </section>
        </div>
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

      {/* MODAL DE INSERIR PÁGINAS DO PDF NO WORD */}
      <PdfToWordModal
        isOpen={isPdfToWordModalOpen}
        onClose={() => setIsPdfToWordModalOpen(false)}
      />

      {/* Bloqueio de Orientação: Forçar Modo Retrato no Mobile */}
      <div
        className="portrait-lock-overlay fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white select-none"
        aria-live="polite"
      >
        <div className="w-20 h-20 mb-4 rounded-3xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center shadow-lg shadow-blue-500/10">
          <Smartphone className="w-10 h-10 text-blue-400 animate-rotate-phone" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-white mb-2">
          Gire o celular para a vertical
        </h2>
        <p className="text-sm text-slate-300 max-w-xs leading-relaxed mb-4">
          No celular, este aplicativo funciona exclusivamente no <strong>modo retrato</strong>.
        </p>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-semibold text-blue-300">
          <RotateCcw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
          <span>Permanecer no modo retrato</span>
        </div>
      </div>
    </div>
  );
}
