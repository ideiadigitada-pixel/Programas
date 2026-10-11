import {
  FOLHA_MAIOR,
  FOLHA_MENOR,
  Orientation,
  PosterConfig,
  MontagemConfig,
  PlacedCardSlot,
  LIMITE_MAX_POSTER_CM,
  MARGEM_FIXA_MONTAGEM,
} from '../types';

export function getPageDimensions(orientation: Orientation): { width: number; height: number } {
  if (orientation === 'vertical') {
    return { width: FOLHA_MENOR, height: FOLHA_MAIOR };
  }
  return { width: FOLHA_MAIOR, height: FOLHA_MENOR };
}

export function formatCm(val: number): string {
  if (isNaN(val) || val <= 0) return '0,0';
  return val.toFixed(1).replace('.', ',');
}

export function formatCardCm(val: number): string {
  if (isNaN(val) || val <= 0) return '0,0';
  return val.toFixed(1).replace('.', ',');
}

export function parseCm(text: string, defaultValue: number): number {
  if (!text) return defaultValue;
  const num = parseFloat(text.replace(',', '.'));
  return isNaN(num) || num <= 0 ? defaultValue : num;
}

export function formatMm(val: number): string {
  if (isNaN(val) || val <= 0) return '0';
  const rounded = Math.round(val * 10) / 10;
  if (rounded % 1 === 0) {
    return rounded.toFixed(0);
  }
  return rounded.toFixed(1).replace('.', ',');
}

export function parseMm(text: string, defaultValue: number): number {
  if (!text) return defaultValue;
  const num = parseFloat(text.replace(',', '.'));
  return isNaN(num) || num <= 0 ? defaultValue : num;
}

export function calculateInitialPoster(
  imgW: number,
  imgH: number,
  orientation: Orientation,
  marginCm: number
): { widthCm: number; heightCm: number; fH: number; fV: number } {
  const page = getPageDimensions(orientation);
  const usableW = Math.max(0.1, page.width - marginCm * 2);
  const usableH = Math.max(0.1, page.height - marginCm * 2);
  const aspect = imgW / imgH;

  let widthCm = usableW;
  let heightCm = widthCm / aspect;

  if (heightCm > usableH) {
    heightCm = usableH;
    widthCm = heightCm * aspect;
  }

  return {
    widthCm,
    heightCm,
    fH: 1,
    fV: 1,
  };
}

/**
 * Recalculates poster dimensions when grid (+/-) is pressed, keeping fH and fV fixed.
 * Directly corresponds to `_recalcular_com_fileiras_fixas` & `calcular_opcoes(..., "qtd_hv", ...)` in Python.
 * ALWAYS maintains the image's proportion (never stretches to asymmetric sheet grid).
 */
export function calculatePosterWithFixedSheets(
  imgW: number,
  imgH: number,
  fH: number,
  fV: number,
  orientation: Orientation,
  marginCm: number,
  _keepRatio?: boolean,
  customAspect?: number
): { widthCm: number; heightCm: number } {
  const page = getPageDimensions(orientation);
  const usableW = Math.max(0.1, page.width - marginCm * 2);
  const usableH = Math.max(0.1, page.height - marginCm * 2);
  const areaUtilH = fH * usableW;
  const areaUtilV = fV * usableH;

  const aspect = customAspect ?? ((imgW > 0 && imgH > 0) ? (imgW / imgH) : 1);

  let widthCm: number;
  let heightCm: number;

  if (areaUtilH / aspect <= areaUtilV) {
    widthCm = areaUtilH;
    heightCm = widthCm / aspect;
  } else {
    heightCm = areaUtilV;
    widthCm = heightCm * aspect;
  }

  // Limitar o pôster para não ultrapassar 4 metros (400 cm)
  if (widthCm > LIMITE_MAX_POSTER_CM) {
    widthCm = LIMITE_MAX_POSTER_CM;
    heightCm = widthCm / aspect;
  }
  if (heightCm > LIMITE_MAX_POSTER_CM) {
    heightCm = LIMITE_MAX_POSTER_CM;
    widthCm = heightCm * aspect;
  }

  return {
    widthCm: Math.round(widthCm * 10) / 10,
    heightCm: Math.round(heightCm * 10) / 10,
  };
}

export function calculatePosterSheets(
  config: PosterConfig,
  origW: number,
  origH: number
): {
  sheets: Array<{
    col: number;
    row: number;
    sheetIndex: number;
    isEmpty: boolean;
    cropX: number;
    cropY: number;
    cropW: number;
    cropH: number;
    drawW: number;
    drawH: number;
  }>;
  totalSheets: number;
  nonEmptySheets: number;
  usableW: number;
  usableH: number;
} {
  const page = getPageDimensions(config.orientation);
  const usableW = Math.max(0.1, page.width - config.marginCm * 2);
  const usableH = Math.max(0.1, page.height - config.marginCm * 2);

  const sheets = [];
  let nonEmptySheets = 0;
  let sheetIndex = 1;

  for (let r = 0; r < config.fV; r++) {
    for (let c = 0; c < config.fH; c++) {
      const xCm = c * usableW;
      const yCm = r * usableH;
      const parteWCm = Math.min(usableW, config.widthCm - xCm);
      const parteHCm = Math.min(usableH, config.heightCm - yCm);

      let isEmpty = parteWCm <= 0.01 || parteHCm <= 0.01;
      if (config.emptySlots !== undefined) {
        isEmpty = config.emptySlots.some((s) => s.col === c && s.row === r);
      } else if (config.activeSheetCount !== undefined && sheetIndex > config.activeSheetCount) {
        isEmpty = true;
      }
      if (!isEmpty) nonEmptySheets++;

      // Image normalized crop (0..1)
      const cropX = Math.max(0, Math.min(1, xCm / config.widthCm));
      const cropY = Math.max(0, Math.min(1, yCm / config.heightCm));
      const cropW = Math.max(0, Math.min(1 - cropX, parteWCm / config.widthCm));
      const cropH = Math.max(0, Math.min(1 - cropY, parteHCm / config.heightCm));

      sheets.push({
        col: c,
        row: r,
        sheetIndex,
        isEmpty,
        cropX,
        cropY,
        cropW,
        cropH,
        drawW: Math.max(0, parteWCm),
        drawH: Math.max(0, parteHCm),
      });

      sheetIndex++;
    }
  }

  return {
    sheets,
    totalSheets: config.fH * config.fV,
    nonEmptySheets,
    usableW,
    usableH,
  };
}

export interface PosterSavingsGroupItem {
  col: number;
  row: number;
  sheetIndex: number;
  partIndex: number;
  totalParts: number;
  pageNumber: number; // Cada parte tratada como página individual com número diferente
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  drawW: number;
  drawH: number;
}

export interface PosterSavingsGroup {
  pageNumber: number;
  type: 'col' | 'row';
  partsPerSheet: number;
  items: PosterSavingsGroupItem[];
}

export interface PosterSavingsInfo {
  canEconomize: boolean;
  type: 'col' | 'row' | 'both' | null;
  partsPerSheet: number;
  partialIndex: number;
  partialColIndex?: number;
  partialRowIndex?: number;
  ratio: number;
  fractionLabel: string;
  savedSheets: number;
  originalNonEmptySheets: number;
  optimizedNonEmptySheets: number;
  groups: PosterSavingsGroup[];
  sheetPageMap: Map<
    string,
    {
      pageNumber: number;
      partIndex?: number;
      totalParts?: number;
      isCombined: boolean;
      badgeText: string;
    }
  >;
}

/**
 * Analisa a grade do pôster para verificar se a última coluna ou linha ocupa menos da metade (<= 1/2)
 * ou até um terço (<= 1/3) de uma folha. Permite agrupar essas partes estreitas/baixas em uma única folha A4 no PDF,
 * economizando papel e mostrando no preview o tamanho correspondente (1/2 ou 1/3 da folha).
 */
