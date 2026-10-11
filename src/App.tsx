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
  Type,
  Sliders,
  RefreshCw,
  Scissors,
  Trash2,
  FileCode,
} from 'lucide-react';
import {
  AppMode,
  Orientation,
  ImageInfo,
  PosterConfig,
  MontagemConfig,
  DividedDrawing,
  CropBox,
  PdfPageItem,
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
  calculatePosterSavings,
  calculateBestPosterGrid,
  findAdjacentPosterGrid,
  findAdjacentMontagemGrid,
  getAllValidMontagemGrids,
  OptimalMontagemGrid,
  isValidGridCount,
  calculateMontagemDimensions,
  reorganizeMontagemForCardSize,
  formatCm,
  formatCardCm,
  parseCm,
  getPageDimensions,
} from './utils/calculations';
import { generatePosterPdf, generateMontagemPdf } from './utils/pdfGenerator';
import { createCroppedImage } from './utils/imageCropper';
import { PosterPreview } from './components/PosterPreview';
import { MontagemPreview } from './components/MontagemPreview';
import { DividirDesenhosPreview } from './components/DividirDesenhosPreview';
import { PdfToWordPreview } from './components/PdfToWordPreview';
import { CropEditor } from './components/CropEditor';
import { CmInput } from './components/CmInput';
import { HoldButton } from './components/HoldButton';
import { PdfToWordModal } from './components/PdfToWordModal';
import { createLettersImageInfo } from './utils/lettersRenderer';
import {
  splitDrawingsFromImage,
  exportDrawingsToWord,
  exportDrawingsToPng,
  SensitivityLevel,
  CropPaddingMode,
} from './utils/drawingSplitter';
import {
  renderAllPdfPagesToThumbnails,
  formatPageIntervals,
  createNewWordDocWithPages,
  appendPagesToExistingWordDoc,
  downloadFile,
} from './utils/pdfToWord';
import { jsPDF } from 'jspdf';

const DEFAULT_LETRAS_FONT = '"Fredoka", "Arial Rounded MT Bold", "Nunito", sans-serif';
const DEFAULT_LETRAS_FONT_NAME = 'Padrão (Arredondada Grossa)';

