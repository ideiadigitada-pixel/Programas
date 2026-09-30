import {
  FOLHA_MAIOR,
  FOLHA_MENOR,
  Orientation,
  PosterConfig,
  MontagemConfig,
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

  return {
    widthCm,
    heightCm,
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

      const isEmpty = parteWCm <= 0.01 || parteHCm <= 0.01;
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
  areaW: number;
  areaH: number;
  spacing: number;
  pageW: number;
  pageH: number;
  totalCards: number;
  quantity: number;
} {
  const page = getPageDimensions(config.orientation);
  // Dimensions in mm
  const pageWMm = Math.round(page.width * 10);
  const pageHMm = Math.round(page.height * 10);
  const marginMm = 4; // 0.4 cm fixo
  const areaWMm = Math.max(10, pageWMm - marginMm * 2);
  const areaHMm = Math.max(10, pageHMm - marginMm * 2);
  const spacingCm = config.spacingCm !== undefined ? config.spacingCm : (config.cardSpacing ? 0.2 : 0.1);
  const spacingMm = Math.max(0, Math.round(spacingCm * 10));

  const fH = Math.max(1, config.fH);
  const fV = Math.max(1, config.fV);

  // Maximum available space for cards in mm
  const availWMm = Math.max(1, areaWMm - spacingMm * (fH - 1));
  const availHMm = Math.max(1, areaHMm - spacingMm * (fV - 1));
  const maxCardWMm = availWMm / fH;
  const maxCardHMm = availHMm / fV;

  let cardWMm: number;
  let cardHMm: number;

  const hasImage = !!(imgW && imgH && imgW > 0 && imgH > 0);
  const aspect = customAspect ?? config.customAspect ?? (hasImage ? (imgW! / imgH!) : (maxCardWMm / maxCardHMm));

  if (config.manualSize && config.cardWidthCm > 0 && config.cardHeightCm > 0) {
    const userWMm = config.cardWidthCm * 10;
    const userHMm = config.cardHeightCm * 10;
    const scale = Math.min(1, maxCardWMm / userWMm, maxCardHMm / userHMm);
    cardWMm = userWMm * scale;
    cardHMm = userHMm * scale;
  } else {
    // Fit card proportionally into card slot preserving the image aspect ratio
    if (maxCardWMm / aspect <= maxCardHMm) {
      cardWMm = maxCardWMm;
      cardHMm = cardWMm / aspect;
    } else {
      cardHMm = maxCardHMm;
      cardWMm = cardHMm * aspect;
    }
  }

  // Safety cap to strictly guarantee no margin overflow
  cardWMm = Math.min(cardWMm, maxCardWMm);
  cardHMm = Math.min(cardHMm, maxCardHMm);

  // Floor to 0.1 mm precision to mathematically guarantee no rounding-up exceeds page margins
  cardWMm = Math.max(5, Math.floor(cardWMm * 10) / 10);
  cardHMm = Math.max(5, Math.floor(cardHMm * 10) / 10);

  // In cm for pdf and canvas rendering
  const cardWCm = Math.round((cardWMm / 10) * 100) / 100;
  const cardHCm = Math.round((cardHMm / 10) * 100) / 100;

  const capacity = fH * fV;
  const quantity = Math.max(1, config.quantity ?? 4);

  return {
    cardW: cardWCm,
    cardH: cardHCm,
    cardWMm,
    cardHMm,
    areaW: areaWMm / 10,
    areaH: areaHMm / 10,
    spacing: spacingMm / 10,
    pageW: page.width,
    pageH: page.height,
    totalCards: capacity,
    quantity,
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
}

/**
 * Gera todas as grades válidas e otimizadas para uma imagem no modo montagem.
 * Forma grades até 100 (ou um pouco menos, ex: 96, 100).
 * Regra: Quando grades tiverem o mesmo tamanho do cartão, mantém a que cabe mais cartões
 * e descarta as que deixam espaço vago na folha.
 */
export function getAllValidMontagemGrids(
  imgW: number,
  imgH: number,
  currentConfig: MontagemConfig,
  customAspect?: number
): OptimalMontagemGrid[] {
  const orientations: Orientation[] = ['vertical', 'horizontal'];
  const candidates: OptimalMontagemGrid[] = [];

  const effectiveAspect = customAspect ?? currentConfig.customAspect ?? (imgW > 0 && imgH > 0 ? imgW / imgH : 1);

  for (const orient of orientations) {
    const page = getPageDimensions(orient);
    const areaWMm = Math.round((page.width - 0.4 * 2) * 10);
    const areaHMm = Math.round((page.height - 0.4 * 2) * 10);
    const spacingCm = currentConfig.spacingCm !== undefined ? currentConfig.spacingCm : (currentConfig.cardSpacing ? 0.2 : 0.1);
    const spacingMm = Math.max(0, Math.round(spacingCm * 10));
    const usablePageArea = (areaWMm / 10) * (areaHMm / 10);

    for (let c = 1; c <= 12; c++) {
      for (let r = 1; r <= 12; r++) {
        const total = c * r;
        if (total > 100) continue;
        if (total >= 4 && (c === 1 || r === 1)) continue;
        if (Math.max(c / r, r / c) > 2.2) continue;

        const testConfig: MontagemConfig = {
          ...currentConfig,
          fH: c,
          fV: r,
          orientation: orient,
          manualSize: false,
          customAspect: effectiveAspect,
        };

        const dims = calculateMontagemDimensions(testConfig, imgW, imgH, effectiveAspect);
        if (dims.cardW < 0.5 || dims.cardH < 0.5) continue;

        // Verifica quantas colunas e linhas caberiam com esse mesmo tamanho exato de cartão
        const maxCols = Math.floor((areaWMm + spacingMm + 0.05) / (dims.cardWMm + spacingMm));
        const maxRows = Math.floor((areaHMm + spacingMm + 0.05) / (dims.cardHMm + spacingMm));

        // Se cabem mais colunas ou linhas com o MESMO tamanho de cartão,
        // esta grade deixa espaço vago e é descartada (ex: 6x4 descartada se 7x4 cabe)
        if (maxCols > c || maxRows > r) {
          continue;
        }

        const totalCardArea = total * dims.cardW * dims.cardH;
        const fillRatio = totalCardArea / usablePageArea;
        if (total > 1 && fillRatio < 0.45) continue;

        candidates.push({
          capacity: total,
          fH: c,
          fV: r,
          orientation: orient,
          cardW: dims.cardW,
          cardH: dims.cardH,
        });
      }
    }
  }

  // Agrupa por tamanho do cartão (arredondado a 0.5 mm)
  // "Quando grades tiverem o mesmo tamanho do cartao, deixar a que cabe mais cartoes"
  const sizeMap = new Map<string, OptimalMontagemGrid>();

  for (const cand of candidates) {
    const key = `${Math.round(cand.cardW * 20) / 20}x${Math.round(cand.cardH * 20) / 20}`;
    const existing = sizeMap.get(key);

    if (!existing) {
      sizeMap.set(key, cand);
    } else {
      if (cand.capacity > existing.capacity) {
        sizeMap.set(key, cand);
      } else if (cand.capacity === existing.capacity) {
        const areaCand = cand.cardW * cand.cardH;
        const areaExist = existing.cardW * existing.cardH;
        if (areaCand > areaExist) {
          sizeMap.set(key, cand);
        }
      }
    }
  }

  // Desduplica por capacidade (mantendo o maior tamanho de cartão)
  const capMap = new Map<number, OptimalMontagemGrid>();
  for (const g of sizeMap.values()) {
    const existing = capMap.get(g.capacity);
    if (!existing) {
      capMap.set(g.capacity, g);
    } else {
      const areaG = g.cardW * g.cardH;
      const areaEx = existing.cardW * existing.cardH;
      if (areaG > areaEx) {
        capMap.set(g.capacity, g);
      }
    }
  }

  const sortedGrids = Array.from(capMap.values());
  sortedGrids.sort((a, b) => a.capacity - b.capacity);

  // Garante que conforme a capacidade aumenta, a área de cada cartão é estritamente menor
  const result: OptimalMontagemGrid[] = [];
  let prevArea = Infinity;

  for (const g of sortedGrids) {
    const area = g.cardW * g.cardH;
    if (area < prevArea - 0.01) {
      result.push(g);
      prevArea = area;
    }
  }

  return result;
}

export function findAdjacentMontagemGrid(
  currentCapacity: number,
  direction: 1 | -1,
  imgW: number,
  imgH: number,
  currentConfig: MontagemConfig,
  customAspect?: number
): {
  fH: number;
  fV: number;
  orientation: Orientation;
  cardW: number;
  cardH: number;
  capacity: number;
} | null {
  const validGrids = getAllValidMontagemGrids(imgW, imgH, currentConfig, customAspect);
  if (validGrids.length === 0) return null;

  if (direction > 0) {
    const next = validGrids.find((g) => g.capacity > currentCapacity);
    if (next) {
      return {
        fH: next.fH,
        fV: next.fV,
        orientation: next.orientation,
        cardW: next.cardW,
        cardH: next.cardH,
        capacity: next.capacity,
      };
    }
    return null;
  } else {
    const prevList = validGrids.filter((g) => g.capacity < currentCapacity);
    if (prevList.length > 0) {
      const prev = prevList[prevList.length - 1];
      return {
        fH: prev.fH,
        fV: prev.fV,
        orientation: prev.orientation,
        cardW: prev.cardW,
        cardH: prev.cardH,
        capacity: prev.capacity,
      };
    }
    return null;
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
      if (gridSheets === candidate && gridSheets !== currentPages) {
        return {
          targetPages: candidate,
          fH: grid.fH,
          fV: grid.fV,
          orientation: grid.orientation,
          widthCm: grid.widthCm,
          heightCm: grid.heightCm,
        };
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
        return {
          targetPages: gridSheets,
          fH: grid.fH,
          fV: grid.fV,
          orientation: grid.orientation,
          widthCm: grid.widthCm,
          heightCm: grid.heightCm,
        };
      }
    }
    candidate += direction;
  }

  return null;
}