export function calculatePosterSavings(
  config: PosterConfig,
  origW = 800,
  origH = 1200
): PosterSavingsInfo {
  const page = getPageDimensions(config.orientation);
  const usableW = Math.max(0.1, page.width - config.marginCm * 2);
  const usableH = Math.max(0.1, page.height - config.marginCm * 2);
  const { sheets, nonEmptySheets } = calculatePosterSheets(config, origW, origH);

  const fallbackMap = new Map<string, { pageNumber: number; isCombined: boolean; badgeText: string }>();
  let fallbackCounter = 1;
  for (const s of sheets) {
    if (!s.isEmpty) {
      fallbackMap.set(`${s.col}-${s.row}`, {
        pageNumber: fallbackCounter,
        isCombined: false,
        badgeText: String(fallbackCounter),
      });
      fallbackCounter++;
    }
  }

  if (nonEmptySheets <= 1) {
    return {
      canEconomize: false,
      type: null,
      partsPerSheet: 2,
      partialIndex: -1,
      ratio: 1,
      fractionLabel: '1/2',
      savedSheets: 0,
      originalNonEmptySheets: nonEmptySheets,
      optimizedNonEmptySheets: nonEmptySheets,
      groups: [],
      sheetPageMap: fallbackMap,
    };
  }

  // 1. Verifica se alguma coluna tem largura pequena agrupando em quantas partes couber (>= 2)
  let colCandidate: {
    type: 'col';
    partialIndex: number;
    ratio: number;
    partsPerSheet: number;
    savedSheets: number;
    sheets: typeof sheets;
  } | null = null;

  for (let c = 0; c < config.fH; c++) {
    const colSheets = sheets.filter((s) => s.col === c && !s.isEmpty);
    if (colSheets.length >= 2) {
      const maxDrawW = Math.max(...colSheets.map((s) => s.drawW));
      // Cada parte tem margem nos quatro cantos (célula = maxDrawW + 2 * marginCm)
      const partCellW = maxDrawW + 2 * config.marginCm;
      const maxFit = Math.floor((page.width + 0.001) / partCellW);
      const partsPerSheet = Math.min(4, colSheets.length, Math.max(2, maxFit));

      if (partsPerSheet >= 2 && maxFit >= 2) {
        const saved = colSheets.length - Math.ceil(colSheets.length / partsPerSheet);
        if (saved >= 1) {
          colCandidate = {
            type: 'col',
            partialIndex: c,
            ratio: maxDrawW / usableW,
            partsPerSheet,
            savedSheets: saved,
            sheets: colSheets,
          };
        }
      }
    }
  }

  // 2. Verifica se alguma linha tem altura pequena agrupando em até 4 partes por folha (>= 2)
  let rowCandidate: {
    type: 'row';
    partialIndex: number;
    ratio: number;
    partsPerSheet: number;
    savedSheets: number;
    sheets: typeof sheets;
  } | null = null;

  for (let r = 0; r < config.fV; r++) {
    const rowSheets = sheets.filter((s) => s.row === r && !s.isEmpty);
    if (rowSheets.length >= 2) {
      const maxDrawH = Math.max(...rowSheets.map((s) => s.drawH));
      const partCellH = maxDrawH + 2 * config.marginCm;
      const maxFit = Math.floor((page.height + 0.001) / partCellH);
      const partsPerSheet = Math.min(4, rowSheets.length, Math.max(2, maxFit));

      if (partsPerSheet >= 2 && maxFit >= 2) {
        const saved = rowSheets.length - Math.ceil(rowSheets.length / partsPerSheet);
        if (saved >= 1) {
          rowCandidate = {
            type: 'row',
            partialIndex: r,
            ratio: maxDrawH / usableH,
            partsPerSheet,
            savedSheets: saved,
            sheets: rowSheets,
          };
        }
      }
    }
  }

  type CandidateType = 'col' | 'row' | 'both';

  interface EvaluatedPlan {
    type: CandidateType;
    partialIndex: number;
    partialColIndex?: number;
    partialRowIndex?: number;
    ratio: number;
    partsPerSheet: number;
    fractionLabel: string;
    savedSheets: number;
    colGroups: { partsPerSheet: number; sheets: typeof sheets }[];
    rowGroups: { partsPerSheet: number; sheets: typeof sheets }[];
  }

  const planOnlyCol: EvaluatedPlan | null = colCandidate
    ? {
        type: 'col',
        partialIndex: colCandidate.partialIndex,
        partialColIndex: colCandidate.partialIndex,
        ratio: colCandidate.ratio,
        partsPerSheet: colCandidate.partsPerSheet,
        fractionLabel: `1/${colCandidate.partsPerSheet}`,
        savedSheets: colCandidate.savedSheets,
        colGroups: [{ partsPerSheet: colCandidate.partsPerSheet, sheets: colCandidate.sheets }],
        rowGroups: [],
      }
    : null;

  const planOnlyRow: EvaluatedPlan | null = rowCandidate
    ? {
        type: 'row',
        partialIndex: rowCandidate.partialIndex,
        partialRowIndex: rowCandidate.partialIndex,
        ratio: rowCandidate.ratio,
        partsPerSheet: rowCandidate.partsPerSheet,
        fractionLabel: `1/${rowCandidate.partsPerSheet}`,
        savedSheets: rowCandidate.savedSheets,
        colGroups: [],
        rowGroups: [{ partsPerSheet: rowCandidate.partsPerSheet, sheets: rowCandidate.sheets }],
      }
    : null;

  // Verifica se é possível agrupar simultaneamente a coluna da direita E a linha de baixo (Modo econômico duplo)
  let planBoth: EvaluatedPlan | null = null;
  if (colCandidate && rowCandidate) {
    const cIdx = colCandidate.partialIndex;
    const rIdx = rowCandidate.partialIndex;

    // Cenário A: O canto inferior direito pertence à coluna cIdx; a linha rIdx agrupa as partes restantes
    let planA: EvaluatedPlan | null = null;
    {
      const colSheetsA = sheets.filter((s) => s.col === cIdx && !s.isEmpty);
      const remRowSheetsA = sheets.filter((s) => s.row === rIdx && s.col !== cIdx && !s.isEmpty);

      if (colSheetsA.length >= 2 && remRowSheetsA.length >= 2) {
        const maxDrawHA = Math.max(...remRowSheetsA.map((s) => s.drawH));
        const cellHA = maxDrawHA + 2 * config.marginCm;
        const maxFitHA = Math.floor((page.height + 0.001) / cellHA);
        const rowFitA = Math.min(4, remRowSheetsA.length, Math.max(2, maxFitHA));

        if (rowFitA >= 2 && maxFitHA >= 2) {
          const colSavedA = colSheetsA.length - Math.ceil(colSheetsA.length / colCandidate.partsPerSheet);
          const rowSavedA = remRowSheetsA.length - Math.ceil(remRowSheetsA.length / rowFitA);
          const totalSavedA = colSavedA + rowSavedA;

          if (colSavedA >= 1 && rowSavedA >= 1) {
            const frac =
              colCandidate.partsPerSheet === rowFitA
                ? `1/${colCandidate.partsPerSheet} (col. e lin.)`
                : `1/${colCandidate.partsPerSheet} col. + 1/${rowFitA} lin.`;

            planA = {
              type: 'both',
              partialIndex: cIdx,
              partialColIndex: cIdx,
              partialRowIndex: rIdx,
              ratio: Math.min(colCandidate.ratio, rowCandidate.ratio),
              partsPerSheet: Math.max(colCandidate.partsPerSheet, rowFitA),
              fractionLabel: frac,
              savedSheets: totalSavedA,
              colGroups: [{ partsPerSheet: colCandidate.partsPerSheet, sheets: colSheetsA }],
              rowGroups: [{ partsPerSheet: rowFitA, sheets: remRowSheetsA }],
            };
          }
        }
      }
    }

    // Cenário B: O canto inferior direito pertence à linha rIdx; a coluna cIdx agrupa as partes restantes
    let planB: EvaluatedPlan | null = null;
    {
      const rowSheetsB = sheets.filter((s) => s.row === rIdx && !s.isEmpty);
      const remColSheetsB = sheets.filter((s) => s.col === cIdx && s.row !== rIdx && !s.isEmpty);

      if (rowSheetsB.length >= 2 && remColSheetsB.length >= 2) {
        const maxDrawWB = Math.max(...remColSheetsB.map((s) => s.drawW));
        const cellWB = maxDrawWB + 2 * config.marginCm;
        const maxFitWB = Math.floor((page.width + 0.001) / cellWB);
        const colFitB = Math.min(4, remColSheetsB.length, Math.max(2, maxFitWB));

        if (colFitB >= 2 && maxFitWB >= 2) {
          const rowSavedB = rowSheetsB.length - Math.ceil(rowSheetsB.length / rowCandidate.partsPerSheet);
          const colSavedB = remColSheetsB.length - Math.ceil(remColSheetsB.length / colFitB);
          const totalSavedB = rowSavedB + colSavedB;

          if (rowSavedB >= 1 && colSavedB >= 1) {
            const frac =
              colFitB === rowCandidate.partsPerSheet
                ? `1/${colFitB} (col. e lin.)`
                : `1/${colFitB} col. + 1/${rowCandidate.partsPerSheet} lin.`;

            planB = {
              type: 'both',
              partialIndex: cIdx,
              partialColIndex: cIdx,
              partialRowIndex: rIdx,
              ratio: Math.min(colCandidate.ratio, rowCandidate.ratio),
              partsPerSheet: Math.max(colFitB, rowCandidate.partsPerSheet),
              fractionLabel: frac,
              savedSheets: totalSavedB,
              colGroups: [{ partsPerSheet: colFitB, sheets: remColSheetsB }],
              rowGroups: [{ partsPerSheet: rowCandidate.partsPerSheet, sheets: rowSheetsB }],
            };
          }
        }
      }
    }

    // Escolhe o melhor plano duplo entre Cenário A e Cenário B
    if (planA && planB) {
      planBoth = planA.savedSheets >= planB.savedSheets ? planA : planB;
    } else {
      planBoth = planA || planB;
    }
  }

  // Define o melhor plano global:
  // Se o plano duplo existir e economizar pelo menos tanto quanto os planos simples, dá prioridade ao plano duplo
  let bestPlan: EvaluatedPlan | null = null;
  if (planBoth && planBoth.savedSheets >= Math.max(planOnlyCol?.savedSheets ?? 0, planOnlyRow?.savedSheets ?? 0)) {
    bestPlan = planBoth;
  } else if (planOnlyCol && planOnlyRow) {
    bestPlan = planOnlyCol.savedSheets >= planOnlyRow.savedSheets ? planOnlyCol : planOnlyRow;
  } else {
    bestPlan = planOnlyCol || planOnlyRow;
  }

  if (!bestPlan) {
    return {
      canEconomize: false,
      type: null,
      partsPerSheet: 2,
      partialIndex: -1,
      ratio: 1,
      fractionLabel: '1/2',
      savedSheets: 0,
      originalNonEmptySheets: nonEmptySheets,
      optimizedNonEmptySheets: nonEmptySheets,
      groups: [],
      sheetPageMap: fallbackMap,
    };
  }

  const sheetPageMap = new Map<
    string,
    {
      pageNumber: number;
      partIndex?: number;
      totalParts?: number;
      isCombined: boolean;
      badgeText: string;
    }
  >();

  // Numera as páginas na ordem natural da grade (linha por linha, coluna por coluna)
  // para que as partes econômicas na última coluna/linha mantenham a numeração sequencial correta
  let naturalCounter = 1;
  for (const s of sheets) {
    if (!s.isEmpty) {
      sheetPageMap.set(`${s.col}-${s.row}`, {
        pageNumber: naturalCounter,
        isCombined: false,
        badgeText: String(naturalCounter),
      });
      naturalCounter++;
    }
  }

  const groups: PosterSavingsGroup[] = [];
  let physicalPdfSheet = 1;

  // Processa colGroups
  for (const cg of bestPlan.colGroups) {
    for (let i = 0; i < cg.sheets.length; i += cg.partsPerSheet) {
      const chunk = cg.sheets.slice(i, i + cg.partsPerSheet);
      const currentPhysicalSheet = physicalPdfSheet++;
      const groupItems: PosterSavingsGroupItem[] = [];

      chunk.forEach((s, idx) => {
        const mapped = sheetPageMap.get(`${s.col}-${s.row}`)!;
        mapped.isCombined = true;
        mapped.partIndex = idx;
        mapped.totalParts = chunk.length;

        groupItems.push({
          col: s.col,
          row: s.row,
          sheetIndex: s.sheetIndex,
          partIndex: idx,
          totalParts: chunk.length,
          pageNumber: mapped.pageNumber,
          cropX: s.cropX,
          cropY: s.cropY,
          cropW: s.cropW,
          cropH: s.cropH,
          drawW: s.drawW,
          drawH: s.drawH,
        });
      });

      groups.push({
        pageNumber: currentPhysicalSheet,
        type: 'col',
        partsPerSheet: cg.partsPerSheet,
        items: groupItems,
      });
    }
  }

  // Processa rowGroups
  for (const rg of bestPlan.rowGroups) {
    for (let i = 0; i < rg.sheets.length; i += rg.partsPerSheet) {
      const chunk = rg.sheets.slice(i, i + rg.partsPerSheet);
      const currentPhysicalSheet = physicalPdfSheet++;
      const groupItems: PosterSavingsGroupItem[] = [];

      chunk.forEach((s, idx) => {
        const mapped = sheetPageMap.get(`${s.col}-${s.row}`)!;
        mapped.isCombined = true;
        mapped.partIndex = idx;
        mapped.totalParts = chunk.length;

        groupItems.push({
          col: s.col,
          row: s.row,
          sheetIndex: s.sheetIndex,
          partIndex: idx,
          totalParts: chunk.length,
          pageNumber: mapped.pageNumber,
          cropX: s.cropX,
          cropY: s.cropY,
          cropW: s.cropW,
          cropH: s.cropH,
          drawW: s.drawW,
          drawH: s.drawH,
        });
      });

      groups.push({
        pageNumber: currentPhysicalSheet,
        type: 'row',
        partsPerSheet: rg.partsPerSheet,
        items: groupItems,
      });
    }
  }

  const regularSheets = sheets.filter(
    (s) => !s.isEmpty && !sheetPageMap.get(`${s.col}-${s.row}`)?.isCombined
  );
  const optimizedNonEmptySheets = regularSheets.length + groups.length;

  return {
    canEconomize: true,
    type: bestPlan.type,
    partialIndex: bestPlan.partialIndex,
    partialColIndex: bestPlan.partialColIndex,
    partialRowIndex: bestPlan.partialRowIndex,
    ratio: bestPlan.ratio,
    partsPerSheet: bestPlan.partsPerSheet,
    fractionLabel: bestPlan.fractionLabel,
    savedSheets: bestPlan.savedSheets,
    originalNonEmptySheets: nonEmptySheets,
    optimizedNonEmptySheets,
    groups,
    sheetPageMap,
  };
}

