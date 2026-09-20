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

export function parseCm(text: string, defaultValue: number): number {
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
    widthCm: Math.round(widthCm * 10) / 10,
    heightCm: Math.round(heightCm * 10) / 10,
    fH: 1,
    fV: 1,
  };
}

/**
 * Recalculates poster dimensions when grid (+/-) is pressed, keeping fH and fV fixed.
 * Directly corresponds to `_recalcular_com_fileiras_fixas` & `calcular_opcoes(..., "qtd_hv", ...)` in Python.
 */
export function calculatePosterWithFixedSheets(
  imgW: number,
  imgH: number,
  fH: number,
  fV: number,
  orientation: Orientation,
  marginCm: number,
  keepRatio: boolean
): { widthCm: number; heightCm: number } {
  const page = getPageDimensions(orientation);
  const usableW = Math.max(0.1, page.width - marginCm * 2);
  const usableH = Math.max(0.1, page.height - marginCm * 2);
  const areaUtilH = fH * usableW;
  const areaUtilV = fV * usableH;

  let widthCm: number;
  let heightCm: number;

  if (keepRatio) {
    if (areaUtilH / imgW < areaUtilV / imgH) {
      widthCm = areaUtilH;
      heightCm = (widthCm / imgW) * imgH;
    } else {
      heightCm = areaUtilV;
      widthCm = (heightCm / imgH) * imgW;
    }
  } else {
    widthCm = areaUtilH;
    heightCm = areaUtilV;
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
  imgW: number,
  imgH: number
): {
  cardW: number;
  cardH: number;
  areaW: number;
  areaH: number;
  spacing: number;
  pageW: number;
  pageH: number;
  totalCards: number;
  quantity: number;
} {
  const page = getPageDimensions(config.orientation);
  const areaW = Math.max(1, page.width - config.marginCm * 2);
  const areaH = Math.max(1, page.height - config.marginCm * 2);
  const spacing = config.cardSpacing ? 0.2 : 0;
  const aspect = imgW / imgH;

  const maxCardW = (areaW - spacing * (config.fH - 1)) / config.fH;
  const maxCardH = (areaH - spacing * (config.fV - 1)) / config.fV;

  let cardW = maxCardW;
  let cardH = maxCardH;

  if (config.manualSize && config.cardWidthCm > 0 && config.cardHeightCm > 0) {
    cardW = Math.min(config.cardWidthCm, areaW);
    cardH = Math.min(config.cardHeightCm, areaH);
    if (config.keepRatio) {
      const scale = Math.min(1, areaW / cardW, areaH / cardH);
      cardW *= scale;
      cardH *= scale;
    }
  } else {
    if (config.keepRatio) {
      cardW = Math.min(maxCardW, maxCardH * aspect);
      cardH = cardW / aspect;
    } else {
      cardW = maxCardW;
      cardH = maxCardH;
    }
  }

  const capacity = config.fH * config.fV;
  const quantity = Math.max(1, Math.min(config.quantity ?? capacity, capacity));

  return {
    cardW: Math.max(0.5, Math.round(cardW * 10) / 10),
    cardH: Math.max(0.5, Math.round(cardH * 10) / 10),
    areaW,
    areaH,
    spacing,
    pageW: page.width,
    pageH: page.height,
    totalCards: capacity,
    quantity,
  };
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
): string | null {
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
    return `Sugestão: mude para ${nome} para economizar ${diff} ${diff === 1 ? 'folha' : 'folhas'}.`;
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
  marginCm: number,
  spacing: number,
  currentCapacity: number
): string | null {
  if (cardW <= 0 || cardH <= 0) return null;
  const otherOrientation: Orientation = orientation === 'vertical' ? 'horizontal' : 'vertical';
  const otherPage = getPageDimensions(otherOrientation);
  const otherAreaW = Math.max(1, otherPage.width - marginCm * 2);
  const otherAreaH = Math.max(1, otherPage.height - marginCm * 2);

  const otherCols = Math.max(1, Math.floor((otherAreaW + spacing) / (cardW + spacing) + 1e-9));
  const otherRows = Math.max(1, Math.floor((otherAreaH + spacing) / (cardH + spacing) + 1e-9));
  const otherTotal = otherCols * otherRows;

  if (otherTotal > currentCapacity) {
    const diff = otherTotal - currentCapacity;
    const nome = otherOrientation === 'horizontal' ? 'paisagem' : 'retrato';
    return `Sugestão: mude para ${nome} para caber ${diff} ${diff === 1 ? 'cartão' : 'cartões'} a mais na folha.`;
  }
  return null;
}