export default function App() {
  const [mode, setMode] = useState<AppMode>('poster');
  const modeRef = useRef<AppMode>(mode);
  modeRef.current = mode;
  const [originalImageInfo, setOriginalImageInfo] = useState<ImageInfo | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [cropBox, setCropBox] = useState<CropBox>([0, 0, 1, 1]);
  const [isCropMode, setIsCropMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; text: string } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState<{
    fileName: string;
    pages: number;
    title?: string;
    subtitle?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPdfToWordModalOpen, setIsPdfToWordModalOpen] = useState(false);

  // Estados do modo Dividir Desenhos
  const [dividedDrawings, setDividedDrawings] = useState<DividedDrawing[]>([]);
  const [isSplittingDrawings, setIsSplittingDrawings] = useState<boolean>(false);
  const [partesPorFolha, setPartesPorFolha] = useState<number>(1);
  const [splitSensitivity, setSplitSensitivity] = useState<SensitivityLevel>('baixa');
  const splitSensitivityRef = useRef<SensitivityLevel>('baixa');
  splitSensitivityRef.current = splitSensitivity;
  const [cropPaddingMode, setCropPaddingMode] = useState<CropPaddingMode>('justo');
  const cropPaddingModeRef = useRef<CropPaddingMode>('justo');
  cropPaddingModeRef.current = cropPaddingMode;
  const [isExportingWord, setIsExportingWord] = useState<boolean>(false);
  const [isExportingPng, setIsExportingPng] = useState<boolean>(false);

  // Armazena a imagem carregada no pôster se alternar entre modos
  const [savedPosterImageInfo, setSavedPosterImageInfo] = useState<ImageInfo | null>(null);
  const [savedPosterConfig, setSavedPosterConfig] = useState<PosterConfig | null>(null);

  // Estados do modo Montar Letras (Molde)
  const [letrasTexto, setLetrasTexto] = useState<string>('Palavra');
  const [letrasFontFamily, setLetrasFontFamily] = useState<string>('');

  // Estados do modo PDF para Word
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [wordFile, setWordFile] = useState<File | null>(null);
  const [pdfPages, setPdfPages] = useState<PdfPageItem[]>([]);
  const [isProcessingPdf, setIsProcessingPdf] = useState<boolean>(false);
  const [pdfVisualizacaoLinhas, setPdfVisualizacaoLinhas] = useState<number>(1);
  const [isExportingPdfToWord, setIsExportingPdfToWord] = useState<boolean>(false);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);
  const wordFileInputRef = useRef<HTMLInputElement>(null);
  const [letrasFontName, setLetrasFontName] = useState<string>('');
  const [letrasAproveitamentoMaximo, setLetrasAproveitamentoMaximo] = useState<boolean>(false);
  const letrasAproveitamentoMaximoRef = useRef<boolean>(false);
  letrasAproveitamentoMaximoRef.current = letrasAproveitamentoMaximo;
  const [letrasPorPagina, setLetrasPorPagina] = useState<boolean>(false);
  const letrasPorPaginaRef = useRef<boolean>(false);
  letrasPorPaginaRef.current = letrasPorPagina;
  const [letrasFontSizePt, setLetrasFontSizePt] = useState<number>(65);
  const currentFontSizePtRef = useRef<number>(65);
  currentFontSizePtRef.current = letrasFontSizePt;
  const [letrasLetterSpacingMm, setLetrasLetterSpacingMm] = useState<number>(0);
  const letrasLetterSpacingMmRef = useRef<number>(0);
  letrasLetterSpacingMmRef.current = letrasLetterSpacingMm;
  const isRenderingLettersRef = useRef<boolean>(false);
  const pendingLettersArgsRef = useRef<{
    text: string;
    fontFamily: string;
    currentPosterConfig: PosterConfig;
    isAproveitamentoMaximo?: boolean;
    fontSizePt?: number;
    forcedOrientation?: 'vertical' | 'horizontal';
    isLetrasPorPagina?: boolean;
    letterSpacingMm?: number;
  } | null>(null);
  const renderRequestIdRef = useRef<number>(0);
  const [letrasNormalWidthCm, setLetrasNormalWidthCm] = useState<number>(0);
  const [letrasNormalHeightCm, setLetrasNormalHeightCm] = useState<number>(0);
  const [letrasNormalAspect, setLetrasNormalAspect] = useState<number>(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

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
    includeMontage: false,
    economizarFolhas: false,
    aumentarResolucao: false,
    customAspect: 19.6 / 28.3,
  });

  // Montagem configuration state: inicia com 1 cartão e grade 1
  const [montagemConfig, setMontagemConfig] = useState<MontagemConfig>(() => {
    const initialDims = calculateMontagemDimensions({
      orientation: 'vertical',
      fH: 1,
      fV: 1,
      cardWidthCm: 20.2,
      cardHeightCm: 28.9,
      marginCm: MARGEM_FIXA_MONTAGEM,
      spacingCm: ESPACO_PADRAO_MONTAGEM,
      keepRatio: true,
      cardBorder: false,
      manualSize: false,
      quantity: 1,
    });
    return {
      orientation: 'vertical',
      fH: 1,
      fV: 1,
      cardWidthCm: initialDims.cardW,
      cardHeightCm: initialDims.cardH,
      marginCm: MARGEM_FIXA_MONTAGEM,
      spacingCm: ESPACO_PADRAO_MONTAGEM,
      keepRatio: true,
      cardBorder: false,
      manualSize: false,
      quantity: 1,
      customAspect: initialDims.cardW / initialDims.cardH,
    };
  });

  // Track the last edited field for keepRatio calculations
  const lastEditedField = useRef<'width' | 'height'>('width');

  // Input temporário para quantidade de páginas digitadas no modo pôster
  const [posterPagesInput, setPosterPagesInput] = useState<string | null>(null);

  // Página atual na visualização da montagem com múltiplas páginas
  const [montagemCurrentPage, setMontagemCurrentPage] = useState<number>(1);

  const triggerSplitDrawings = useCallback(
    async (
      targetImg: ImageInfo | null,
      sensitivityOverride?: SensitivityLevel,
      paddingModeOverride?: CropPaddingMode
    ) => {
      if (!targetImg?.imgElement) return;
      setIsSplittingDrawings(true);
      setErrorMessage(null);
      try {
        const activeSensitivity = sensitivityOverride ?? splitSensitivityRef.current;
        if (sensitivityOverride) {
          setSplitSensitivity(sensitivityOverride);
        }
        const activePaddingMode = paddingModeOverride ?? cropPaddingModeRef.current;
        if (paddingModeOverride) {
          setCropPaddingMode(paddingModeOverride);
        }
        const results = await splitDrawingsFromImage(targetImg.imgElement, {
          sensitivity: activeSensitivity,
          paddingMode: activePaddingMode,
          padding: activePaddingMode === 'justo' ? 2 : 12,
        });
        setDividedDrawings(results);
      } catch (err) {
        console.error('Erro ao dividir desenhos:', err);
        setErrorMessage('Não foi possível dividir os desenhos automaticamente.');
      } finally {
        setIsSplittingDrawings(false);
      }
    },
    []
  );

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

      // Initialize montagem com 1 cartão e grade 1
      const dims = calculateMontagemDimensions(
        { ...montagemConfig, fH: 1, fV: 1, manualSize: false, customAspect: initialAspect, quantity: 1 },
        widthPx,
        heightPx,
        initialAspect
      );
      setMontagemConfig((prev) => ({
        ...prev,
        fH: 1,
        fV: 1,
        cardWidthCm: dims.cardW,
        cardHeightCm: dims.cardH,
        manualSize: false,
        quantity: 1,
        customAspect: initialAspect,
      }));

      // No modo dividir desenhos: processa e separa os desenhos imediatamente
      if (modeRef.current === 'dividir') {
        triggerSplitDrawings(newInfo);
      }
    };

    img.onerror = () => {
      setErrorMessage('Não foi possível carregar o arquivo de imagem.');
    };

    img.src = objectUrl;
  }, [posterConfig.orientation, posterConfig.marginCm, montagemConfig, triggerSplitDrawings]);

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
      if (mode === 'pdf') {
        if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
          loadPdfFile(file);
        } else if (file.name.toLowerCase().endsWith('.docx')) {
          setWordFile(file);
        } else {
          setErrorMessage('Por favor selecione um arquivo PDF (.pdf) ou Word (.docx).');
        }
      } else if (file.type.startsWith('image/')) {
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
      if (mode === 'dividir') {
        // Imagem de exemplo com 6 desenhos nítidos em fundo branco para dividir
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 1200, 1600);

        // Desenho 1: Estrela Amarela
        ctx.save();
        ctx.translate(300, 300);
        ctx.fillStyle = '#FBBF24';
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 12;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(Math.cos(((18 + i * 72) * Math.PI) / 180) * 140, -Math.sin(((18 + i * 72) * Math.PI) / 180) * 140);
          ctx.lineTo(Math.cos(((54 + i * 72) * Math.PI) / 180) * 65, -Math.sin(((54 + i * 72) * Math.PI) / 180) * 65);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Desenho 2: Coração Rosa
        ctx.save();
        ctx.translate(900, 300);
        ctx.fillStyle = '#F43F5E';
        ctx.strokeStyle = '#BE123C';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(0, 40);
        ctx.bezierCurveTo(-130, -80, -130, -160, 0, -70);
        ctx.bezierCurveTo(130, -70, 130, -160, 0, 40);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Desenho 3: Nuvem Azul
        ctx.save();
        ctx.translate(300, 800);
        ctx.fillStyle = '#38BDF8';
        ctx.strokeStyle = '#0284C7';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(-55, 0, 70, 0, Math.PI * 2);
        ctx.arc(35, -35, 80, 0, Math.PI * 2);
        ctx.arc(85, 20, 60, 0, Math.PI * 2);
        ctx.arc(0, 40, 70, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Desenho 4: Carinha Feliz
        ctx.save();
        ctx.translate(900, 800);
        ctx.fillStyle = '#FDE047';
        ctx.strokeStyle = '#CA8A04';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(0, 0, 110, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#854D0E';
        ctx.beginPath();
        ctx.arc(-40, -30, 14, 0, Math.PI * 2);
        ctx.arc(40, -30, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#854D0E';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(0, 15, 55, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
        ctx.restore();

        // Desenho 5: Trevo Verde
        ctx.save();
        ctx.translate(300, 1300);
        ctx.fillStyle = '#4ADE80';
        ctx.strokeStyle = '#15803D';
        ctx.lineWidth = 12;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          const angle = (i * Math.PI) / 2;
          ctx.arc(Math.cos(angle) * 60, Math.sin(angle) * 60, 52, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Desenho 6: Diamante Roxo
        ctx.save();
        ctx.translate(900, 1300);
        ctx.fillStyle = '#C084FC';
        ctx.strokeStyle = '#7E22CE';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(0, -115);
        ctx.lineTo(105, 0);
        ctx.lineTo(0, 115);
        ctx.lineTo(-105, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Texto de legenda/instrução isolado na folha (testa a filtragem de textos sozinhos)
        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MOLDE EVA • INSTRUÇÃO 2X', 600, 1540);

        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'desenhos_exemplo.png', { type: 'image/png' });
            handleLoadImage(file);
          }
        }, 'image/png');
        return;
      }

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
  // MODO MONTAR LETRAS (MOLDE EM EVA) HELPERS
  // ----------------------------------------------------
  const updateLettersImage = useCallback(
    async (
      text: string,
      fontFamily: string,
      currentPosterConfig: PosterConfig,
      isAproveitamentoMaximo?: boolean,
      fontSizePt?: number,
      forcedOrientation?: 'vertical' | 'horizontal',
      isLetrasPorPagina?: boolean,
      letterSpacingMm?: number
    ) => {
      pendingLettersArgsRef.current = {
        text,
        fontFamily,
        currentPosterConfig,
        isAproveitamentoMaximo,
        fontSizePt,
        forcedOrientation,
        isLetrasPorPagina,
        letterSpacingMm,
      };

      if (isRenderingLettersRef.current) {
        return;
      }

      isRenderingLettersRef.current = true;
      try {
        while (pendingLettersArgsRef.current) {
          const args = pendingLettersArgsRef.current;
          pendingLettersArgsRef.current = null;
          const reqId = ++renderRequestIdRef.current;

          const targetFontSizePt = args.fontSizePt ?? currentFontSizePtRef.current ?? 65;
          const targetLetrasPorPagina = args.isLetrasPorPagina ?? letrasPorPaginaRef.current;
          const targetAproveitamentoMaximo = args.isAproveitamentoMaximo ?? letrasAproveitamentoMaximoRef.current;
          const targetLetterSpacingMm = args.letterSpacingMm ?? letrasLetterSpacingMmRef.current ?? 0;

          if (!args.text.trim() || !args.fontFamily) {
            setImageInfo(null);
            setOriginalImageInfo(null);
            continue;
          }

          try {
            const result = await createLettersImageInfo({
              text: args.text.trim(),
              fontFamily: args.fontFamily,
              isAproveitamentoMaximo: targetAproveitamentoMaximo,
              letrasPorPagina: targetLetrasPorPagina,
              fontSizePt: targetFontSizePt,
              marginCm: args.currentPosterConfig.marginCm,
              forcedOrientation: args.forcedOrientation,
              letterSpacingMm: targetLetterSpacingMm,
            });

            if (reqId !== renderRequestIdRef.current) {
              continue;
            }

            setImageInfo(result.imageInfo);
            setOriginalImageInfo(result.imageInfo);

            setLetrasNormalWidthCm(result.normalWidthCm);
            setLetrasNormalHeightCm(result.normalHeightCm);
            setLetrasNormalAspect(result.normalAspect);

            if (!pendingLettersArgsRef.current) {
              setLetrasFontSizePt(result.fontSizePt);
              currentFontSizePtRef.current = result.fontSizePt;
            }

            setPosterConfig((prev) => ({
              ...prev,
              widthCm: result.gridWidthCm,
              heightCm: result.gridHeightCm,
              fH: result.fH,
              fV: result.fV,
              orientation: result.orientation,
              customAspect: result.aspect,
              keepRatio: true,
              economizarFolhas: false,
              emptySlots: result.emptySlots,
              activeSheetCount: result.activeSheetCount,
              letrasPorPagina: targetLetrasPorPagina,
              seams: result.seams,
            }));
          } catch (err) {
            console.error('Erro ao renderizar molde de letras:', err);
          }
        }
      } finally {
        isRenderingLettersRef.current = false;
      }
    },
    []
  );

  const handleSwitchToLetras = async () => {
    if (mode === 'poster') {
      if (imageInfo && !imageInfo.name.startsWith('Molde EVA')) {
        setSavedPosterImageInfo(imageInfo);
      }
      setSavedPosterConfig(posterConfig);
    }
    setMode('letras');
    setIsCropMode(false);
    if (letrasTexto.trim() && letrasFontFamily) {
      await updateLettersImage(
        letrasTexto,
        letrasFontFamily,
        posterConfig,
        letrasAproveitamentoMaximo,
        letrasFontSizePt,
        undefined,
        letrasPorPagina,
        letrasLetterSpacingMm
      );
    } else {
      setImageInfo(null);
      setOriginalImageInfo(null);
    }
  };

  const handleUseLetrasModelo = async (modeloText = 'Parabéns') => {
    setLetrasTexto(modeloText);
    await updateLettersImage(
      modeloText,
      letrasFontFamily,
      posterConfig,
      letrasAproveitamentoMaximo,
      letrasFontSizePt,
      undefined,
      letrasPorPagina,
      letrasLetterSpacingMm
    );
  };

  const handleSwitchToPdf = () => {
    if (mode === 'poster') {
      if (imageInfo && !imageInfo.name.startsWith('Molde EVA')) {
        setSavedPosterImageInfo(imageInfo);
      }
      setSavedPosterConfig(posterConfig);
    }
    setMode('pdf');
    setIsCropMode(false);
  };

  const handleSwitchToPoster = () => {
    setMode('poster');
    setIsCropMode(false);
    if (savedPosterImageInfo) {
      setImageInfo(savedPosterImageInfo);
      setOriginalImageInfo(savedPosterImageInfo);
      if (savedPosterConfig) {
        setPosterConfig(savedPosterConfig);
      } else {
        const initialPoster = calculateInitialPoster(
          savedPosterImageInfo.widthPx,
          savedPosterImageInfo.heightPx,
          'vertical',
          MARGEM_PADRAO_POSTER
        );
        setPosterConfig({
          orientation: 'vertical',
          widthCm: initialPoster.widthCm,
          heightCm: initialPoster.heightCm,
          fH: initialPoster.fH,
          fV: initialPoster.fV,
          marginCm: MARGEM_PADRAO_POSTER,
          keepRatio: true,
          cutMarks: true,
          cornerMarks: true,
          includeMontage: false,
          economizarFolhas: false,
          aumentarResolucao: false,
          customAspect: savedPosterImageInfo.widthPx / savedPosterImageInfo.heightPx,
        });
      }
    } else if (imageInfo?.name.startsWith('Molde EVA')) {
      setImageInfo(null);
      setOriginalImageInfo(null);
      if (savedPosterConfig) {
        setPosterConfig(savedPosterConfig);
      }
    }
  };

  const handleSwitchToMontagem = () => {
    if (mode === 'poster') {
      if (imageInfo && !imageInfo.name.startsWith('Molde EVA')) {
        setSavedPosterImageInfo(imageInfo);
      }
      setSavedPosterConfig(posterConfig);
    }
    setMode('montagem');
    setIsCropMode(false);
    if (imageInfo?.name.startsWith('Molde EVA')) {
      if (savedPosterImageInfo) {
        setImageInfo(savedPosterImageInfo);
        setOriginalImageInfo(savedPosterImageInfo);
      } else {
        setImageInfo(null);
        setOriginalImageInfo(null);
      }
    }
  };

  const handleToggleDividedDrawing = useCallback((id: number) => {
    setDividedDrawings((prev) =>
      prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d))
    );
  }, []);

  const handleSelectAllDivididos = useCallback(() => {
    setDividedDrawings((prev) => prev.map((d) => ({ ...d, selected: true })));
  }, []);

  const handleDeselectAllDivididos = useCallback(() => {
    setDividedDrawings((prev) => prev.map((d) => ({ ...d, selected: false })));
  }, []);

  const handleSwitchToDividir = () => {
    if (mode === 'poster') {
      if (imageInfo && !imageInfo.name.startsWith('Molde EVA')) {
        setSavedPosterImageInfo(imageInfo);
      }
      setSavedPosterConfig(posterConfig);
    }
    setMode('dividir');
    setIsCropMode(false);
    const targetInfo =
      originalImageInfo && !originalImageInfo.name.startsWith('Molde EVA')
        ? originalImageInfo
        : imageInfo && !imageInfo.name.startsWith('Molde EVA')
        ? imageInfo
        : null;
    if (targetInfo) {
      triggerSplitDrawings(targetInfo);
    }
  };

  const handleExportWord = async () => {
    const activeDrawings = dividedDrawings.filter((d) => d.selected !== false);
    if (activeDrawings.length === 0) {
      setErrorMessage('Selecione pelo menos um desenho para salvar no Word.');
      return;
    }
    setIsExportingWord(true);
    setErrorMessage(null);
    try {
      const baseName = (imageInfo?.name || 'desenhos').replace(/\.[^/.]+$/, '');
      const fileName = `${baseName}_divididos.docx`;
      await exportDrawingsToWord(
        activeDrawings,
        fileName,
        partesPorFolha,
        'vertical',
        imageInfo?.widthPx,
        imageInfo?.heightPx
      );
      const totalPages = Math.ceil(activeDrawings.length / Math.max(1, partesPorFolha));
      setShowSuccessModal({
        fileName,
        pages: totalPages,
        title: 'Word Gerado com Sucesso!',
        subtitle: `${activeDrawings.length} ${
          activeDrawings.length === 1 ? 'desenho adicionado' : 'desenhos adicionados'
        } em documento Word pronto para impressão ou edição.`,
      });
    } catch (err) {
      console.error('Erro ao exportar Word:', err);
      setErrorMessage('Erro ao gerar documento Word.');
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleExportPng = async () => {
    const activeDrawings = dividedDrawings.filter((d) => d.selected !== false);
    if (activeDrawings.length === 0) {
      setErrorMessage('Selecione pelo menos um desenho para salvar em PNG.');
      return;
    }
    setIsExportingPng(true);
    setErrorMessage(null);
    try {
      const baseName = (imageInfo?.name || 'desenhos').replace(/\.[^/.]+$/, '');
      await exportDrawingsToPng(activeDrawings, `${baseName}_divididos`);
      const fileName =
        activeDrawings.length === 1
          ? `${baseName}_divididos_01.png`
          : `${baseName}_divididos.zip`;
      setShowSuccessModal({
        fileName,
        pages: activeDrawings.length,
        title: activeDrawings.length === 1 ? 'Imagem PNG Salva!' : 'Arquivo ZIP Gerado!',
        subtitle: `${activeDrawings.length} ${
          activeDrawings.length === 1 ? 'desenho salvo em formato PNG' : 'desenhos compactados em arquivo ZIP em alta resolução'
        }.`,
      });
    } catch (err) {
      console.error('Erro ao exportar PNG:', err);
      setErrorMessage('Erro ao exportar imagens em PNG.');
    } finally {
      setIsExportingPng(false);
    }
  };

  const handlePdfFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadPdfFile(file);
    e.target.value = '';
  };

  const loadPdfFile = async (file: File) => {
    try {
      setIsProcessingPdf(true);
      setErrorMessage(null);
      setPdfFile(file);
      const items = await renderAllPdfPagesToThumbnails(file);
      setPdfPages(items);
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao processar o arquivo PDF.');
      setPdfFile(null);
      setPdfPages([]);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleWordFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWordFile(file);
    e.target.value = '';
  };

  const handleDeletePdfFile = () => {
    setPdfFile(null);
    setPdfPages([]);
  };

  const handleDeleteWordFile = () => {
    setWordFile(null);
  };

  const handleUsePdfModelo = async () => {
    setIsProcessingPdf(true);
    setErrorMessage(null);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const colors: [number, number, number][] = [
        [37, 99, 235],
        [5, 150, 105],
        [217, 119, 6],
        [220, 38, 38],
        [124, 58, 237],
      ];
      const pageTitles = [
        'Página 1: Introdução e Apresentação',
        'Página 2: Relatório de Atividades',
        'Página 3: Gráficos e Indicadores',
        'Página 4: Considerações Finais',
        'Página 5: Anexos e Documentação',
      ];

      for (let i = 0; i < 5; i++) {
        if (i > 0) doc.addPage('a4', 'portrait');

        // Faixa superior
        doc.setFillColor(colors[i][0], colors[i][1], colors[i][2]);
        doc.rect(15, 15, 180, 22, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text(pageTitles[i], 20, 29);

        // Texto do corpo
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(11);
        doc.text(`Documento de Modelo - Página ${i + 1} de 5`, 20, 52);
        doc.text('Este arquivo PDF de modelo serve para testar a inserção', 20, 62);
        doc.text('e organização de páginas antes da conversão para Word.', 20, 70);

        // Caixa de demonstração
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(20, 85, 170, 140, 3, 3, 'FD');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(12);
        doc.text(`Conteúdo da Página ${i + 1}`, 70, 155);

        // Rodapé
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(`Página ${i + 1} de 5`, 95, 280);
      }

      const pdfBlob = doc.output('blob');
      const sampleFile = new File([pdfBlob], 'modelo_exemplo_5paginas.pdf', {
        type: 'application/pdf',
      });
      await loadPdfFile(sampleFile);
    } catch (err: unknown) {
      console.error('Erro ao gerar modelo de PDF:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao gerar modelo de PDF.');
      setIsProcessingPdf(false);
    }
  };

  const handleTogglePdfPage = useCallback((pageNum: number) => {
    setPdfPages((prev) =>
      prev.map((p) => (p.pageNumber === pageNum ? { ...p, selected: !p.selected } : p))
    );
  }, []);

  const handleSelectAllPdfPages = useCallback(() => {
    setPdfPages((prev) => prev.map((p) => ({ ...p, selected: true })));
  }, []);

  const handleDeselectAllPdfPages = useCallback(() => {
    setPdfPages((prev) => prev.map((p) => ({ ...p, selected: false })));
  }, []);

  const handleExportPdfToWord = async () => {
    const selectedPages = pdfPages.filter((p) => p.selected !== false);
    if (selectedPages.length === 0) {
      setErrorMessage('Selecione pelo menos uma página do PDF para salvar no Word.');
      return;
    }
    setIsExportingPdfToWord(true);
    setErrorMessage(null);
    try {
      if (wordFile) {
        // Salvar no arquivo atual
        const resultBlob = await appendPagesToExistingWordDoc(wordFile, selectedPages);
        const outName = wordFile.name.replace(/\.docx$/i, '') + '_com_paginas.docx';
        downloadFile(resultBlob, outName);
        setShowSuccessModal({
          fileName: outName,
          pages: selectedPages.length,
          title: 'Word Atualizado com Sucesso!',
          subtitle: `Foram adicionadas ${selectedPages.length} ${
            selectedPages.length === 1 ? 'página' : 'páginas'
          } do PDF no arquivo ${wordFile.name}.`,
        });
      } else if (pdfFile) {
        // Salvar em novo arquivo
        const resultBlob = await createNewWordDocWithPages(selectedPages);
        const outName = pdfFile.name.replace(/\.pdf$/i, '') + '_word.docx';
        downloadFile(resultBlob, outName);
        setShowSuccessModal({
          fileName: outName,
          pages: selectedPages.length,
          title: 'Documento Word Criado!',
          subtitle: `Novo arquivo Word gerado com ${selectedPages.length} ${
            selectedPages.length === 1 ? 'página' : 'páginas'
          } do PDF.`,
        });
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao exportar documento Word.');
    } finally {
      setIsExportingPdfToWord(false);
    }
  };

  const handleFontSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const fontId = `CustomEVAFont_${Date.now()}`;
      const fontFace = new FontFace(fontId, buffer, {
        weight: '100 900',
        style: 'normal',
      });
      await fontFace.load();
      document.fonts.add(fontFace);
      await document.fonts.ready;
      setLetrasFontFamily(fontId);
      setLetrasFontName(file.name);
      await updateLettersImage(
        letrasTexto,
        fontId,
        posterConfig,
        letrasAproveitamentoMaximo,
        letrasFontSizePt,
        undefined,
        letrasPorPagina,
        letrasLetterSpacingMm
      );
    } catch (err) {
      console.error('Erro ao carregar fonte:', err);
      setErrorMessage(
        'Não foi possível carregar a fonte selecionada. Certifique-se de escolher um arquivo .ttf ou .otf válido.'
      );
    } finally {
      if (fontInputRef.current) fontInputRef.current.value = '';
    }
  };

  const handleUseDefaultFont = async () => {
    setLetrasFontFamily(DEFAULT_LETRAS_FONT);
    setLetrasFontName(DEFAULT_LETRAS_FONT_NAME);
    await updateLettersImage(
      letrasTexto,
      DEFAULT_LETRAS_FONT,
      posterConfig,
      letrasAproveitamentoMaximo,
      letrasFontSizePt,
      undefined,
      letrasPorPagina,
      letrasLetterSpacingMm
    );
  };

  const handleLetrasTextoChange = async (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string
  ) => {
    const newText = typeof e === 'string' ? e : e.target.value;
    setLetrasTexto(newText);
    await updateLettersImage(
      newText,
      letrasFontFamily,
      posterConfig,
      letrasAproveitamentoMaximo,
      letrasFontSizePt,
      undefined,
      letrasPorPagina,
      letrasLetterSpacingMm
    );
  };

  const handleToggleLetrasAproveitamento = async (checked: boolean) => {
    letrasAproveitamentoMaximoRef.current = checked;
    setLetrasAproveitamentoMaximo(checked);
    await updateLettersImage(
      letrasTexto,
      letrasFontFamily,
      posterConfig,
      checked,
      letrasFontSizePt,
      undefined,
      letrasPorPagina,
      letrasLetterSpacingMm
    );
  };

  const handleToggleLetrasPorPagina = async (checked: boolean) => {
    letrasPorPaginaRef.current = checked;
    setLetrasPorPagina(checked);
    await updateLettersImage(
      letrasTexto,
      letrasFontFamily,
      posterConfig,
      letrasAproveitamentoMaximo,
      letrasFontSizePt,
      undefined,
      checked,
      letrasLetterSpacingMm
    );
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

    // 1. Já ajustar a grade do pôster para a nova proporção da imagem recortada
    const currentPosterSheets = Math.max(1, posterSheetsData.nonEmptySheets);
    const bestPosterGrid = calculateBestPosterGrid(
      currentPosterSheets,
      cropped.widthPx,
      cropped.heightPx,
      posterConfig.orientation,
      posterConfig.marginCm,
      true,
      croppedAspect
    );

    setPosterConfig((prev) => ({
      ...prev,
      widthCm: bestPosterGrid.widthCm,
      heightCm: bestPosterGrid.heightCm,
      fH: bestPosterGrid.fH,
      fV: bestPosterGrid.fV,
      orientation: bestPosterGrid.orientation,
      customAspect: croppedAspect,
    }));

    // 2. Já ajustar a grade da montagem para a nova proporção da imagem recortada
    const currentMontagemCap = montagemDims.totalCards;
    const validGrids = getAllValidMontagemGrids(
      cropped.widthPx,
      cropped.heightPx,
      { ...montagemConfig, customAspect: croppedAspect },
      croppedAspect
    );

    let bestMontagemGrid = validGrids.find((g) => g.capacity === currentMontagemCap);
    if (!bestMontagemGrid && validGrids.length > 0) {
      bestMontagemGrid = validGrids.reduce((prev, curr) =>
        Math.abs(curr.capacity - currentMontagemCap) < Math.abs(prev.capacity - currentMontagemCap) ? curr : prev
      );
    }

    if (bestMontagemGrid) {
      setMontagemConfig((prev) => ({
        ...prev,
        fH: bestMontagemGrid.fH,
        fV: bestMontagemGrid.fV,
        orientation: 'vertical',
        cardRotated: Boolean(bestMontagemGrid.cardRotated),
        cardWidthCm: bestMontagemGrid.cardW,
        cardHeightCm: bestMontagemGrid.cardH,
        mixedSlots: bestMontagemGrid.isMixed ? bestMontagemGrid.slots : undefined,
        manualSize: false,
        quantity: prev.quantity ?? 4,
        customAspect: croppedAspect,
      }));
    }
  };

  const handleResetCrop = async () => {
    if (!originalImageInfo) return;
    const fullBox: CropBox = [0, 0, 1, 1];
    setCropBox(fullBox);
    setImageInfo(originalImageInfo);
    setIsCropMode(false);

    const resetAspect = originalImageInfo.widthPx / originalImageInfo.heightPx;

    // 1. Já ajustar a grade do pôster para a proporção original
    const currentPosterSheets = Math.max(1, posterSheetsData.nonEmptySheets);
    const bestPosterGrid = calculateBestPosterGrid(
      currentPosterSheets,
      originalImageInfo.widthPx,
      originalImageInfo.heightPx,
      posterConfig.orientation,
      posterConfig.marginCm,
      true,
      resetAspect
    );

    setPosterConfig((prev) => ({
      ...prev,
      widthCm: bestPosterGrid.widthCm,
      heightCm: bestPosterGrid.heightCm,
      fH: bestPosterGrid.fH,
      fV: bestPosterGrid.fV,
      orientation: bestPosterGrid.orientation,
      customAspect: resetAspect,
    }));

    // 2. Já ajustar a grade da montagem para a proporção original
    const currentMontagemCap = montagemDims.totalCards;
    const validGrids = getAllValidMontagemGrids(
      originalImageInfo.widthPx,
      originalImageInfo.heightPx,
      { ...montagemConfig, customAspect: resetAspect },
      resetAspect
    );

    let bestMontagemGrid = validGrids.find((g) => g.capacity === currentMontagemCap);
    if (!bestMontagemGrid && validGrids.length > 0) {
      bestMontagemGrid = validGrids.reduce((prev, curr) =>
        Math.abs(curr.capacity - currentMontagemCap) < Math.abs(prev.capacity - currentMontagemCap) ? curr : prev
      );
    }

    if (bestMontagemGrid) {
      setMontagemConfig((prev) => ({
        ...prev,
        fH: bestMontagemGrid.fH,
        fV: bestMontagemGrid.fV,
        orientation: 'vertical',
        cardRotated: Boolean(bestMontagemGrid.cardRotated),
        cardWidthCm: bestMontagemGrid.cardW,
        cardHeightCm: bestMontagemGrid.cardH,
        mixedSlots: bestMontagemGrid.isMixed ? bestMontagemGrid.slots : undefined,
        manualSize: false,
        quantity: prev.quantity ?? 4,
        customAspect: resetAspect,
      }));
    }
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

    if (mode === 'letras') {
      const val = typeof valInput === 'number' ? valInput : parseCm(valInput, 0);
      if (val <= 0) return;
      const currentW = letrasNormalWidthCm || posterConfig.widthCm || 1;
      const ratio = val / currentW;
      const newFontSizePt = Math.max(10, Math.min(1200, Math.round(letrasFontSizePt * ratio)));
      setLetrasFontSizePt(newFontSizePt);
      updateLettersImage(
        letrasTexto,
        letrasFontFamily,
        posterConfig,
        letrasAproveitamentoMaximo,
        newFontSizePt,
        undefined,
        letrasPorPagina,
        letrasLetterSpacingMm
      );
      return;
    }

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
        newHeight = newWidth / aspect;
        if (newHeight > LIMITE_MAX_POSTER_CM) {
          newHeight = LIMITE_MAX_POSTER_CM;
          newWidth = newHeight * aspect;
        }
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

      const reorganized = reorganizeMontagemForCardSize(
        finalCardWCm,
        finalCardHCm,
        Boolean(montagemConfig.mixedLayout),
        montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM
      );

      setMontagemConfig((prev) => ({
        ...prev,
        cardWidthCm: finalCardWCm,
        cardHeightCm: finalCardHCm,
        fH: reorganized.fH,
        fV: reorganized.fV,
        mixedSlots: reorganized.mixedSlots,
        cardRotated: reorganized.cardRotated,
        manualSize: true,
        customAspect: newAspect,
        quantity: prev.quantity ?? 4,
      }));
    }
  };

  const handleHeightChange = (valInput: number | string) => {
    lastEditedField.current = 'height';

    if (mode === 'letras') {
      const val = typeof valInput === 'number' ? valInput : parseCm(valInput, 0);
      if (val <= 0) return;
      const currentH = letrasNormalHeightCm || posterConfig.heightCm || 1;
      const ratio = val / currentH;
      const newFontSizePt = Math.max(10, Math.min(1200, Math.round(letrasFontSizePt * ratio)));
      setLetrasFontSizePt(newFontSizePt);
      updateLettersImage(
        letrasTexto,
        letrasFontFamily,
        posterConfig,
        letrasAproveitamentoMaximo,
        newFontSizePt,
        undefined,
        letrasPorPagina,
        letrasLetterSpacingMm
      );
      return;
    }

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
        newWidth = newHeight * aspect;
        if (newWidth > LIMITE_MAX_POSTER_CM) {
          newWidth = LIMITE_MAX_POSTER_CM;
          newHeight = newWidth / aspect;
        }
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

      const finalCardWCm = Math.round((newCardWMm / 10) * 100) / 100;
      const finalCardHCm = Math.round((newCardHMm / 10) * 100) / 100;
      const newAspect = finalCardWCm / finalCardHCm;

      const reorganized = reorganizeMontagemForCardSize(
        finalCardWCm,
        finalCardHCm,
        Boolean(montagemConfig.mixedLayout),
        montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM
      );

      setMontagemConfig((prev) => ({
        ...prev,
        cardWidthCm: finalCardWCm,
        cardHeightCm: finalCardHCm,
        fH: reorganized.fH,
        fV: reorganized.fV,
        mixedSlots: reorganized.mixedSlots,
        cardRotated: reorganized.cardRotated,
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

  const handleAdjustFontSize = (direction: 1 | -1) => {
    const current = currentFontSizePtRef.current;
    if (direction > 0 && current >= 1200) return;
    if (direction < 0 && current <= 10) return;

    // Incrementa de 5 em 5 para fontes menores que 50pt, e de 10 em 10 acima
    const step = current < 50 || (current === 50 && direction < 0) ? 5 : 10;
    const next = Math.max(10, Math.min(1200, Math.round(current + direction * step)));

    if (next === current) return;
    currentFontSizePtRef.current = next;
    setLetrasFontSizePt(next);

    updateLettersImage(
      letrasTexto,
      letrasFontFamily,
      posterConfig,
      letrasAproveitamentoMaximo,
      next,
      undefined,
      letrasPorPagina,
      letrasLetterSpacingMm
    );
  };

  const handleFontSizeInputChange = (valInput: number | string) => {
    const val = typeof valInput === 'number' ? valInput : parseInt(String(valInput).replace(/[^\d]/g, ''), 10);
    if (!val || isNaN(val) || val <= 0) return;
    const next = Math.max(10, Math.min(1200, Math.round(val)));
    currentFontSizePtRef.current = next;
    setLetrasFontSizePt(next);

    updateLettersImage(
      letrasTexto,
      letrasFontFamily,
      posterConfig,
      letrasAproveitamentoMaximo,
      next,
      undefined,
      letrasPorPagina,
      letrasLetterSpacingMm
    );
  };

  const handleAdjustLetterSpacing = (delta: number) => {
    const next = Math.max(-20, Math.min(100, letrasLetterSpacingMm + delta));
    if (next === letrasLetterSpacingMm) return;
    letrasLetterSpacingMmRef.current = next;
    setLetrasLetterSpacingMm(next);

    updateLettersImage(
      letrasTexto,
      letrasFontFamily,
      posterConfig,
      letrasAproveitamentoMaximo,
      letrasFontSizePt,
      undefined,
      letrasPorPagina,
      next
    );
  };

  const handleLetterSpacingInputChange = (valInput: number | string) => {
    let next: number;
    if (typeof valInput === 'number') {
      next = valInput;
    } else {
      const cleaned = valInput.trim().toLowerCase();
      if (cleaned === 'normal' || cleaned === '') {
        next = 0;
      } else {
        const parsed = parseInt(cleaned.replace(/[^\d-]/g, ''), 10);
        next = isNaN(parsed) ? 0 : parsed;
      }
    }
    next = Math.max(-20, Math.min(100, next));
    letrasLetterSpacingMmRef.current = next;
    setLetrasLetterSpacingMm(next);

    updateLettersImage(
      letrasTexto,
      letrasFontFamily,
      posterConfig,
      letrasAproveitamentoMaximo,
      letrasFontSizePt,
      undefined,
      letrasPorPagina,
      next
    );
  };

  const handleResetLetterSpacing = () => {
    letrasLetterSpacingMmRef.current = 0;
    setLetrasLetterSpacingMm(0);

    updateLettersImage(
      letrasTexto,
      letrasFontFamily,
      posterConfig,
      letrasAproveitamentoMaximo,
      letrasFontSizePt,
      undefined,
      letrasPorPagina,
      0
    );
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
          keepRatio: true,
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
        const capacity = montagemDims.totalCards;
        const targetPage = Math.ceil(next / capacity);
        if (delta > 0 && targetPage > montagemCurrentPage) {
          setMontagemCurrentPage(targetPage);
        }
      }
    }
  };

  const montagemDims = useMemo(() => {
    const effectiveAspect = montagemConfig.customAspect ?? (imageInfo ? imageInfo.widthPx / imageInfo.heightPx : undefined);
    return calculateMontagemDimensions(montagemConfig, imageInfo?.widthPx, imageInfo?.heightPx, effectiveAspect);
  }, [imageInfo, montagemConfig]);

  // Lista de grades válidas para a montagem (otimizada, memoizada e com cache interno)
  const currentMontagemGrids = useMemo(() => {
    if (mode !== 'montagem' || !imageInfo) return [];
    const effectiveAspect = montagemConfig.customAspect ?? (imageInfo.widthPx / imageInfo.heightPx);
    return getAllValidMontagemGrids(imageInfo.widthPx, imageInfo.heightPx, montagemConfig, effectiveAspect);
  }, [
    mode,
    imageInfo?.widthPx,
    imageInfo?.heightPx,
    montagemConfig.mixedLayout,
    montagemConfig.customAspect,
    montagemConfig.spacingCm,
    montagemConfig.cardSpacing,
  ]);

  const currentMontagemGridIndex = useMemo(() => {
    if (currentMontagemGrids.length === 0) return -1;
    // Quando em modo misto e com slots definidos sem tamanho manual, a capacidade é a quantidade exata de slots da grade
    const targetCap = montagemConfig.mixedLayout && montagemConfig.mixedSlots && montagemConfig.mixedSlots.length > 0 && !montagemConfig.manualSize
      ? montagemConfig.mixedSlots.length
      : montagemDims.totalCards;

    const idx = currentMontagemGrids.findIndex((g) => g.capacity === targetCap);
    if (idx !== -1) return idx;
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < currentMontagemGrids.length; i++) {
      const diff = Math.abs(currentMontagemGrids[i].capacity - targetCap);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [currentMontagemGrids, montagemDims.totalCards, montagemConfig.mixedLayout, montagemConfig.mixedSlots, montagemConfig.manualSize]);

  const canMontagemGridPrev = currentMontagemGrids.length > 0 && currentMontagemGridIndex > 0;
  const canMontagemGridNext = currentMontagemGrids.length > 0 && currentMontagemGridIndex < currentMontagemGrids.length - 1;

  const handleAdjustMontagemGrid = (delta: number) => {
    if (!imageInfo || currentMontagemGrids.length === 0) return;
    const targetIdx = currentMontagemGridIndex + delta;
    if (targetIdx < 0 || targetIdx >= currentMontagemGrids.length) return;
    const nextGrid = currentMontagemGrids[targetIdx];

    const nextCap = nextGrid.capacity;
    const nextTotalPages = Math.max(1, Math.ceil((montagemConfig.quantity ?? 4) / nextCap));
    if (delta < 0 && nextTotalPages > 1) {
      setMontagemCurrentPage(nextTotalPages);
    }
    setMontagemConfig((prev) => ({
      ...prev,
      fH: nextGrid.fH,
      fV: nextGrid.fV,
      orientation: 'vertical',
      cardRotated: Boolean(nextGrid.cardRotated),
      cardWidthCm: nextGrid.cardW,
      cardHeightCm: nextGrid.cardH,
      mixedSlots: nextGrid.isMixed ? nextGrid.slots : undefined,
      manualSize: false,
      quantity: prev.quantity ?? 4,
    }));
  };

  const handleToggleMixedLayout = (enabled: boolean) => {
    if (!imageInfo) {
      setMontagemConfig((prev) => ({ ...prev, mixedLayout: enabled }));
      return;
    }
    const effectiveAspect = montagemConfig.customAspect ?? (imageInfo.widthPx / imageInfo.heightPx);
    const updatedConfig: MontagemConfig = {
      ...montagemConfig,
      mixedLayout: enabled,
    };
    const targetGrids = getAllValidMontagemGrids(imageInfo.widthPx, imageInfo.heightPx, updatedConfig, effectiveAspect);
    if (targetGrids.length === 0) return;

    const currentCap = montagemDims.totalCards;

    let chosen: OptimalMontagemGrid | undefined;
    if (enabled) {
      // 1. Tenta grade mista com a mesma capacidade
      chosen = targetGrids.find((g) => g.isMixed && g.capacity === currentCap);
      // 2. Ou grade mista com capacidade mais próxima
      if (!chosen) {
        const mixedGrids = targetGrids.filter((g) => g.isMixed);
        if (mixedGrids.length > 0) {
          chosen = mixedGrids.reduce((best, curr) =>
            Math.abs(curr.capacity - currentCap) < Math.abs(best.capacity - currentCap) ? curr : best
          , mixedGrids[0]);
        }
      }
    } else {
      // Ao desativar, busca a grade uniforme com a mesma capacidade ou a mais próxima
      chosen = targetGrids.find((g) => !g.isMixed && g.capacity === currentCap);
      if (!chosen) {
        const uniformGrids = targetGrids.filter((g) => !g.isMixed);
        if (uniformGrids.length > 0) {
          chosen = uniformGrids.reduce((best, curr) =>
            Math.abs(curr.capacity - currentCap) < Math.abs(best.capacity - currentCap) ? curr : best
          , uniformGrids[0]);
        }
      }
    }

    if (!chosen) {
      chosen = targetGrids[0];
    }

    if (chosen) {
      setMontagemConfig((prev) => ({
        ...prev,
        mixedLayout: enabled,
        fH: chosen!.fH,
        fV: chosen!.fV,
        orientation: 'vertical',
        cardRotated: Boolean(chosen!.cardRotated),
        cardWidthCm: chosen!.cardW,
        cardHeightCm: chosen!.cardH,
        mixedSlots: chosen!.isMixed ? chosen!.slots : undefined,
        manualSize: false,
      }));
    }
  };



  // Toggle Keep Ratio
  // Ao ativar manter proporção, volta para a proporção original da imagem.
  const handleToggleKeepRatio = () => {
    if (mode === 'poster' || mode === 'letras') {
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
            if (newW > LIMITE_MAX_POSTER_CM) {
              newW = LIMITE_MAX_POSTER_CM;
              newH = Math.min(LIMITE_MAX_POSTER_CM, Math.round((newW / originalAspect) * 10) / 10);
            }
          } else {
            newH = Math.min(LIMITE_MAX_POSTER_CM, Math.round((newW / originalAspect) * 10) / 10);
            if (newH > LIMITE_MAX_POSTER_CM) {
              newH = LIMITE_MAX_POSTER_CM;
              newW = Math.min(LIMITE_MAX_POSTER_CM, Math.round(newH * originalAspect * 10) / 10);
            }
          }

          const page = getPageDimensions(prev.orientation);
          const usableW = Math.max(0.1, page.width - prev.marginCm * 2);
          const usableH = Math.max(0.1, page.height - prev.marginCm * 2);

          const fV = Math.max(1, Math.ceil(newH / usableH));

          return {
            ...prev,
            keepRatio: true,
            widthCm: newW,
            heightCm: newH,
            fH: Math.max(1, Math.ceil(newW / usableW)),
            fV,
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

    if (mode === 'letras') {
      const clamped = Math.max(MARGEM_MINIMA_POSTER, Math.min(val, MARGEM_MAXIMA_POSTER));
      const nextConfig = { ...posterConfig, marginCm: clamped };
      setPosterConfig(nextConfig);
      updateLettersImage(
        letrasTexto,
        letrasFontFamily,
        nextConfig,
        letrasAproveitamentoMaximo,
        letrasFontSizePt,
        undefined,
        letrasPorPagina,
        letrasLetterSpacingMm
      );
      return;
    }

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
    const effectiveAspect = montagemConfig.customAspect ?? (imageInfo ? imageInfo.widthPx / imageInfo.heightPx : undefined);

    setMontagemConfig((prev) => {
      let updated: MontagemConfig = { ...prev, spacingCm: clamped };
      if (prev.mixedLayout) {
        if (prev.manualSize && prev.cardWidthCm > 0 && prev.cardHeightCm > 0) {
          const reorg = reorganizeMontagemForCardSize(
            prev.cardWidthCm,
            prev.cardHeightCm,
            true,
            clamped
          );
          updated = {
            ...updated,
            fH: reorg.fH,
            fV: reorg.fV,
            cardRotated: reorg.cardRotated,
            mixedSlots: reorg.mixedSlots,
          };
        } else {
          const targetCap = prev.mixedSlots && prev.mixedSlots.length > 0
            ? prev.mixedSlots.length
            : (prev.fH * prev.fV);
          const validGrids = getAllValidMontagemGrids(
            imageInfo?.widthPx ?? 0,
            imageInfo?.heightPx ?? 0,
            { ...updated, mixedSlots: undefined },
            effectiveAspect
          );
          const matchingMixed = validGrids.find((g) => g.isMixed && g.capacity === targetCap);
          const matchingGrid = matchingMixed || validGrids.find((g) => g.capacity === targetCap) || validGrids[0];
          if (matchingGrid) {
            updated = {
              ...updated,
              fH: matchingGrid.fH,
              fV: matchingGrid.fV,
              cardRotated: matchingGrid.cardRotated,
              mixedSlots: matchingGrid.slots,
              cardWidthCm: matchingGrid.cardW,
              cardHeightCm: matchingGrid.cardH,
            };
          }
        }
      }
      const dims = calculateMontagemDimensions(updated, imageInfo?.widthPx, imageInfo?.heightPx, effectiveAspect);
      return {
        ...updated,
        mixedSlots: updated.mixedLayout ? dims.slots : updated.mixedSlots,
        cardWidthCm: dims.cardW,
        cardHeightCm: dims.cardH,
      };
    });
  };

  const handleAdjustMargin = (delta: number) => {
    if (mode === 'poster' || mode === 'letras') {
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

  // Alternar Aumentar Resolução no Modo Pôster (aplicado apenas na geração do PDF para manter a visualização fluida)
  const handleToggleAumentarResolucao = (enabled: boolean) => {
    setPosterConfig((prev) => ({ ...prev, aumentarResolucao: enabled }));
    // Garante que a visualização permaneça sempre com a imagem original leve
    if (originalImageInfo && imageInfo !== originalImageInfo && !isCropMode) {
      const isCropped =
        cropBox[0] > 0.015 || cropBox[1] > 0.015 || cropBox[2] < 0.985 || cropBox[3] < 0.985;
      if (!isCropped) {
        setImageInfo(originalImageInfo);
      }
    }
  };

  // ----------------------------------------------------
  // SAVE / EXPORT PDF HANDLER
  // ----------------------------------------------------
  const handleExportPdf = async () => {
    if (!imageInfo) {
      setErrorMessage(
        mode === 'letras'
          ? 'Digite o texto a ser montado antes de exportar o PDF.'
          : 'Selecione uma imagem primeiro para exportar o PDF.'
      );
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);

    try {
      if (mode === 'poster' || mode === 'letras') {
        await generatePosterPdf(imageInfo, posterConfig, (percent, text) => {
          setExportProgress({ percent, text });
        });
        const { nonEmptySheets } = calculatePosterSheets(
          posterConfig,
          imageInfo.widthPx,
          imageInfo.heightPx
        );
        const isPosterSavingsActive = Boolean(
          posterConfig.economizarFolhas && posterSavingsData?.canEconomize
        );
        const totalPosterPages =
          (isPosterSavingsActive ? posterSavingsData!.optimizedNonEmptySheets : nonEmptySheets) +
          (posterConfig.includeMontage ? 1 : 0);
        setShowSuccessModal({
          fileName:
            mode === 'letras'
              ? `molde_${letrasTexto.trim().slice(0, 15).replace(/\s+/g, '_')}_eva.pdf`
              : `${imageInfo.name.replace(/\.[^/.]+$/, '')}_poster.pdf`,
          pages: totalPosterPages,
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

  const posterSavingsData = useMemo(() => {
    if (!imageInfo || mode !== 'poster') return null;
    return calculatePosterSavings(posterConfig, imageInfo.widthPx, imageInfo.heightPx);
  }, [imageInfo, mode, posterConfig]);

  // Current values for input display
  const currentWidthValue =
    mode === 'letras'
      ? (letrasNormalWidthCm || posterConfig.widthCm)
      : mode === 'poster'
      ? posterConfig.widthCm
      : montagemDims.cardW;
  const currentHeightValue =
    mode === 'letras'
      ? (letrasNormalHeightCm || posterConfig.heightCm)
      : mode === 'poster'
      ? posterConfig.heightCm
      : montagemDims.cardH;

  const montagemCardsPerPage = montagemDims.totalCards;
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
    mode === 'poster' || mode === 'letras'
      ? posterSheetsData.nonEmptySheets <= 1
      : montagemTotalQuantity <= 1;

  const isPosterAtMaxLimit = useMemo(() => {
    if ((mode !== 'poster' && mode !== 'letras') || !imageInfo) return false;
    if (mode === 'letras') {
      return posterConfig.fH >= 100 || posterConfig.widthCm >= LIMITE_MAX_POSTER_CM - 0.05;
    }
    if (posterSheetsData.nonEmptySheets >= 500) return true;
    if (posterConfig.widthCm >= LIMITE_MAX_POSTER_CM - 0.05 || posterConfig.heightCm >= LIMITE_MAX_POSTER_CM - 0.05) {
      return true;
    }
    const current = posterSheetsData.nonEmptySheets;
    const effectiveAspect = posterConfig.customAspect ?? (imageInfo.widthPx / imageInfo.heightPx);
    const nextGrid = findAdjacentPosterGrid(
      current,
      1,
      imageInfo.widthPx,
      imageInfo.heightPx,
      posterConfig.orientation,
      posterConfig.marginCm,
      true,
      effectiveAspect
    );
    return nextGrid === null;
  }, [mode, imageInfo, posterSheetsData.nonEmptySheets, posterConfig]);

  const isMaxQuantity =
    mode === 'poster' || mode === 'letras'
      ? isPosterAtMaxLimit
      : montagemTotalQuantity >= 500;

  const isMinMargin =
    mode === 'poster' || mode === 'letras'
      ? posterConfig.marginCm <= MARGEM_MINIMA_POSTER + 0.001
      : (montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM) <= ESPACO_MINIMO_MONTAGEM + 0.001;

  const isMaxMargin =
    mode === 'poster' || mode === 'letras'
      ? posterConfig.marginCm >= MARGEM_MAXIMA_POSTER - 0.001
      : (montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM) >= ESPACO_MAXIMO_MONTAGEM - 0.001;

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

      {/* Hidden Font Input */}
      <input
        ref={fontInputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
        className="hidden"
        onChange={handleFontSelected}
      />

      {/* Hidden PDF Input */}
      <input
        ref={pdfFileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handlePdfFileSelected}
      />

      {/* Hidden Word Input */}
      <input
        ref={wordFileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleWordFileSelected}
      />

      {/* Main Container: Mobile single-column, Desktop 2-column workspace adjusting to screen height */}
      <main className="w-full max-w-xl sm:max-w-2xl lg:max-w-none mx-auto px-3.5 sm:px-5 lg:px-6 xl:px-8 2xl:px-10 py-2.5 sm:py-3.5 lg:py-3 pb-4 sm:pb-6 lg:pb-3 flex flex-col gap-4 sm:gap-5 lg:flex-1 lg:min-h-0 lg:h-full lg:flex-row lg:gap-5 xl:gap-6">
        {/* 2. ÁREA DE VISUALIZAÇÃO (Desktop: largura máxima ajustando ao tamanho da tela e altura total; Mobile: fixa no topo) */}
        <section
          id="section-preview"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`order-2 lg:order-none lg:flex-1 lg:min-w-0 sticky top-2 z-20 lg:static lg:z-auto w-full lg:h-full lg:min-h-0 bg-white rounded-2xl p-2 sm:p-2.5 border transition-all shadow-md lg:shadow-xs flex flex-col overflow-hidden ${
            isDragging ? 'border-blue-500 ring-2 ring-blue-400/40 bg-blue-50/20' : 'border-slate-200'
          }`}
        >
          {isCropMode ? (
            <div className="h-6 min-h-[24px] max-h-[24px] flex items-center justify-between mb-1.5 gap-2 min-w-0 shrink-0 select-none overflow-hidden transition-all duration-200">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 shrink-0 leading-none">
                  MODO RECORTE
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 shrink-0 leading-none">
                <span>Tam.</span>
                <span className="font-bold text-slate-900">
                  {cropDimensions.widthCm} x {cropDimensions.heightCm} cm
                </span>
              </div>
            </div>
          ) : (
            <div className="h-6 min-h-[24px] max-h-[24px] flex items-center justify-between mb-1.5 gap-2 min-w-0 shrink-0 select-none overflow-hidden transition-all duration-200">
              {/* Esquerda: Tam. ou Visualização */}
              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 shrink-0 leading-none">
                {mode === 'dividir' || mode === 'pdf' ? (
                  <>
                    <span>Tam.</span>
                    <span className="font-bold text-slate-900">A4</span>
                  </>
                ) : (
                  <>
                    <span>Tam.</span>
                    <span className="font-bold text-slate-900">
                      {imageInfo
                        ? mode === 'letras'
                          ? `${formatCm(letrasNormalWidthCm || posterConfig.widthCm)} x ${formatCm(letrasNormalHeightCm || posterConfig.heightCm)} cm`
                          : mode === 'poster'
                          ? `${formatCm(posterConfig.widthCm)} x ${formatCm(posterConfig.heightCm)} cm`
                          : `${formatCardCm(montagemDims.cardW)} x ${formatCardCm(montagemDims.cardH)} cm`
                        : mode === 'poster' || mode === 'letras'
                        ? 'A4'
                        : `${formatCardCm(montagemDims.cardW)} x ${formatCardCm(montagemDims.cardH)} cm`}
                    </span>
                  </>
                )}
              </div>

              {/* Direita no modo pôster / letras: páginas */}
              {(mode === 'poster' || mode === 'letras') && (
                <div className="ml-auto shrink-0 whitespace-nowrap leading-none flex items-center">
                  <span className="text-xs font-semibold text-slate-700 shrink-0 leading-none">
                    {mode === 'poster' && posterSavingsData?.canEconomize && posterConfig.economizarFolhas ? (
                      <span className="flex items-center gap-1.5">
                        <span className="line-through text-slate-400 font-normal">
                          {posterSheetsData.nonEmptySheets}
                        </span>
                        <span className="text-emerald-700 font-bold">
                          {posterSavingsData.optimizedNonEmptySheets} {posterSavingsData.optimizedNonEmptySheets === 1 ? 'página' : 'páginas'}
                        </span>
                      </span>
                    ) : (
                      <span className="font-bold text-slate-900">
                        {posterSheetsData.nonEmptySheets} {posterSheetsData.nonEmptySheets === 1 ? 'página' : 'páginas'}
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Direita no modo montagem: páginas e quantidade de cartões */}
              {mode === 'montagem' && (
                <div className="ml-auto shrink-0 whitespace-nowrap leading-none flex items-center">
                  {montagemTotalPages > 1 ? (
                    <div className="text-xs font-semibold text-slate-700 flex items-center gap-1 shrink-0 whitespace-nowrap leading-none">
                      <button
                        type="button"
                        onClick={() => setMontagemCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={montagemCurrentPage <= 1}
                        className="w-5 h-5 flex items-center justify-center hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-slate-700 transition-colors"
                        title="Página anterior"
                        aria-label="Página anterior"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="whitespace-nowrap font-medium text-slate-700">
                        Pág. {montagemCurrentPage} de {montagemTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMontagemCurrentPage((p) => Math.min(montagemTotalPages, p + 1))}
                        disabled={montagemCurrentPage >= montagemTotalPages}
                        className="w-5 h-5 flex items-center justify-center hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-slate-700 transition-colors"
                        title="Próxima página"
                        aria-label="Próxima página"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-bold text-slate-900 ml-1 whitespace-nowrap">
                        ({montagemTotalQuantity} {montagemTotalQuantity === 1 ? 'cartão' : 'cartões'})
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 shrink-0 whitespace-nowrap leading-none">
                      <span className="whitespace-nowrap font-medium text-slate-600">Pág. 1 de 1</span>
                      <span className="font-bold text-slate-900 whitespace-nowrap">
                        ({montagemTotalQuantity} {montagemTotalQuantity === 1 ? 'cartão' : 'cartões'})
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Direita no modo dividir: partes ativas */}
              {mode === 'dividir' && dividedDrawings.length > 0 && (
                <div className="ml-auto shrink-0 whitespace-nowrap leading-none flex items-center text-xs">
                  <span className="font-semibold text-slate-700">
                    {dividedDrawings.filter((d) => d.selected !== false).length} de {dividedDrawings.length}{' '}
                    {dividedDrawings.length === 1 ? 'parte ativa' : 'partes ativas'}
                  </span>
                </div>
              )}

              {/* Direita no modo pdf: intervalo de páginas e quantidade de páginas */}
              {mode === 'pdf' && pdfPages.length > 0 && (
                <div className="ml-auto shrink-0 whitespace-nowrap leading-none flex items-center text-xs gap-1.5">
                  <span className="text-slate-500 font-medium">Páginas:</span>
                  <span className="font-bold text-slate-900">
                    {formatPageIntervals(pdfPages.filter((p) => p.selected !== false).map((p) => p.pageNumber))}
                  </span>
                  <span className="font-semibold text-blue-700">
                    ({pdfPages.filter((p) => p.selected !== false).length} de {pdfPages.length}{' '}
                    {pdfPages.length === 1 ? 'página' : 'páginas'})
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center overflow-hidden transition-all duration-300 ease-in-out">
            {isCropMode && originalImageInfo ? (
              <CropEditor
                originalImage={originalImageInfo}
                cropBox={cropBox}
                onChangeCropBox={setCropBox}
              />
            ) : mode === 'dividir' ? (
              <DividirDesenhosPreview
                drawings={dividedDrawings}
                partesPorFolha={partesPorFolha}
                isProcessing={isSplittingDrawings}
                hasImage={!!imageInfo}
                onUploadClick={() => fileInputRef.current?.click()}
                onRedetect={(lvl) => triggerSplitDrawings(imageInfo, lvl)}
                onToggleDrawing={handleToggleDividedDrawing}
                currentSensitivity={splitSensitivity}
                bgTone="light"
                orientation="vertical"
              />
            ) : mode === 'pdf' ? (
              <PdfToWordPreview
                pages={pdfPages}
                rowCount={pdfVisualizacaoLinhas}
                isProcessing={isProcessingPdf}
                hasPdf={!!pdfFile}
                onUploadPdfClick={() => pdfFileInputRef.current?.click()}
                onTogglePage={handleTogglePdfPage}
                bgTone="light"
              />
            ) : mode === 'poster' || mode === 'letras' ? (
              <PosterPreview imageInfo={imageInfo} config={posterConfig} mode={mode} />
            ) : (
              <MontagemPreview
                imageInfo={imageInfo}
                config={montagemConfig}
                currentPage={montagemCurrentPage}
                totalPages={montagemTotalPages}
                onPageChange={setMontagemCurrentPage}
              />
            )}
          </div>
        </section>

        {/* COLUNA DE CONFIGURAÇÕES (Desktop: largura fixa com ferramenta atual fixa no topo e rolagem independente dos controles; Mobile: contents para ordem flex) */}
        <div className="contents lg:flex lg:flex-col lg:w-80 xl:w-[350px] 2xl:w-[370px] lg:shrink-0 lg:h-full lg:min-h-0 lg:gap-3 xl:gap-3.5">
          {/* MODO ATIVO NO TOPO (Fixo no desktop) */}
          <section
            id="section-mode-switcher"
            className={`order-first lg:order-none shrink-0 w-full flex flex-col items-center gap-1.5 transition-all duration-200 ${
              isCropMode ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''
            }`}
          >
            <div className="w-full bg-slate-100 p-0.5 sm:p-1 rounded-xl flex border border-slate-200 shadow-xs">
              <button
                type="button"
                className="w-full h-9 px-2.5 rounded-lg text-xs sm:text-sm font-bold bg-white text-blue-700 shadow-xs border border-slate-200/80 flex items-center justify-center gap-2 cursor-default select-none"
              >
                {mode === 'poster' && <FileText className="w-4 h-4 shrink-0 text-blue-600" />}
                {mode === 'montagem' && <Grid className="w-4 h-4 shrink-0 text-blue-600" />}
                {mode === 'letras' && <Type className="w-4 h-4 shrink-0 text-blue-600" />}
                {mode === 'dividir' && <Sparkles className="w-4 h-4 shrink-0 text-blue-600" />}
                {mode === 'pdf' && <FileCode className="w-4 h-4 shrink-0 text-blue-600" />}
                <span>
                  {mode === 'poster'
                    ? 'Criar pôster'
                    : mode === 'montagem'
                    ? 'Montar cartões'
                    : mode === 'letras'
                    ? 'Molde de letras'
                    : mode === 'dividir'
                    ? 'Dividir desenhos'
                    : 'PDF para arquivo Word'}
                </span>
              </button>
            </div>

            <p className="text-[11px] sm:text-xs text-slate-500 text-center px-1">
              {mode === 'poster'
                ? 'Amplie e divida sua imagem para imprimir e montar.'
                : mode === 'montagem'
                ? 'Crie vários cartões em uma folha A4, com guias de corte.'
                : mode === 'letras'
                ? 'Crie moldes de letras e nomes em tamanho real para EVA.'
                : mode === 'dividir'
                ? 'Divida desenhos da imagem para salvar em Word ou PNG.'
                : 'Converta páginas de PDF e insira em um documento Word.'}
            </p>
          </section>

          {/* ROLAGEM INDEPENDENTE DOS DEMAIS CONTROLES NO DESKTOP */}
          <div className="contents lg:flex lg:flex-col lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1.5 lg:gap-3 xl:gap-3.5 custom-scrollbar">

          {/* 1. EM CIMA: BOTÃO DE INSERIR A IMAGEM / INSERIR FONTE */}
          <section
            id="section-upload"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`order-1 lg:order-none shrink-0 w-full transition-all duration-200 ${
              isDragging ? 'opacity-90 ring-2 ring-blue-500 rounded-xl' : ''
            } ${isCropMode ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''}`}
          >
            {mode === 'pdf' ? (
              <div className="flex flex-col gap-2 w-full">
                <button
                  type="button"
                  disabled={!!(pdfFile && wordFile) || isProcessingPdf}
                  onClick={() => {
                    if (!pdfFile) {
                      pdfFileInputRef.current?.click();
                    } else if (!wordFile) {
                      wordFileInputRef.current?.click();
                    }
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold h-9 py-2 px-3 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
                >
                  <Upload className="w-4 h-4 shrink-0" />
                  <span>
                    {!pdfFile
                      ? 'Inserir PDF'
                      : !wordFile
                      ? 'Inserir Word'
                      : 'Inserir'}
                  </span>
                </button>

                {/* Lista dos arquivos carregados com botão de exclusão */}
                {(pdfFile || wordFile) && (
                  <div className="w-full bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col gap-1.5">
                    {pdfFile && (
                      <div className="flex items-center justify-between gap-2 p-1.5 bg-blue-50/60 rounded-lg border border-blue-100 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-red-500 shrink-0" />
                          <div className="min-w-0 flex flex-col">
                            <span className="font-bold text-slate-800 truncate text-[11px] sm:text-xs">
                              {pdfFile.name}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              PDF • {pdfPages.length} {pdfPages.length === 1 ? 'página' : 'páginas'}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleDeletePdfFile}
                          className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                          title="Excluir arquivo PDF"
                          aria-label="Excluir arquivo PDF"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {wordFile && (
                      <div className="flex items-center justify-between gap-2 p-1.5 bg-blue-50/60 rounded-lg border border-blue-100 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
                          <div className="min-w-0 flex flex-col">
                            <span className="font-bold text-slate-800 truncate text-[11px] sm:text-xs">
                              {wordFile.name}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Word (.docx)
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleDeleteWordFile}
                          className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                          title="Excluir arquivo Word"
                          aria-label="Excluir arquivo Word"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Usar PDF de exemplo para testar no modo PDF para Word */}
                {!pdfFile && (
                  <div className="mt-0.5 flex items-center justify-center">
                    <button
                      type="button"
                      disabled={isProcessingPdf}
                      onClick={handleUsePdfModelo}
                      className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium hover:underline cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>Usar PDF de exemplo para testar</span>
                    </button>
                  </div>
                )}
              </div>
            ) : mode === 'letras' ? (
              <button
                type="button"
                onClick={() => fontInputRef.current?.click()}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold h-9 py-2 px-3 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span>{letrasFontFamily ? 'Trocar fonte' : 'Inserir fonte'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isCropMode}
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold h-9 py-2 px-3 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span>{imageInfo ? 'Trocar imagem' : 'Inserir imagem'}</span>
              </button>
            )}

            {/* No Modo Letras: Exibir fonte selecionada ou botão de fonte padrão */}
            {mode === 'letras' ? (
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs whitespace-nowrap overflow-hidden">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Type className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                    <span className="font-semibold text-slate-800 truncate" title={letrasFontName || 'Nenhuma fonte selecionada'}>
                      {letrasFontName || 'Nenhuma fonte selecionada'}
                    </span>
                  </div>
                  {letrasFontFamily ? (
                    <button
                      type="button"
                      onClick={() => {
                        setLetrasFontFamily('');
                        setLetrasFontName('');
                        setImageInfo(null);
                        setOriginalImageInfo(null);
                      }}
                      className="text-[11px] text-red-500 hover:underline shrink-0 cursor-pointer"
                    >
                      Remover
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium shrink-0">Sem fonte</span>
                  )}
                </div>

                {!letrasFontFamily && (
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={handleUseDefaultFont}
                      className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium hover:underline cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>Usar fonte padrão de exemplo</span>
                    </button>
                  </div>
                )}
              </div>
            ) : mode === 'pdf' ? null : imageInfo ? (
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

          {/* 1.5 SEÇÃO NOME: ANTES DE TAMANHO */}
          {mode === 'letras' && (
            <section
              id="section-nome"
              className="order-2 lg:order-none shrink-0 w-full bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200 shadow-xs flex flex-col gap-2.5 transition-all duration-200"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>NOME / FRASE</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="input-letras-texto" className="text-xs font-semibold text-slate-700">
                  Frase ou nome a ser montado
                </label>
                <input
                  id="input-letras-texto"
                  type="text"
                  value={letrasTexto}
                  onChange={handleLetrasTextoChange}
                  placeholder="Digite o nome, palavra ou frase..."
                  className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs tracking-wider"
                />
              </div>
            </section>
          )}

          {/* 2. SEÇÃO: TAMANHO (Largura e Altura da Frase) */}
          {mode !== 'dividir' && mode !== 'pdf' && (
            <>
            <section
              id="section-size"
            className={`order-3 lg:order-none shrink-0 w-full bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200 shadow-xs flex flex-col gap-2 transition-all duration-200 ${
              !imageInfo
                ? 'opacity-40 pointer-events-none select-none text-slate-400'
                : ''
            }`}
          >
            <div className={`flex items-center justify-between text-xs font-bold transition-colors ${!imageInfo || isCropMode ? 'text-slate-400' : 'text-slate-800'}`}>
              <span>{mode === 'letras' ? 'TAMANHO DA FRASE' : 'TAMANHO'}</span>
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
                  min={mode === 'poster' || mode === 'letras' ? 1 : 0.5}
                  max={mode === 'poster' || mode === 'letras' ? LIMITE_MAX_POSTER_CM : 50}
                  unit="cm"
                  unitClassName="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-semibold pointer-events-none"
                  formatFn={mode === 'poster' || mode === 'letras' ? formatCm : formatCardCm}
                  parseFn={parseCm}
                  className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
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
                  min={mode === 'poster' || mode === 'letras' ? 0.5 : 0.5}
                  max={mode === 'letras' ? 40 : mode === 'poster' ? LIMITE_MAX_POSTER_CM : 50}
                  unit="cm"
                  unitClassName="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-semibold pointer-events-none"
                  formatFn={mode === 'poster' || mode === 'letras' ? formatCm : formatCardCm}
                  parseFn={parseCm}
                  className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
                />
              </div>
            </div>

            {/* Manter Proporção e Modo Recorte (apenas nos modos Pôster e Montagem) */}
            {mode !== 'letras' && (
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
            )}
          </section>

          {/* 3. SEÇÃO: QUANTIDADE / TAMANHO DA FONTE */}
          <section
            id="section-quantity"
            className={`order-4 lg:order-none shrink-0 w-full bg-blue-50/60 rounded-2xl p-3 sm:p-3.5 border border-blue-200/70 shadow-xs flex flex-col gap-2 transition-all duration-200 ${
              !imageInfo
                ? 'opacity-40 pointer-events-none select-none text-slate-400'
                : ''
            }`}
          >
            <div className={`flex items-center justify-between text-xs font-bold transition-colors ${!imageInfo || isCropMode ? 'text-slate-400' : 'text-slate-800'}`}>
              <span>{mode === 'letras' ? 'TAMANHO DA FONTE' : 'QUANTIDADE'}</span>
              {mode === 'letras' && imageInfo && (
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full border border-blue-200 leading-none">
                  {posterSheetsData.nonEmptySheets} {posterSheetsData.nonEmptySheets === 1 ? 'folha' : 'folhas'} {posterConfig.fH * posterConfig.fV > posterSheetsData.nonEmptySheets ? `de ${posterConfig.fH * posterConfig.fV} (${posterConfig.fH}x${posterConfig.fV})` : `(${posterConfig.fH}x${posterConfig.fV})`}
                </span>
              )}
            </div>

            {/* No modo molde de letras: Tamanho da Fonte em pt */}
            {mode === 'letras' ? (
              <div className={`flex flex-col gap-2.5 transition-all duration-200 ${!imageInfo ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''}`}>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="input-tamanho-fonte" className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-700'}`}>
                      Tamanho da fonte
                    </label>
                    <CmInput
                      id="input-tamanho-fonte"
                      value={letrasFontSizePt}
                      onChange={handleFontSizeInputChange}
                      placeholder="65"
                      disabled={!imageInfo}
                      min={10}
                      max={1200}
                      unit="pt"
                      unitClassName="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-semibold pointer-events-none"
                      formatFn={(v) => Math.round(v).toString()}
                      parseFn={(str) => parseInt(str.replace(/[^\d]/g, ''), 10) || 65}
                      className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
                    />
                  </div>

                  {/* Botões - e + para Tamanho da Fonte */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-transparent select-none">&nbsp;</span>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <HoldButton
                        onAction={() => handleAdjustFontSize(-1)}
                        disabled={!imageInfo || letrasFontSizePt <= 10}
                        className="flex-1 h-9 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                        title="Diminuir tamanho da fonte"
                        aria-label="Diminuir tamanho da fonte"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </HoldButton>
                      <HoldButton
                        onAction={() => handleAdjustFontSize(1)}
                        disabled={!imageInfo || letrasFontSizePt >= 1200}
                        className="flex-1 h-9 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-xl text-blue-700 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                        title="Aumentar tamanho da fonte"
                        aria-label="Aumentar tamanho da fonte"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </HoldButton>
                    </div>
                  </div>
                </div>

                {/* Espaçamento entre letras (na mesma seção) */}
                <div className="pt-2 border-t border-blue-200/60">
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <label htmlFor="input-espacamento-letras" className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-700'}`}>
                          Espaço entre letras
                        </label>
                      </div>
                      <div className="relative">
                        <input
                          id="input-espacamento-letras"
                          type="text"
                          value={letrasLetterSpacingMm === 0 ? 'Normal' : `${letrasLetterSpacingMm > 0 ? '+' : ''}${letrasLetterSpacingMm} mm`}
                          onChange={(e) => handleLetterSpacingInputChange(e.target.value)}
                          onFocus={(e) => {
                            if (letrasLetterSpacingMm === 0) {
                              e.target.value = '0';
                            } else {
                              e.target.value = letrasLetterSpacingMm.toString();
                            }
                            e.target.select();
                          }}
                          onBlur={(e) => {
                            handleLetterSpacingInputChange(e.target.value);
                          }}
                          disabled={!imageInfo}
                          placeholder="Normal"
                          className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
                        />
                      </div>
                    </div>

                    {/* Botões - e + para Espaçamento */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-end h-4">
                        {letrasLetterSpacingMm !== 0 && (
                          <button
                            type="button"
                            onClick={handleResetLetterSpacing}
                            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                            title="Restaurar espaçamento normal"
                          >
                            Normal
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <HoldButton
                          onAction={() => handleAdjustLetterSpacing(-1)}
                          disabled={!imageInfo || letrasLetterSpacingMm <= -20}
                          className="flex-1 h-9 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                          title="Diminuir espaçamento entre letras"
                          aria-label="Diminuir espaçamento entre letras"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </HoldButton>
                        <HoldButton
                          onAction={() => handleAdjustLetterSpacing(1)}
                          disabled={!imageInfo || letrasLetterSpacingMm >= 100}
                          className="flex-1 h-9 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-xl text-blue-700 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                          title="Aumentar espaçamento entre letras"
                          aria-label="Aumentar espaçamento entre letras"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </HoldButton>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
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
                            value={
                              montagemConfig.mixedLayout && montagemConfig.mixedSlots && montagemConfig.mixedSlots.length > 0
                                ? `${montagemConfig.mixedSlots.length} (${montagemConfig.mixedSlots.filter((s) => !s.rotated).length}+${montagemConfig.mixedSlots.filter((s) => s.rotated).length})`
                                : `${montagemConfig.fH * montagemConfig.fV} (${montagemConfig.fH}x${montagemConfig.fV})`
                            }
                            disabled={!imageInfo || isCropMode}
                            className="w-full h-9 px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs cursor-default select-none focus:outline-none focus:ring-0 disabled:bg-slate-100 disabled:opacity-60 shadow-xs truncate"
                          />
                        </div>
                      </div>

                      {/* Botões - e + para Grade de Cartões */}
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-transparent select-none">&nbsp;</span>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <HoldButton
                            onAction={() => handleAdjustMontagemGrid(-1)}
                            disabled={!imageInfo || isCropMode || !canMontagemGridPrev}
                            className="flex-1 h-9 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                            title="Diminuir grade na folha"
                            aria-label="Diminuir grade na folha"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </HoldButton>
                          <HoldButton
                            onAction={() => handleAdjustMontagemGrid(1)}
                            disabled={!imageInfo || isCropMode || !canMontagemGridNext}
                            className="flex-1 h-9 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-xl text-blue-700 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                            title="Aumentar grade na folha"
                            aria-label="Aumentar grade na folha"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </HoldButton>
                        </div>
                      </div>
                    </div>
                    <p className={`text-[11px] mt-0.5 ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
                      {montagemConfig.mixedLayout
                        ? 'Combina cartões na vertical e horizontal na folha'
                        : 'Monta a grade na página com rotação automática'}
                    </p>
                  </div>
                )}

                {/* Input Quantidade (Quantidade de páginas no Pôster / Quantidade de cartões na Montagem) */}
                <div className={`flex flex-col gap-1 transition-all duration-200 ${mode === 'montagem' ? 'pt-2 border-t border-blue-200/60' : ''} ${!imageInfo || isCropMode ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''}`}>
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="input-quantidade" className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-700'}`}>
                        {mode === 'montagem' ? 'Quantidade de cartões' : 'Quantidade de páginas'}
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
                          className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs cursor-default select-none focus:outline-none focus:ring-0 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
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
                          className="flex-1 h-9 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                          title={mode === 'montagem' ? 'Diminuir cartões' : 'Diminuir páginas'}
                          aria-label={mode === 'montagem' ? 'Diminuir cartões' : 'Diminuir páginas'}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </HoldButton>
                        <HoldButton
                          onAction={() => handleAdjustQuantity(1)}
                          disabled={!imageInfo || isCropMode || isMaxQuantity}
                          className="flex-1 h-9 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-xl text-blue-700 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                          title={mode === 'montagem' ? 'Aumentar cartões' : 'Aumentar páginas'}
                          aria-label={mode === 'montagem' ? 'Aumentar cartões' : 'Aumentar páginas'}
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
              </>
            )}
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

          {/* Margem da Página / Espaço entre cartões */}
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-2 gap-3">
              {/* Input Margem / Espaço entre cartões */}
              <div className="flex flex-col gap-1">
                <label htmlFor="input-margem" className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-700'}`}>
                  {mode === 'poster' || mode === 'letras' ? 'Margem da página' : 'Espaço entre cartões'}
                </label>
                <CmInput
                  id="input-margem"
                  readOnly
                  value={mode === 'poster' || mode === 'letras' ? posterConfig.marginCm : (montagemConfig.spacingCm ?? ESPACO_PADRAO_MONTAGEM)}
                  onChange={mode === 'poster' || mode === 'letras' ? handleMarginChange : handleSpacingChange}
                  disabled={!imageInfo || isCropMode}
                  min={mode === 'poster' || mode === 'letras' ? MARGEM_MINIMA_POSTER : ESPACO_MINIMO_MONTAGEM}
                  max={mode === 'poster' || mode === 'letras' ? MARGEM_MAXIMA_POSTER : ESPACO_MAXIMO_MONTAGEM}
                  unitClassName="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-semibold pointer-events-none"
                  className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs cursor-default select-none focus:outline-none focus:ring-0 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
                />
              </div>

              {/* Botões - e + para Margem / Espaço */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-transparent select-none">&nbsp;</span>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <HoldButton
                    onAction={() => handleAdjustMargin(-0.1)}
                    disabled={!imageInfo || isCropMode || isMinMargin}
                    className="flex-1 h-9 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                    title={mode === 'poster' || mode === 'letras' ? 'Diminuir margem' : 'Diminuir espaço'}
                    aria-label={mode === 'poster' || mode === 'letras' ? 'Diminuir margem' : 'Diminuir espaço'}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </HoldButton>
                  <HoldButton
                    onAction={() => handleAdjustMargin(0.1)}
                    disabled={!imageInfo || isCropMode || isMaxMargin}
                    className="flex-1 h-9 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-xl text-blue-700 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                    title={mode === 'poster' || mode === 'letras' ? 'Aumentar margem' : 'Aumentar espaço'}
                    aria-label={mode === 'poster' || mode === 'letras' ? 'Aumentar margem' : 'Aumentar espaço'}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </HoldButton>
                </div>
              </div>
            </div>
            <p className={`text-[11px] mt-0.5 ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
              {mode === 'poster' || mode === 'letras'
                ? 'Margem de borda em branco em cada página para impressão'
                : 'Espaço para corte entre cada cartão na folha A4'}
            </p>
          </div>

          {/* Specific Options for Poster vs Montagem */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-col gap-2.5">
            {mode === 'poster' ? (
              <>
                {/* Opção Aumentar Resolução */}
                <label className={`flex items-center gap-2.5 cursor-pointer py-0.5 select-none ${!imageInfo || isCropMode ? 'opacity-40 pointer-events-none text-slate-400' : ''}`}>
                  <input
                    type="checkbox"
                    checked={Boolean(posterConfig.aumentarResolucao)}
                    disabled={!imageInfo || isCropMode}
                    onChange={(e) => handleToggleAumentarResolucao(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white disabled:cursor-not-allowed cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-800'}`}>
                      Aumentar resolução
                    </span>
                    <span className={`text-[11px] ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
                      Aplica alta resolução e nitidez na geração do PDF para impressão
                    </span>
                  </div>
                </label>

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

                {/* Opção Aproveitamento Máximo: SEMPRE visível no modo pôster abaixo de Modelo montado do pôster */}
                <label className={`flex items-center gap-2.5 cursor-pointer py-0.5 select-none ${!imageInfo || isCropMode ? 'opacity-40 pointer-events-none text-slate-400' : ''}`}>
                  <input
                    type="checkbox"
                    checked={Boolean(posterConfig.economizarFolhas)}
                    disabled={!imageInfo || isCropMode}
                    onChange={(e) =>
                      setPosterConfig((prev) => ({ ...prev, economizarFolhas: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 bg-white disabled:cursor-not-allowed cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-800'}`}>
                        Aproveitamento máximo
                      </span>
                      {posterSavingsData?.canEconomize ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 leading-none">
                          -{posterSavingsData.savedSheets} {posterSavingsData.savedSheets === 1 ? 'folha' : 'folhas'} ({posterSavingsData.fractionLabel})
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 leading-none">
                          Sem sobras
                        </span>
                      )}
                    </div>
                    <span className={`text-[11px] ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
                      Agrupa partes estreitas na mesma pagina
                    </span>
                  </div>
                </label>
              </>
            ) : mode === 'letras' ? (
              <>
                {/* Modelo montado do pôster no Modo Letras */}
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
                    <span className={`text-[11px] ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>Adicionar guia de montagem na primeira página do PDF</span>
                  </div>
                </label>

                {/* Aproveitamento Máximo no Modo Letras */}
                <label className={`flex items-center gap-2.5 cursor-pointer py-0.5 select-none ${!imageInfo || isCropMode ? 'opacity-40 pointer-events-none text-slate-400' : ''}`}>
                  <input
                    type="checkbox"
                    checked={letrasAproveitamentoMaximo}
                    disabled={!imageInfo || isCropMode}
                    onChange={(e) => handleToggleLetrasAproveitamento(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 bg-white disabled:cursor-not-allowed cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-800'}`}>
                      Aproveitamento máximo
                    </span>
                    <span className={`text-[11px] ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
                      {letrasAproveitamentoMaximo
                        ? 'Remove letras duplicadas, deixa apenas uma de cada e une elas'
                        : 'Frase completa (com todas as letras e espaços)'}
                    </span>
                  </div>
                </label>

                {/* Letras em cada página no Modo Letras */}
                <label className={`flex items-center gap-2.5 cursor-pointer py-0.5 select-none ${!imageInfo || isCropMode ? 'opacity-40 pointer-events-none text-slate-400' : ''}`}>
                  <input
                    type="checkbox"
                    checked={letrasPorPagina}
                    disabled={!imageInfo || isCropMode}
                    onChange={(e) => handleToggleLetrasPorPagina(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white disabled:cursor-not-allowed cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-800'}`}>
                      Letras em cada página
                    </span>
                    <span className={`text-[11px] ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
                      {letrasPorPagina
                        ? 'Distribui letras inteiras por folha (divide apenas se a letra exceder a página)'
                        : 'Texto contínuo montado em mosaico'}
                    </span>
                  </div>
                </label>
              </>
            ) : (
              <>
                {/* 1. Contorno dos cartões vem primeiro */}
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

                {/* 2. Aproveitamento máximo (organizar na vertical e horizontal) vem depois de Contorno dos cartões */}
                <label className={`flex items-center gap-2.5 cursor-pointer py-0.5 select-none ${!imageInfo ? 'pointer-events-none text-slate-400' : ''}`}>
                  <input
                    type="checkbox"
                    checked={Boolean(montagemConfig.mixedLayout)}
                    disabled={!imageInfo || isCropMode}
                    onChange={(e) => handleToggleMixedLayout(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 bg-white disabled:cursor-not-allowed"
                  />
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-800'}`}>
                      Aproveitamento máximo
                    </span>
                    <span className={`text-[11px] ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
                      combina orientações para maximizar o aproveitamento
                    </span>
                  </div>
                </label>
              </>
            )}
          </div>
        </section>
        </>
        )}

        {/* SESSÃO VISUALIZAÇÃO (Modo Dividir Desenhos) */}
        {mode === 'dividir' && (
          <section
            id="section-visualizacao"
            className={`order-3 lg:order-none shrink-0 w-full bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200 shadow-xs flex flex-col gap-2.5 transition-all duration-200 ${
              !imageInfo
                ? 'opacity-40 pointer-events-none select-none text-slate-400'
                : ''
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>VISUALIZAÇÃO</span>
              {dividedDrawings.length > 0 && (
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full border border-blue-200 leading-none">
                  {dividedDrawings.length} {dividedDrawings.length === 1 ? 'desenho' : 'desenhos'}
                </span>
              )}
            </div>

            {/* Input Quantidade de partes por folha - IDÊNTICO a quantidade de cartões */}
            <div className={`flex flex-col gap-1 transition-all duration-200 ${!imageInfo ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''}`}>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="input-partes-folha" className={`text-xs font-semibold ${!imageInfo ? 'text-slate-400' : 'text-slate-700'}`}>
                    Partes por folha
                  </label>
                  <div className="relative">
                    <input
                      id="input-partes-folha"
                      type="text"
                      inputMode="numeric"
                      value={partesPorFolha}
                      onChange={(e) => {
                        const val = parseInt(e.target.value.replace(/\D/g, ''), 10);
                        if (!isNaN(val) && val >= 1) {
                          setPartesPorFolha(Math.min(50, val));
                        } else if (e.target.value === '') {
                          setPartesPorFolha(1);
                        }
                      }}
                      disabled={!imageInfo}
                      className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
                    />
                  </div>
                </div>

                {/* Botões - e + para Quantidade de partes por folha */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-transparent select-none">&nbsp;</span>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <HoldButton
                      onAction={() => setPartesPorFolha((prev) => Math.max(1, prev - 1))}
                      disabled={!imageInfo || partesPorFolha <= 1}
                      className="flex-1 h-9 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                      title="Diminuir partes por folha"
                      aria-label="Diminuir partes por folha"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </HoldButton>
                    <HoldButton
                      onAction={() => setPartesPorFolha((prev) => Math.min(50, prev + 1))}
                      disabled={!imageInfo || partesPorFolha >= 50}
                      className="flex-1 h-9 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-xl text-blue-700 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                      title="Aumentar partes por folha"
                      aria-label="Aumentar partes por folha"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </HoldButton>
                  </div>
                </div>
              </div>
              <p className={`text-[11px] mt-0.5 ${!imageInfo ? 'text-slate-400' : 'text-slate-500'}`}>
                Reduza ou aumente a quantidade de partes por folha
              </p>
              {dividedDrawings.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                  Toque em qualquer desenho na visualização para desativar (ficará desfocado e não será salvo).
                </p>
              )}
            </div>
          </section>
        )}

        {/* SESSÃO VISUALIZAÇÃO (Modo PDF para Word) */}
        {mode === 'pdf' && (
          <section
            id="section-pdf-visualizacao"
            className={`order-3 lg:order-none shrink-0 w-full bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200 shadow-xs flex flex-col gap-2.5 transition-all duration-200 ${
              !pdfFile
                ? 'opacity-40 pointer-events-none select-none text-slate-400'
                : ''
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>VISUALIZAÇÃO</span>
              {pdfPages.length > 0 && (
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full border border-blue-200 leading-none">
                  {pdfPages.length} {pdfPages.length === 1 ? 'página' : 'páginas'}
                </span>
              )}
            </div>

            {/* Input Quantidade de linhas para visualização */}
            <div className={`flex flex-col gap-1 transition-all duration-200 ${!pdfFile ? 'opacity-30 pointer-events-none select-none text-slate-300' : ''}`}>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="input-pdf-linhas" className={`text-xs font-semibold ${!pdfFile ? 'text-slate-400' : 'text-slate-700'}`}>
                    Linhas de páginas
                  </label>
                  <div className="relative">
                    <input
                      id="input-pdf-linhas"
                      type="text"
                      inputMode="numeric"
                      value={pdfVisualizacaoLinhas}
                      onChange={(e) => {
                        const val = parseInt(e.target.value.replace(/\D/g, ''), 10);
                        if (!isNaN(val) && val >= 1) {
                          setPdfVisualizacaoLinhas(Math.min(4, Math.max(1, val)));
                        } else if (e.target.value === '') {
                          setPdfVisualizacaoLinhas(1);
                        }
                      }}
                      disabled={!pdfFile}
                      className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-60 shadow-xs"
                    />
                  </div>
                </div>

                {/* Botões - e + para Quantidade de linhas */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-transparent select-none">&nbsp;</span>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <HoldButton
                      onAction={() => setPdfVisualizacaoLinhas((prev) => Math.max(1, prev - 1))}
                      disabled={!pdfFile || pdfVisualizacaoLinhas <= 1}
                      className="flex-1 h-9 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                      title="Diminuir linhas"
                      aria-label="Diminuir linhas"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </HoldButton>
                    <HoldButton
                      onAction={() => setPdfVisualizacaoLinhas((prev) => Math.min(4, prev + 1))}
                      disabled={!pdfFile || pdfVisualizacaoLinhas >= 4}
                      className="flex-1 h-9 bg-white hover:bg-blue-50 active:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-300 rounded-xl text-blue-700 font-bold text-xs flex items-center justify-center shadow-sm hover:shadow active:shadow-xs transition-all cursor-pointer"
                      title="Aumentar linhas (máx. 4)"
                      aria-label="Aumentar linhas"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </HoldButton>
                  </div>
                </div>
              </div>

              <p className={`text-[11px] mt-0.5 ${!pdfFile ? 'text-slate-400' : 'text-slate-500'}`}>
                Aumente a quantidade de linhas para visualizar mais páginas
              </p>
              {pdfPages.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                  Toque em qualquer página na visualização para desmarcar (ficará desfocada e não será incluída no Word).
                </p>
              )}
            </div>
          </section>
        )}

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

          {mode === 'dividir' ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleExportWord}
                disabled={
                  !imageInfo ||
                  isExportingWord ||
                  isExportingPng ||
                  dividedDrawings.filter((d) => d.selected !== false).length === 0
                }
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold h-9 py-2 px-3 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
              >
                {isExportingWord ? (
                  <>
                    <RotateCcw className="w-4 h-4 shrink-0 animate-spin" />
                    <span>Salvando Word...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>Salvar em Word</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleExportPng}
                disabled={
                  !imageInfo ||
                  isExportingWord ||
                  isExportingPng ||
                  dividedDrawings.filter((d) => d.selected !== false).length === 0
                }
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold h-9 py-2 px-3 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
              >
                {isExportingPng ? (
                  <>
                    <RotateCcw className="w-4 h-4 shrink-0 animate-spin" />
                    <span>Salvando PNG...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 shrink-0" />
                    <span>Salvar em PNG</span>
                  </>
                )}
              </button>
            </div>
          ) : mode === 'pdf' ? (
            <button
              type="button"
              onClick={handleExportPdfToWord}
              disabled={
                !pdfFile ||
                isExportingPdfToWord ||
                pdfPages.filter((p) => p.selected !== false).length === 0
              }
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold h-9 py-2 px-3 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
            >
              {isExportingPdfToWord ? (
                <>
                  <RotateCcw className="w-4 h-4 shrink-0 animate-spin" />
                  <span>Salvando documento Word...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 shrink-0" />
                  <span>{wordFile ? 'Salvar no arquivo atual' : 'Salvar em novo arquivo'}</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!imageInfo || isExporting || isCropMode}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold h-9 py-2 px-3 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
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
          )}

          <p className="text-[11px] text-slate-500 font-medium text-center mt-2">
            {mode === 'dividir'
              ? 'Exporte todas as partes dos desenhos para Word ou imagens PNG.'
              : mode === 'pdf'
              ? wordFile
                ? 'Adiciona as páginas selecionadas no final do documento Word carregado.'
                : 'Cria um novo documento Word (.docx) com as páginas selecionadas do PDF.'
              : 'Gere um PDF A4 com medidas precisas, pronto para imprimir.'}
          </p>

          {/* Botões das outras ferramentas */}
          {!isCropMode && (
            <div className="mt-2.5 flex flex-col items-center justify-center gap-1.5">
              {mode !== 'poster' && (
                <button
                  type="button"
                  onClick={handleSwitchToPoster}
                  className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1.5 font-medium hover:underline cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span>Criar pôster</span>
                </button>
              )}

              {mode !== 'montagem' && (
                <button
                  type="button"
                  onClick={handleSwitchToMontagem}
                  className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1.5 font-medium hover:underline cursor-pointer"
                >
                  <Grid className="w-3.5 h-3.5 text-blue-500" />
                  <span>Montar cartões</span>
                </button>
              )}

              {mode !== 'letras' && (
                <button
                  type="button"
                  onClick={handleSwitchToLetras}
                  className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1.5 font-medium hover:underline cursor-pointer"
                >
                  <Type className="w-3.5 h-3.5 text-blue-500" />
                  <span>Molde de letras</span>
                </button>
              )}

              {mode !== 'dividir' && (
                <button
                  type="button"
                  onClick={handleSwitchToDividir}
                  className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1.5 font-medium hover:underline cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  <span>Dividir desenhos</span>
                </button>
              )}

              {mode !== 'pdf' && (
                <button
                  type="button"
                  onClick={handleSwitchToPdf}
                  className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1.5 font-medium hover:underline cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span>PDF para arquivo Word</span>
                </button>
              )}
            </div>
          )}
        </section>
        </div>
        </div>
      </main>

      {/* MODAL DE SUCESSO AO SALVAR */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 flex items-center justify-center mb-3">
              <Check className="w-8 h-8 stroke-[2.5]" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              {showSuccessModal.title || 'PDF Gerado com Sucesso!'}
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              {showSuccessModal.subtitle ? (
                showSuccessModal.subtitle
              ) : (
                <>
                  O arquivo foi baixado no seu dispositivo.
                  <br />
                  <strong className="text-slate-800 font-semibold">{showSuccessModal.pages}</strong>{' '}
                  {showSuccessModal.pages === 1 ? 'folha A4 configurada' : 'folhas A4 configuradas'}.
                </>
              )}
            </p>

            <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 mt-4 text-xs font-mono text-slate-700 truncate">
              {showSuccessModal.fileName}
            </div>

            <button
              type="button"
              onClick={() => setShowSuccessModal(null)}
              className="mt-4 w-full h-9 flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold px-4 rounded-xl text-xs sm:text-sm transition-all shadow-sm hover:shadow cursor-pointer"
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