export function calculateMontagemDimensions(
  config: MontagemConfig,
  imgW?: number,
  imgH?: number,
  customAspect?: number
): {
  cardW: number;
  cardH: number;
  cardWMm: number;
  cardHMm: number;
  slotW: number;
  slotH: number;
  slotWMm: number;
  slotHMm: number;
  areaW: number;
  areaH: number;
  spacing: number;
  pageW: number;
  pageH: number;
  totalCards: number;
  quantity: number;
  cardRotated: boolean;
  isMixed: boolean;
  slots: PlacedCardSlot[];
} {
  // O modo montagem mantém a folha A4 SEMPRE no modo retrato (vertical)
  const page = getPageDimensions('vertical');
  const cardRotated = Boolean(config.cardRotated);

  // Dimensions in mm
  const pageWMm = Math.round(page.width * 10);
  const pageHMm = Math.round(page.height * 10);
  const marginMm = 4; // 0.4 cm fixo
  const areaWMm = Math.max(10, pageWMm - marginMm * 2);
  const areaHMm = Math.max(10, pageHMm - marginMm * 2);
  const spacingCm = config.spacingCm !== undefined ? config.spacingCm : (config.cardSpacing ? 0.2 : 0.1);
  const spacingMm = Math.max(0, Math.round(spacingCm * 10));

  // Se o empacotamento misto estiver ativo e houver slots definidos
  if (config.mixedLayout && config.mixedSlots && config.mixedSlots.length > 0) {
    const firstSlot = config.mixedSlots[0];
    let cardWCm = config.cardWidthCm;
    let cardHCm = config.cardHeightCm;
    if (!cardWCm || !cardHCm || cardWCm <= 0 || cardHCm <= 0) {
      if (firstSlot.rotated) {
        cardWCm = Math.min(firstSlot.w, firstSlot.h);
        cardHCm = Math.max(firstSlot.w, firstSlot.h);
      } else {
        cardWCm = Math.min(firstSlot.w, firstSlot.h);
        cardHCm = Math.max(firstSlot.w, firstSlot.h);
      }
    }

    const currentS = spacingMm / 10;
    let effectiveSlots: PlacedCardSlot[];

    if (!config.manualSize) {
      // Quando selecionada a partir de uma grade pré-calculada, preserva exatamente os slots da grade
      effectiveSlots = config.mixedSlots;
    } else {
      const targetSlotsCount = config.mixedSlots.length;
      // Reorganiza os slots usando o novo espaçamento 'currentS'
      let reorg = reorganizeMontagemForCardSize(cardWCm, cardHCm, true, currentS);
      effectiveSlots = reorg.mixedSlots && reorg.mixedSlots.length > 0
        ? reorg.mixedSlots
        : config.mixedSlots;
    }

    const cardWMm = Math.round(cardWCm * 10);
    const cardHMm = Math.round(cardHCm * 10);
    const quantity = Math.max(1, config.quantity ?? 1);

    // Garante que os slots são preenchidos sempre de cima para baixo
    // "E ao ir adicionando, ir preenchendo a parte de cima da folha, pois se nao precisar imprimir a folha toda, só vai usar uma parte da folha"
    const sortedSlots = [...effectiveSlots].sort((a, b) => {
      const rowThreshold = Math.min(a.h, b.h) * 0.35;
      if (Math.abs(a.y - b.y) > rowThreshold) {
        return a.y - b.y;
      }
      return a.x - b.x;
    });

    return {
      cardW: cardWCm,
      cardH: cardHCm,
      cardWMm,
      cardHMm,
      slotW: cardWCm,
      slotH: cardHCm,
      slotWMm: cardWMm,
      slotHMm: cardHMm,
      areaW: areaWMm / 10,
      areaH: areaHMm / 10,
      spacing: currentS,
      pageW: page.width,
      pageH: page.height,
      totalCards: sortedSlots.length,
      quantity,
      cardRotated,
      isMixed: true,
      slots: sortedSlots,
    };
  }

  const fH = Math.max(1, config.fH);
  const fV = Math.max(1, config.fV);

  // Espaço máximo disponível para as células (slots) na folha retrato
  const availWMm = Math.max(1, areaWMm - spacingMm * (fH - 1));
  const availHMm = Math.max(1, areaHMm - spacingMm * (fV - 1));
  const maxSlotWMm = availWMm / fH;
  const maxSlotHMm = availHMm / fV;

  let cardWMm: number;
  let cardHMm: number;

  const hasImage = !!(imgW && imgH && imgW > 0 && imgH > 0);
  const defaultSlotAspect = cardRotated ? (maxSlotHMm / maxSlotWMm) : (maxSlotWMm / maxSlotHMm);
  const aspect = customAspect ?? config.customAspect ?? (hasImage ? (imgW! / imgH!) : defaultSlotAspect);

  if (config.manualSize && config.cardWidthCm > 0 && config.cardHeightCm > 0) {
    const userWMm = config.cardWidthCm * 10;
    const userHMm = config.cardHeightCm * 10;
    if (cardRotated) {
      const scale = Math.min(1, maxSlotWMm / userHMm, maxSlotHMm / userWMm);
      cardWMm = userWMm * scale;
      cardHMm = userHMm * scale;
    } else {
      const scale = Math.min(1, maxSlotWMm / userWMm, maxSlotHMm / userHMm);
      cardWMm = userWMm * scale;
      cardHMm = userHMm * scale;
    }
  } else {
    if (!cardRotated) {
      // Cartão em pé (sem rotação): largura do cartão alinhada à largura do slot
      if (maxSlotWMm / aspect <= maxSlotHMm) {
        cardWMm = maxSlotWMm;
        cardHMm = cardWMm / aspect;
      } else {
        cardHMm = maxSlotHMm;
        cardWMm = cardHMm * aspect;
      }
    } else {
      // Cartão virado 90 graus: largura do cartão alinhada à altura do slot (maxSlotHMm),
      // e altura do cartão alinhada à largura do slot (maxSlotWMm)
      if (maxSlotHMm / aspect <= maxSlotWMm) {
        cardWMm = maxSlotHMm;
        cardHMm = cardWMm / aspect;
      } else {
        cardHMm = maxSlotWMm;
        cardWMm = cardHMm * aspect;
      }
    }
  }

  // Limite de segurança para não ultrapassar o slot
  if (!cardRotated) {
    cardWMm = Math.min(cardWMm, maxSlotWMm);
    cardHMm = Math.min(cardHMm, maxSlotHMm);
  } else {
    cardWMm = Math.min(cardWMm, maxSlotHMm);
    cardHMm = Math.min(cardHMm, maxSlotWMm);
  }

  cardWMm = Math.max(5, Math.floor(cardWMm * 10) / 10);
  cardHMm = Math.max(5, Math.floor(cardHMm * 10) / 10);

  // Tamanho real do cartão em cm
  const cardWCm = Math.round((cardWMm / 10) * 100) / 100;
  const cardHCm = Math.round((cardHMm / 10) * 100) / 100;

  // Dimensões do slot desenhado na página A4 retrato (em mm e cm)
  const slotWMm = cardRotated ? cardHMm : cardWMm;
  const slotHMm = cardRotated ? cardWMm : cardHMm;
  const slotWCm = cardRotated ? cardHCm : cardWCm;
  const slotHCm = cardRotated ? cardWCm : cardHCm;

  const capacity = fH * fV;
  const quantity = Math.max(1, config.quantity ?? 1);

  // Gera slots da grade uniforme
  const slots: PlacedCardSlot[] = [];
  const sCm = spacingMm / 10;
  for (let r = 0; r < fV; r++) {
    for (let c = 0; c < fH; c++) {
      slots.push({
        x: Math.round(c * (slotWCm + sCm) * 100) / 100,
        y: Math.round(r * (slotHCm + sCm) * 100) / 100,
        w: slotWCm,
        h: slotHCm,
        rotated: cardRotated,
      });
    }
  }

  return {
    cardW: cardWCm,
    cardH: cardHCm,
    cardWMm,
    cardHMm,
    slotW: slotWCm,
    slotH: slotHCm,
    slotWMm,
    slotHMm,
    areaW: areaWMm / 10,
    areaH: areaHMm / 10,
    spacing: spacingMm / 10,
    pageW: page.width,
    pageH: page.height,
    totalCards: capacity,
    quantity,
    cardRotated,
    isMixed: false,
    slots,
  };
}

export function isValidMontagemGridCount(n: number): boolean {
  if (n <= 0) return false;
  if (n === 1 || n === 2 || n === 3) return true;
  for (let c = 2; c <= 12; c++) {
    if (n % c === 0) {
      const r = n / c;
      if (r >= 2 && r <= 12 && Math.max(c / r, r / c) <= 2.2) {
        return true;
      }
    }
  }
  return false;
}

export function isValidPosterGridCount(n: number): boolean {
  if (n <= 0) return false;
  if (n === 1 || n === 2 || n === 3) return true;
  for (let c = 2; c * c <= n; c++) {
    if (n % c === 0) {
      const r = n / c;
      if (r >= 2 && Math.max(c / r, r / c) <= 2.5) {
        return true;
      }
    }
  }
  return false;
}

export function isValidGridCount(n: number): boolean {
  return isValidPosterGridCount(n);
}

export interface OptimalMontagemGrid {
  capacity: number;
  fH: number;
  fV: number;
  orientation: Orientation;
  cardW: number;
  cardH: number;
  cardRotated?: boolean;
  isMixed?: boolean;
  slots?: PlacedCardSlot[];
  label?: string;
}

// Cache para resultados de getAllValidMontagemGrids para performance instantânea
const montagemGridsCache = new Map<string, OptimalMontagemGrid[]>();

/**
 * Gera todas as grades válidas e otimizadas para uma imagem no modo montagem.
 * Quando mixedLayout está desmarcado, gera grades uniformes (com rotação automática de 90° se mais vantajoso).
 * Quando mixedLayout está marcado, combina cartões na horizontal e vertical (empacotamento misto),
 * maximizando o aproveitamento do papel e criando combinações com novos tamanhos e quantidades.
 */
export function getAllValidMontagemGrids(
  imgW: number,
  imgH: number,
  currentConfig: MontagemConfig,
  customAspect?: number
): OptimalMontagemGrid[] {
  const effectiveAspect = customAspect ?? currentConfig.customAspect ?? (imgW > 0 && imgH > 0 ? imgW / imgH : 1);
  const spacingCm = currentConfig.spacingCm !== undefined ? currentConfig.spacingCm : (currentConfig.cardSpacing ? 0.2 : 0.1);
  const spacingMm = Math.max(0, Math.round(spacingCm * 10));
  const sCm = spacingMm / 10;

  const cacheKey = `${imgW}_${imgH}_${Boolean(currentConfig.mixedLayout)}_${sCm}_${Math.round(effectiveAspect * 1000) / 1000}`;
  if (montagemGridsCache.has(cacheKey)) {
    return montagemGridsCache.get(cacheKey)!;
  }

  const rotationOptions: boolean[] = [false, true];
  const uniformCandidates: OptimalMontagemGrid[] = [];

  // Folha SEMPRE retrato (20.2 x 28.9 cm útil)
  const page = getPageDimensions('vertical');
  const areaWMm = Math.round((page.width - 0.4 * 2) * 10);
  const areaHMm = Math.round((page.height - 0.4 * 2) * 10);
  const usablePageArea = (areaWMm / 10) * (areaHMm / 10);

  // 1. Gera grades uniformes (somente cartões em pé ou somente deitados)
  for (const isRotated of rotationOptions) {
    for (let c = 1; c <= 12; c++) {
      for (let r = 1; r <= 12; r++) {
        const total = c * r;
        if (total > 100) continue;
        if (total >= 4 && (c === 1 || r === 1)) continue;
        if (Math.max(c / r, r / c) > 2.5) continue;

        const testConfig: MontagemConfig = {
          ...currentConfig,
          fH: c,
          fV: r,
          orientation: 'vertical',
          cardRotated: isRotated,
          manualSize: false,
          customAspect: effectiveAspect,
          mixedLayout: false,
          mixedSlots: undefined,
        };

        const dims = calculateMontagemDimensions(testConfig, imgW, imgH, effectiveAspect);
        if (dims.cardW < 0.5 || dims.cardH < 0.5) continue;

        const maxCols = Math.floor((areaWMm + spacingMm + 0.05) / (dims.slotWMm + spacingMm));
        const maxRows = Math.floor((areaHMm + spacingMm + 0.05) / (dims.slotHMm + spacingMm));

        if (total > 1 && (maxCols > c || maxRows > r)) {
          continue;
        }

        const totalCardArea = total * dims.cardW * dims.cardH;
        const fillRatio = totalCardArea / usablePageArea;
        if (total > 1 && fillRatio < 0.45) continue;

        uniformCandidates.push({
          capacity: total,
          fH: c,
          fV: r,
          orientation: 'vertical',
          cardW: dims.cardW,
          cardH: dims.cardH,
          cardRotated: isRotated,
          isMixed: false,
          slots: dims.slots,
          label: `${total} (${c}x${r})`,
        });
      }
    }
  }

  // Agrupa uniformes por tamanho do cartão
  const uniformSizeMap = new Map<string, OptimalMontagemGrid>();
  for (const cand of uniformCandidates) {
    const key = `${Math.round(cand.cardW * 20) / 20}x${Math.round(cand.cardH * 20) / 20}_${cand.cardRotated ? 'rot' : 'norm'}`;
    const existing = uniformSizeMap.get(key);
    if (!existing) {
      uniformSizeMap.set(key, cand);
    } else {
      if (cand.capacity > existing.capacity) {
        uniformSizeMap.set(key, cand);
      } else if (cand.capacity === existing.capacity) {
        const areaCand = cand.cardW * cand.cardH;
        const areaExist = existing.cardW * existing.cardH;
        if (areaCand > areaExist) {
          uniformSizeMap.set(key, cand);
        }
      }
    }
  }

  // Desduplica uniformes por capacidade (mantendo o maior tamanho de cartão)
  const uniformCapMap = new Map<number, OptimalMontagemGrid>();
  for (const g of uniformSizeMap.values()) {
    const existing = uniformCapMap.get(g.capacity);
    if (!existing) {
      uniformCapMap.set(g.capacity, g);
    } else {
      const areaG = g.cardW * g.cardH;
      const areaEx = existing.cardW * existing.cardH;
      if (areaG > areaEx + 0.05) {
        uniformCapMap.set(g.capacity, g);
      } else if (Math.abs(areaG - areaEx) <= 0.05) {
        if (!g.cardRotated && existing.cardRotated) {
          uniformCapMap.set(g.capacity, g);
        }
      }
    }
  }

  const sortedUniformGrids = Array.from(uniformCapMap.values());
  sortedUniformGrids.sort((a, b) => a.capacity - b.capacity);

  const uniformResult: OptimalMontagemGrid[] = [];
  let prevArea = Infinity;
  for (const g of sortedUniformGrids) {
    const area = g.cardW * g.cardH;
    if (area < prevArea - 0.01) {
      uniformResult.push(g);
      prevArea = area;
    }
  }

  // Se o empacotamento misto não estiver ativado, retorna apenas as grades uniformes
  if (!currentConfig.mixedLayout) {
    montagemGridsCache.set(cacheKey, uniformResult);
    return uniformResult;
  }

  // 2. GERAÇÃO DE COMBINAÇÕES MISTAS (Vertical e Horizontal na mesma folha)
  const mixedCandidates: OptimalMontagemGrid[] = [];
  const W = areaWMm / 10; // largura útil em cm (20.2 cm)
  const H = areaHMm / 10; // altura útil em cm (28.9 cm)
  const A = effectiveAspect;

  // Helper para adicionar candidato misto válido com ordenação de cima para baixo
  const tryAddMixed = (
    slots: PlacedCardSlot[],
    cardW: number,
    cardH: number,
    labelDesc: string
  ) => {
    if (cardW < 0.8 || cardH < 0.8) return;

    const total = slots.length;
    if (total < 2 || total > 100) return;

    const countV = slots.filter((s) => !s.rotated).length;
    const countH = slots.filter((s) => s.rotated).length;
    if (countV === 0 || countH === 0) return; // Deve conter ambos para ser misto

    // Verifica se todos os slots cabem dentro da área útil
    for (const slot of slots) {
      if (slot.x + slot.w > W + 0.02 || slot.y + slot.h > H + 0.02) {
        return;
      }
    }

    const totalArea = total * cardW * cardH;
    const fillRatio = totalArea / usablePageArea;
    if (fillRatio < 0.40) return;

    // Ordena rigorosamente os slots de cima para baixo na folha
    // "E ao ir adicionando, ir preenchendo a parte de cima da folha, pois se nao precisar imprimir a folha toda, só vai usar uma parte da folha"
    const sortedSlots = [...slots].sort((a, b) => {
      const rowThreshold = Math.min(a.h, b.h) * 0.35;
      if (Math.abs(a.y - b.y) > rowThreshold) {
        return a.y - b.y;
      }
      return a.x - b.x;
    });

    mixedCandidates.push({
      capacity: total,
      fH: Math.max(...sortedSlots.map((s) => Math.round(s.x / (Math.min(cardW, cardH) + sCm)))) + 1,
      fV: Math.max(...sortedSlots.map((s) => Math.round(s.y / (Math.min(cardW, cardH) + sCm)))) + 1,
      orientation: 'vertical',
      cardW: Math.round(cardW * 100) / 100,
      cardH: Math.round(cardH * 100) / 100,
      cardRotated: false,
      isMixed: true,
      slots: sortedSlots,
      label: `${total} (${countV}+${countH})`,
    });
  };

  // --- PADRÃO 1A: Topo Vertical + Base Horizontal (Totalmente preenchidos sem buracos) ---
  for (let r1 = 1; r1 <= 6; r1++) {
    for (let r2 = 1; r2 <= 6; r2++) {
      for (let c1 = 1; c1 <= 6; c1++) {
        for (let c2 = 1; c2 <= 6; c2++) {
          const maxH = Math.min(
            (H - (r1 + r2 - 1) * sCm) / (r1 + r2 * A),
            (W - (c1 - 1) * sCm) / (c1 * A),
            (W - (c2 - 1) * sCm) / c2
          );
          if (maxH < 0.8) continue;
          const cardH = Math.floor(maxH * 100) / 100;
          const cardW = Math.floor(cardH * A * 100) / 100;
          if (cardW < 0.8 || cardH < 0.8) continue;

          // Validação de empacotamento completo (não deixa espaço vazio onde caberia mais um cartão)
          const colsTop = Math.floor((W + sCm + 0.001) / (cardW + sCm));
          if (colsTop !== c1) continue;
          const topH = r1 * cardH + (r1 - 1) * sCm;
          const remH = H - topH - sCm;
          const rowsBot = Math.floor((remH + sCm + 0.001) / (cardW + sCm));
          if (rowsBot !== r2) continue;
          const colsBot = Math.floor((W + sCm + 0.001) / (cardH + sCm));
          if (colsBot !== c2) continue;

          const slots: PlacedCardSlot[] = [];
          for (let r = 0; r < r1; r++) {
            for (let c = 0; c < c1; c++) {
              slots.push({
                x: Math.round(c * (cardW + sCm) * 100) / 100,
                y: Math.round(r * (cardH + sCm) * 100) / 100,
                w: cardW,
                h: cardH,
                rotated: false,
              });
            }
          }
          const yStart = topH + sCm;
          for (let r = 0; r < r2; r++) {
            for (let c = 0; c < c2; c++) {
              slots.push({
                x: Math.round(c * (cardH + sCm) * 100) / 100,
                y: Math.round((yStart + r * (cardW + sCm)) * 100) / 100,
                w: cardH,
                h: cardW,
                rotated: true,
              });
            }
          }
          tryAddMixed(slots, cardW, cardH, 'Sup V + Inf H');
        }
      }
    }
  }

  // --- PADRÃO 1B: Topo Horizontal + Base Vertical (Totalmente preenchidos sem buracos) ---
  for (let r1 = 1; r1 <= 6; r1++) {
    for (let r2 = 1; r2 <= 6; r2++) {
      for (let c1 = 1; c1 <= 6; c1++) {
        for (let c2 = 1; c2 <= 6; c2++) {
          const maxH = Math.min(
            (H - (r1 + r2 - 1) * sCm) / (r1 * A + r2),
            (W - (c1 - 1) * sCm) / c1,
            (W - (c2 - 1) * sCm) / (c2 * A)
          );
          if (maxH < 0.8) continue;
          const cardH = Math.floor(maxH * 100) / 100;
          const cardW = Math.floor(cardH * A * 100) / 100;
          if (cardW < 0.8 || cardH < 0.8) continue;

          const colsTop = Math.floor((W + sCm + 0.001) / (cardH + sCm));
          if (colsTop !== c1) continue;
          const topH = r1 * cardW + (r1 - 1) * sCm;
          const remH = H - topH - sCm;
          const rowsBot = Math.floor((remH + sCm + 0.001) / (cardH + sCm));
          if (rowsBot !== r2) continue;
          const colsBot = Math.floor((W + sCm + 0.001) / (cardW + sCm));
          if (colsBot !== c2) continue;

          const slots: PlacedCardSlot[] = [];
          for (let r = 0; r < r1; r++) {
            for (let c = 0; c < c1; c++) {
              slots.push({
                x: Math.round(c * (cardH + sCm) * 100) / 100,
                y: Math.round(r * (cardW + sCm) * 100) / 100,
                w: cardH,
                h: cardW,
                rotated: true,
              });
            }
          }
          const yStart = topH + sCm;
          for (let r = 0; r < r2; r++) {
            for (let c = 0; c < c2; c++) {
              slots.push({
                x: Math.round(c * (cardW + sCm) * 100) / 100,
                y: Math.round((yStart + r * (cardH + sCm)) * 100) / 100,
                w: cardW,
                h: cardH,
                rotated: false,
              });
            }
          }
          tryAddMixed(slots, cardW, cardH, 'Sup H + Inf V');
        }
      }
    }
  }

  // --- PADRÃO 2A: Esquerda Vertical + Direita Horizontal (Totalmente preenchidos) ---
  for (let c1 = 1; c1 <= 6; c1++) {
    for (let c2 = 1; c2 <= 6; c2++) {
      for (let r1 = 1; r1 <= 6; r1++) {
        for (let r2 = 1; r2 <= 6; r2++) {
          const maxH = Math.min(
            (W - (c1 + c2 - 1) * sCm) / (c1 * A + c2),
            (H - (r1 - 1) * sCm) / r1,
            (H - (r2 - 1) * sCm) / (r2 * A)
          );
          if (maxH < 0.8) continue;
          const cardH = Math.floor(maxH * 100) / 100;
          const cardW = Math.floor(cardH * A * 100) / 100;
          if (cardW < 0.8 || cardH < 0.8) continue;

          const rowsLeft = Math.floor((H + sCm + 0.001) / (cardH + sCm));
          if (rowsLeft !== r1) continue;
          const leftW = c1 * cardW + (c1 - 1) * sCm;
          const remW = W - leftW - sCm;
          const colsRight = Math.floor((remW + sCm + 0.001) / (cardH + sCm));
          if (colsRight !== c2) continue;
          const rowsRight = Math.floor((H + sCm + 0.001) / (cardW + sCm));
          if (rowsRight !== r2) continue;

          const slots: PlacedCardSlot[] = [];
          for (let r = 0; r < r1; r++) {
            for (let c = 0; c < c1; c++) {
              slots.push({
                x: Math.round(c * (cardW + sCm) * 100) / 100,
                y: Math.round(r * (cardH + sCm) * 100) / 100,
                w: cardW,
                h: cardH,
                rotated: false,
              });
            }
          }
          const xStart = leftW + sCm;
          for (let r = 0; r < r2; r++) {
            for (let c = 0; c < c2; c++) {
              slots.push({
                x: Math.round((xStart + c * (cardH + sCm)) * 100) / 100,
                y: Math.round(r * (cardW + sCm) * 100) / 100,
                w: cardH,
                h: cardW,
                rotated: true,
              });
            }
          }
          tryAddMixed(slots, cardW, cardH, 'Esq V + Dir H');
        }
      }
    }
  }

  // --- PADRÃO 2B: Esquerda Horizontal + Direita Vertical (Totalmente preenchidos) ---
  for (let c1 = 1; c1 <= 6; c1++) {
    for (let c2 = 1; c2 <= 6; c2++) {
      for (let r1 = 1; r1 <= 6; r1++) {
        for (let r2 = 1; r2 <= 6; r2++) {
          const maxH = Math.min(
            (W - (c1 + c2 - 1) * sCm) / (c1 + c2 * A),
            (H - (r1 - 1) * sCm) / (r1 * A),
            (H - (r2 - 1) * sCm) / r2
          );
          if (maxH < 0.8) continue;
          const cardH = Math.floor(maxH * 100) / 100;
          const cardW = Math.floor(cardH * A * 100) / 100;
          if (cardW < 0.8 || cardH < 0.8) continue;

          const rowsLeft = Math.floor((H + sCm + 0.001) / (cardW + sCm));
          if (rowsLeft !== r1) continue;
          const leftW = c1 * cardH + (c1 - 1) * sCm;
          const remW = W - leftW - sCm;
          const colsRight = Math.floor((remW + sCm + 0.001) / (cardW + sCm));
          if (colsRight !== c2) continue;
          const rowsRight = Math.floor((H + sCm + 0.001) / (cardH + sCm));
          if (rowsRight !== r2) continue;

          const slots: PlacedCardSlot[] = [];
          for (let r = 0; r < r1; r++) {
            for (let c = 0; c < c1; c++) {
              slots.push({
                x: Math.round(c * (cardH + sCm) * 100) / 100,
                y: Math.round(r * (cardW + sCm) * 100) / 100,
                w: cardH,
                h: cardW,
                rotated: true,
              });
            }
          }
          const xStart = leftW + sCm;
          for (let r = 0; r < r2; r++) {
            for (let c = 0; c < c2; c++) {
              slots.push({
                x: Math.round((xStart + c * (cardW + sCm)) * 100) / 100,
                y: Math.round(r * (cardH + sCm) * 100) / 100,
                w: cardW,
                h: cardH,
                rotated: false,
              });
            }
          }
          tryAddMixed(slots, cardW, cardH, 'Esq H + Dir V');
        }
      }
    }
  }

  // 3. SELEÇÃO DA MELHOR GRADE POR QUANTIDADE DE CARTÕES
  // "No modo misto, remover grades com a mesma quantidade de cartoes, deixar a que deixa o cartão maior."
  // "O modo misto está pulando algumas combinações do modo normal."
  const bestByCapacity = new Map<number, OptimalMontagemGrid>();

  // Começa com TODAS as grades do modo normal (uniformes) para garantir que NENHUMA seja pulada
  for (const u of uniformResult) {
    bestByCapacity.set(u.capacity, u);
  }

  // Compara com os candidatos mistos
  for (const cand of mixedCandidates) {
    const existing = bestByCapacity.get(cand.capacity);
    const areaCand = cand.cardW * cand.cardH;

    if (!existing) {
      // Capacidade nova que não existia no modo normal (ex: 3, 5, 7, etc.)
      const nextUniform = uniformResult.find((u) => u.capacity > cand.capacity);
      const prevUniform = [...uniformResult].reverse().find((u) => u.capacity < cand.capacity);

      const okUpper = !prevUniform || areaCand <= (prevUniform.cardW * prevUniform.cardH) * 1.05;
      const okLower = !nextUniform || areaCand >= (nextUniform.cardW * nextUniform.cardH) * 0.90;

      if (okUpper && okLower) {
        bestByCapacity.set(cand.capacity, cand);
      }
    } else {
      const areaExisting = existing.cardW * existing.cardH;
      // "remover grades com a mesma quantidade de cartoes, deixar a que deixa o cartão maior"
      // Só substitui a grade existente com a mesma quantidade se a mista deixar o cartão estritamente maior
      if (areaCand > areaExisting + 0.05) {
        bestByCapacity.set(cand.capacity, cand);
      }
    }
  }

  const normalCapacities = new Set(uniformResult.map((u) => u.capacity));

  // Remove apenas grades mistas subaproveitadas que deixam espaço vazio:
  // Se uma grade mista (que não existe no modo normal) tem praticamente o mesmo tamanho de cartão
  // de outra grade com mais cartões, descarta para evitar grades com buracos vazios.
  // Combinações do modo normal NUNCA são puladas!
  const rawList = Array.from(bestByCapacity.values());
  const dedupedList: OptimalMontagemGrid[] = [];
  for (const g of rawList) {
    if (normalCapacities.has(g.capacity)) {
      // Capacidades do modo normal SEMPRE são mantidas
      dedupedList.push(g);
      continue;
    }
    const areaG = g.cardW * g.cardH;
    const hasBetterFilledWithSameCard = rawList.some(
      (other) => other.capacity > g.capacity && Math.abs(other.cardW * other.cardH - areaG) <= 0.15
    );
    if (!hasBetterFilledWithSameCard) {
      dedupedList.push(g);
    }
  }

  // Ordena por quantidade crescente de cartões
  dedupedList.sort((a, b) => a.capacity - b.capacity);

  // Garante que NENHUMA grade do modo normal seja pulada,
  // e inclui grades mistas que mantêm coerência no tamanho do cartão
  const finalGrids: OptimalMontagemGrid[] = [];
  let prevCandidateArea = Infinity;
  for (const g of dedupedList) {
    const area = g.cardW * g.cardH;
    if (normalCapacities.has(g.capacity)) {
      finalGrids.push(g);
      prevCandidateArea = area;
    } else {
      if (area <= prevCandidateArea + 0.05) {
        finalGrids.push(g);
        prevCandidateArea = area;
      }
    }
  }

  montagemGridsCache.set(cacheKey, finalGrids);
  return finalGrids;
}

/**
 * Quando o usuário digita manualmente uma largura ou altura do cartão,
 * reorganiza a grade na folha A4 para empacotar o máximo de cartões possível.
 * Se o modo misto (aproveitamento máximo) estiver ativo, testa se combinações
 * de cartões em pé e deitados cabem em maior quantidade.
 */
export function reorganizeMontagemForCardSize(
  cardWCm: number,
  cardHCm: number,
  mixedLayout: boolean,
  spacingCm: number = 0.2
): {
  fH: number;
  fV: number;
  isMixed: boolean;
  mixedSlots?: PlacedCardSlot[];
  cardRotated?: boolean;
} {
  const page = getPageDimensions('vertical');
  const marginCm = MARGEM_FIXA_MONTAGEM; // 0.4 cm
  const areaWCm = page.width - marginCm * 2; // 20.2 cm
  const areaHCm = page.height - marginCm * 2; // 28.9 cm
  const s = Math.max(0, spacingCm);

  // 1. Uniforme (em pé: cardW x cardH)
  const colsV = Math.max(1, Math.floor((areaWCm + s + 0.001) / (cardWCm + s)));
  const rowsV = Math.max(1, Math.floor((areaHCm + s + 0.001) / (cardHCm + s)));
  const totalV = colsV * rowsV;

  // 2. Uniforme (rotacionado 90 graus: cardH x cardW)
  const colsH = Math.max(1, Math.floor((areaWCm + s + 0.001) / (cardHCm + s)));
  const rowsH = Math.max(1, Math.floor((areaHCm + s + 0.001) / (cardWCm + s)));
  const totalH = colsH * rowsH;

  let bestTotal = totalV;
  let bestFH = colsV;
  let bestFV = rowsV;
  let bestRotated = false;
  let bestMixedSlots: PlacedCardSlot[] | undefined = undefined;

  if (totalH > bestTotal) {
    bestTotal = totalH;
    bestFH = colsH;
    bestFV = rowsH;
    bestRotated = true;
  }

  if (mixedLayout) {
    // Padrão 1A: Topo Vertical (cardWCm x cardHCm) + Base Horizontal (cardHCm x cardWCm)
    for (let r1 = 1; r1 <= rowsV; r1++) {
      const usedH1 = r1 * (cardHCm + s);
      const remainingH = areaHCm - usedH1;
      if (remainingH < cardWCm) continue;
      const r2 = Math.floor((remainingH + s + 0.001) / (cardWCm + s));
      if (r2 < 1) continue;

      const total = r1 * colsV + r2 * colsH;
      if (total >= bestTotal) {
        const slots: PlacedCardSlot[] = [];
        for (let r = 0; r < r1; r++) {
          for (let c = 0; c < colsV; c++) {
            slots.push({
              x: Math.round(c * (cardWCm + s) * 100) / 100,
              y: Math.round(r * (cardHCm + s) * 100) / 100,
              w: cardWCm,
              h: cardHCm,
              rotated: false,
            });
          }
        }
        for (let r = 0; r < r2; r++) {
          for (let c = 0; c < colsH; c++) {
            slots.push({
              x: Math.round(c * (cardHCm + s) * 100) / 100,
              y: Math.round((usedH1 + r * (cardWCm + s)) * 100) / 100,
              w: cardHCm,
              h: cardWCm,
              rotated: true,
            });
          }
        }
        bestTotal = total;
        bestFH = Math.max(colsV, colsH);
        bestFV = r1 + r2;
        bestRotated = false;
        bestMixedSlots = slots;
      }
    }

    // Padrão 1B: Topo Horizontal (cardHCm x cardWCm) + Base Vertical (cardWCm x cardHCm)
    for (let r1 = 1; r1 <= rowsH; r1++) {
      const usedH1 = r1 * (cardWCm + s);
      const remainingH = areaHCm - usedH1;
      if (remainingH < cardHCm) continue;
      const r2 = Math.floor((remainingH + s + 0.001) / (cardHCm + s));
      if (r2 < 1) continue;

      const total = r1 * colsH + r2 * colsV;
      if (total >= bestTotal) {
        const slots: PlacedCardSlot[] = [];
        for (let r = 0; r < r1; r++) {
          for (let c = 0; c < colsH; c++) {
            slots.push({
              x: Math.round(c * (cardHCm + s) * 100) / 100,
              y: Math.round(r * (cardWCm + s) * 100) / 100,
              w: cardHCm,
              h: cardWCm,
              rotated: true,
            });
          }
        }
        for (let r = 0; r < r2; r++) {
          for (let c = 0; c < colsV; c++) {
            slots.push({
              x: Math.round(c * (cardWCm + s) * 100) / 100,
              y: Math.round((usedH1 + r * (cardHCm + s)) * 100) / 100,
              w: cardWCm,
              h: cardHCm,
              rotated: false,
            });
          }
        }
        bestTotal = total;
        bestFH = Math.max(colsH, colsV);
        bestFV = r1 + r2;
        bestRotated = false;
        bestMixedSlots = slots;
      }
    }

    // Padrão 2A: Esquerda Vertical (cardWCm x cardHCm) + Direita Horizontal (cardHCm x cardWCm)
    for (let c1 = 1; c1 <= colsV; c1++) {
      const usedW1 = c1 * (cardWCm + s);
      const remainingW = areaWCm - usedW1;
      if (remainingW < cardHCm) continue;
      const c2 = Math.floor((remainingW + s + 0.001) / (cardHCm + s));
      if (c2 < 1) continue;

      const total = c1 * rowsV + c2 * rowsH;
      if (total >= bestTotal) {
        const slots: PlacedCardSlot[] = [];
        for (let r = 0; r < rowsV; r++) {
          for (let c = 0; c < c1; c++) {
            slots.push({
              x: Math.round(c * (cardWCm + s) * 100) / 100,
              y: Math.round(r * (cardHCm + s) * 100) / 100,
              w: cardWCm,
              h: cardHCm,
              rotated: false,
            });
          }
        }
        for (let r = 0; r < rowsH; r++) {
          for (let c = 0; c < c2; c++) {
            slots.push({
              x: Math.round((usedW1 + c * (cardHCm + s)) * 100) / 100,
              y: Math.round(r * (cardWCm + s) * 100) / 100,
              w: cardHCm,
              h: cardWCm,
              rotated: true,
            });
          }
        }
        bestTotal = total;
        bestFH = c1 + c2;
        bestFV = Math.max(rowsV, rowsH);
        bestRotated = false;
        bestMixedSlots = slots;
      }
    }

    // Padrão 2B: Esquerda Horizontal (cardHCm x cardWCm) + Direita Vertical (cardWCm x cardHCm)
    for (let c1 = 1; c1 <= colsH; c1++) {
      const usedW1 = c1 * (cardHCm + s);
      const remainingW = areaWCm - usedW1;
      if (remainingW < cardWCm) continue;
      const c2 = Math.floor((remainingW + s + 0.001) / (cardWCm + s));
      if (c2 < 1) continue;

      const total = c1 * rowsH + c2 * rowsV;
      if (total >= bestTotal) {
        const slots: PlacedCardSlot[] = [];
        for (let r = 0; r < rowsH; r++) {
          for (let c = 0; c < c1; c++) {
            slots.push({
              x: Math.round(c * (cardHCm + s) * 100) / 100,
              y: Math.round(r * (cardWCm + s) * 100) / 100,
              w: cardHCm,
              h: cardWCm,
              rotated: true,
            });
          }
        }
        for (let r = 0; r < rowsV; r++) {
          for (let c = 0; c < c2; c++) {
            slots.push({
              x: Math.round((usedW1 + c * (cardWCm + s)) * 100) / 100,
              y: Math.round(r * (cardHCm + s) * 100) / 100,
              w: cardWCm,
              h: cardHCm,
              rotated: false,
            });
          }
        }
        bestTotal = total;
        bestFH = c1 + c2;
        bestFV = Math.max(rowsH, rowsV);
        bestRotated = false;
        bestMixedSlots = slots;
      }
    }
  }

  return {
    fH: bestFH,
    fV: bestFV,
    isMixed: Boolean(bestMixedSlots),
    mixedSlots: bestMixedSlots,
    cardRotated: bestRotated,
  };
}

export function findAdjacentMontagemGrid(
  currentCapacity: number,
  direction: 1 | -1,
  imgW: number,
  imgH: number,
  currentConfig: MontagemConfig,
  customAspect?: number
): OptimalMontagemGrid | null {
  const validGrids = getAllValidMontagemGrids(imgW, imgH, currentConfig, customAspect);
  if (validGrids.length === 0) return null;

  // Como cada quantidade de cartões agora é única (a de maior cartão), localiza diretamente pela capacidade
  let currentIndex = validGrids.findIndex((g) => g.capacity === currentCapacity);

  // Fallback: busca a capacidade mais próxima
  if (currentIndex === -1) {
    let bestDiff = Infinity;
    for (let i = 0; i < validGrids.length; i++) {
      const diff = Math.abs(validGrids[i].capacity - currentCapacity);
      if (diff < bestDiff) {
        bestDiff = diff;
        currentIndex = i;
      }
    }
  }

  if (currentIndex >= 0) {
    const targetIndex = currentIndex + direction;
    if (targetIndex >= 0 && targetIndex < validGrids.length) {
      return validGrids[targetIndex];
    }
    return null;
  }

  // Se não encontrou por índice, busca pelo próximo em capacidade
  if (direction > 0) {
    const next = validGrids.find((g) => g.capacity > currentCapacity);
    return next || null;
  } else {
    const prevList = validGrids.filter((g) => g.capacity < currentCapacity);
    return prevList.length > 0 ? prevList[prevList.length - 1] : null;
  }
}

export interface OrientationSuggestion {
  text: string;
  targetOrientation: Orientation;
  diff: number;
}

/**
 * Matches _atualizar_aviso_orientacao in Python
 */
export function getPosterOrientationSuggestion(
  widthCm: number,
  heightCm: number,
  orientation: Orientation,
  marginCm: number,
  currentPages: number
): OrientationSuggestion | null {
  if (widthCm <= 0 || heightCm <= 0) return null;
  const otherOrientation: Orientation = orientation === 'vertical' ? 'horizontal' : 'vertical';
  const otherPage = getPageDimensions(otherOrientation);
  const otherUsableW = Math.max(0.1, otherPage.width - marginCm * 2);
  const otherUsableH = Math.max(0.1, otherPage.height - marginCm * 2);
  const otherFH = Math.max(1, Math.ceil(widthCm / otherUsableW));
  const otherFV = Math.max(1, Math.ceil(heightCm / otherUsableH));

  let otherNonEmpty = 0;
  for (let r = 0; r < otherFV; r++) {
    for (let c = 0; c < otherFH; c++) {
      const parteW = Math.min(otherUsableW, widthCm - c * otherUsableW);
      const parteH = Math.min(otherUsableH, heightCm - r * otherUsableH);
      if (parteW > 0.01 && parteH > 0.01) {
        otherNonEmpty++;
      }
    }
  }

  if (otherNonEmpty < currentPages) {
    const diff = currentPages - otherNonEmpty;
    const nome = otherOrientation === 'horizontal' ? 'paisagem' : 'retrato';
    return {
      text: `Sugestão: mude para ${nome} para diminuir a quantidade de folhas (-${diff} ${diff === 1 ? 'folha' : 'folhas'})`,
      targetOrientation: otherOrientation,
      diff,
    };
  }
  return null;
}

/**
 * Matches _atualizar_aviso_orientacao_montagem in Python
 */
export function getMontagemOrientationSuggestion(
  cardW: number,
  cardH: number,
  orientation: Orientation,
  _marginCm: number,
  spacing: number,
  currentCapacity: number
): OrientationSuggestion | null {
  if (cardW <= 0 || cardH <= 0) return null;
  const otherOrientation: Orientation = orientation === 'vertical' ? 'horizontal' : 'vertical';
  const otherPage = getPageDimensions(otherOrientation);
  const otherAreaW = Math.max(1, otherPage.width - 0.4 * 2);
  const otherAreaH = Math.max(1, otherPage.height - 0.4 * 2);

  // If card exceeds printable area in other orientation, it cannot fit
  if (cardW > otherAreaW || cardH > otherAreaH) return null;

  const otherCols = Math.floor((otherAreaW + spacing + 1e-4) / (cardW + spacing));
  const otherRows = Math.floor((otherAreaH + spacing + 1e-4) / (cardH + spacing));
  if (otherCols < 1 || otherRows < 1) return null;

  const otherTotal = otherCols * otherRows;

  if (otherTotal > currentCapacity) {
    const diff = otherTotal - currentCapacity;
    const nome = otherOrientation === 'horizontal' ? 'paisagem' : 'retrato';
    return {
      text: `Sugestão: mude para ${nome} para caber mais cartões na página (+${diff} ${diff === 1 ? 'cartão' : 'cartões'})`,
      targetOrientation: otherOrientation,
      diff,
    };
  }
  return null;
}

/**
 * Calcula a melhor grade (fH x fV) e orientação para uma quantidade desejada de páginas,
 * encontrando a combinação mais próxima e com melhor proporção para a imagem,
 * podendo mudar a orientação (retrato/paisagem) para diminuir a quantidade de folhas e evitar desperdício.
 */
export function calculateBestPosterGrid(
  targetSheets: number,
  imgW: number,
  imgH: number,
  currentOrientation: Orientation,
  marginCm: number,
  _keepRatio?: boolean,
  customAspect?: number
): { fH: number; fV: number; orientation: Orientation; widthCm: number; heightCm: number } {
  const target = Math.max(1, Math.min(500, targetSheets));
  const orientations: Orientation[] = ['vertical', 'horizontal'];

  const imgAspect = customAspect ?? ((imgW > 0 && imgH > 0) ? (imgW / imgH) : 1);

  let bestCandidate = {
    fH: 1,
    fV: 1,
    orientation: currentOrientation,
    widthCm: 19.4,
    heightCm: 28.1,
    score: Infinity,
  };

  const maxSearch = Math.min(35, Math.max(6, Math.ceil(Math.sqrt(target) * 2.5) + 3));

  for (const orient of orientations) {
    const page = getPageDimensions(orient);
    const usableW = Math.max(0.1, page.width - marginCm * 2);
    const usableH = Math.max(0.1, page.height - marginCm * 2);

    for (let c = 1; c <= maxSearch; c++) {
      for (let r = 1; r <= maxSearch; r++) {
        const totalGridSheets = c * r;

        if (totalGridSheets > target * 2.5 && totalGridSheets > 12) continue;

        // Descarta grades desproporcionais que deixam muito espaço em branco (tipo 19x2)
        if (c >= 2 && r >= 2 && Math.max(c / r, r / c) > 2.5) continue;
        if (totalGridSheets >= 4 && (c === 1 || r === 1)) continue;

        // Calcula dimensões do pôster com essa grade e orientação mantendo a proporção da imagem
        const { widthCm, heightCm } = calculatePosterWithFixedSheets(
          imgW,
          imgH,
          c,
          r,
          orient,
          marginCm,
          true,
          imgAspect
        );

        // Limita o pôster para não ultrapassar 4 metros (400 cm)
        if (widthCm > LIMITE_MAX_POSTER_CM + 0.05 || heightCm > LIMITE_MAX_POSTER_CM + 0.05) {
          continue;
        }

        // Quantidade real de folhas que contêm imagem (folhas não-vazias)
        const actualCols = Math.max(1, Math.ceil(widthCm / usableW));
        const actualRows = Math.max(1, Math.ceil(heightCm / usableH));
        const nonEmptySheets = actualCols * actualRows;

        const diff = Math.abs(nonEmptySheets - target);

        // Aproveitamento da grade (quão bem a proporção da imagem preenche as folhas)
        const gridW = c * usableW;
        const gridH = r * usableH;
        const gridAspect = gridW / gridH;
        const fillRatio = imgAspect >= gridAspect ? (gridAspect / imgAspect) : (imgAspect / gridAspect);

        if (target > 1 && fillRatio < 0.45) continue;

        // Penalidade por diferença da quantidade desejada
        let diffPenalty: number;
        if (diff === 0) {
          diffPenalty = 0;
        } else if (diff === 1) {
          diffPenalty = 1.3;
        } else if (diff === 2) {
          diffPenalty = 2.8;
        } else {
          diffPenalty = 2.8 + (diff - 2) * 2.0;
        }

        // Penalidade de aproveitamento de papel
        const aspectPenalty = (1 - fillRatio) * 3.5;

        // Penalidade por folhas vazias na grade
        const wastedSheets = totalGridSheets - nonEmptySheets;
        const wastePenalty = wastedSheets * 1.5;

        // Favorece menor quantidade de folhas
        const sheetCountPenalty = (nonEmptySheets / target) * 0.4;

        // Leve preferência para a orientação atual apenas em caso de empate quase exato
        const orientationSwitchPenalty = (orient === currentOrientation) ? 0 : 0.15;

        const score = diffPenalty + aspectPenalty + wastePenalty + sheetCountPenalty + orientationSwitchPenalty;

        if (score < bestCandidate.score) {
          bestCandidate = {
            fH: c,
            fV: r,
            orientation: orient,
            widthCm,
            heightCm,
            score,
          };
        }
      }
    }
  }

  return {
    fH: bestCandidate.fH,
    fV: bestCandidate.fV,
    orientation: bestCandidate.orientation,
    widthCm: bestCandidate.widthCm,
    heightCm: bestCandidate.heightCm,
  };
}



const adjacentPosterGridCache = new Map<string, { targetPages: number; fH: number; fV: number; orientation: Orientation; widthCm: number; heightCm: number } | null>();

/**
 * Encontra a próxima ou anterior configuração de grade do pôster que forma uma grade válida completa,
 * pulando quantidades que não formam grade (números primos que não decompõem em grade,
 * ou quantidades que geram folhas vazias/não preenchem a grade).
 */
export function findAdjacentPosterGrid(
  currentPages: number,
  direction: 1 | -1,
  imgW: number,
  imgH: number,
  currentOrientation: Orientation,
  marginCm: number,
  _keepRatio?: boolean,
  customAspect?: number
): { targetPages: number; fH: number; fV: number; orientation: Orientation; widthCm: number; heightCm: number } | null {
  const cacheKey = `${currentPages}_${direction}_${Math.round(imgW)}_${Math.round(imgH)}_${currentOrientation}_${marginCm}_${customAspect ? customAspect.toFixed(4) : ''}`;
  if (adjacentPosterGridCache.has(cacheKey)) {
    return adjacentPosterGridCache.get(cacheKey)!;
  }

  const saveAndReturn = (res: { targetPages: number; fH: number; fV: number; orientation: Orientation; widthCm: number; heightCm: number } | null) => {
    if (adjacentPosterGridCache.size > 500) adjacentPosterGridCache.clear();
    adjacentPosterGridCache.set(cacheKey, res);
    return res;
  };

  const maxLimit = 500;
  const minLimit = 1;

  let candidate = direction > 0
    ? Math.max(minLimit, currentPages + direction)
    : Math.min(maxLimit, currentPages + direction);

  while (candidate >= minLimit && candidate <= maxLimit) {
    if (isValidGridCount(candidate)) {
      const grid = calculateBestPosterGrid(
        candidate,
        imgW,
        imgH,
        currentOrientation,
        marginCm,
        true,
        customAspect
      );

      const gridSheets = grid.fH * grid.fV;
      // Para ser considerado que "forma grade" para a imagem, a grade gerada precisa:
      // 1) Corresponder exatamente à quantidade de folhas candidata (gridSheets === candidate)
      // 2) Ser diferente da quantidade atual (gridSheets !== currentPages)
      // 3) Não ultrapassar o limite de 4 metros (400 cm)
      if (gridSheets === candidate && gridSheets !== currentPages) {
        if (grid.widthCm <= LIMITE_MAX_POSTER_CM + 0.05 && grid.heightCm <= LIMITE_MAX_POSTER_CM + 0.05) {
          return saveAndReturn({
            targetPages: candidate,
            fH: grid.fH,
            fV: grid.fV,
            orientation: grid.orientation,
            widthCm: grid.widthCm,
            heightCm: grid.heightCm,
          });
        } else if (direction > 0) {
          // Ultrapassou 4 metros ao tentar aumentar, encerra busca
          break;
        }
      }
    }
    candidate += direction;
  }

  // Caso não encontre uma correspondência exata, busca o próximo número composto que resulte em uma grade diferente
  candidate = direction > 0
    ? Math.max(minLimit, currentPages + direction)
    : Math.min(maxLimit, currentPages + direction);

  while (candidate >= minLimit && candidate <= maxLimit) {
    if (isValidGridCount(candidate)) {
      const grid = calculateBestPosterGrid(
        candidate,
        imgW,
        imgH,
        currentOrientation,
        marginCm,
        true,
        customAspect
      );
      const gridSheets = grid.fH * grid.fV;
      if (gridSheets !== currentPages && isValidGridCount(gridSheets)) {
        if (grid.widthCm <= LIMITE_MAX_POSTER_CM + 0.05 && grid.heightCm <= LIMITE_MAX_POSTER_CM + 0.05) {
          return saveAndReturn({
            targetPages: gridSheets,
            fH: grid.fH,
            fV: grid.fV,
            orientation: grid.orientation,
            widthCm: grid.widthCm,
            heightCm: grid.heightCm,
          });
        } else if (direction > 0) {
          break;
        }
      }
    }
    candidate += direction;
  }

  return saveAndReturn(null);
}

