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
  const rounded = Math.round(val * 100) / 100;
  const hasCent = Math.abs(Math.round(rounded * 10) - rounded * 10) > 0.01;
  if (hasCent) {
    return rounded.toFixed(2).replace('.', ',');
  }
  return rounded.toFixed(1).replace('.', ',');
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
  imgW?: number,
  imgH?: number
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
  const marginMm = Math.round(config.marginCm * 10);
  const areaWMm = Math.max(10, pageWMm - marginMm * 2);
  const areaHMm = Math.max(10, pageHMm - marginMm * 2);
  const spacingMm = config.cardSpacing ? 2 : 0; // 0.2 cm = 2 mm

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
  const aspect = hasImage ? (imgW! / imgH!) : (maxCardWMm / maxCardHMm);

  if (config.manualSize && config.cardWidthCm > 0 && config.cardHeightCm > 0) {
    const userWMm = config.cardWidthCm * 10;
    const userHMm = config.cardHeightCm * 10;
    cardWMm = Math.min(userWMm, maxCardWMm);
    cardHMm = Math.min(userHMm, maxCardHMm);

    if (config.keepRatio && hasImage) {
      const scale = Math.min(1, maxCardWMm / userWMm, maxCardHMm / userHMm);
      cardWMm = userWMm * scale;
      cardHMm = userHMm * scale;
    }
  } else {
    if (config.keepRatio && hasImage) {
      // Fit image proportionally into card slot
      if (maxCardWMm / aspect <= maxCardHMm) {
        cardWMm = maxCardWMm;
        cardHMm = cardWMm / aspect;
      } else {
        cardHMm = maxCardHMm;
        cardWMm = cardHMm * aspect;
      }
    } else {
      cardWMm = maxCardWMm;
      cardHMm = maxCardHMm;
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
  const quantity = Math.max(1, Math.min(config.quantity ?? capacity, capacity));

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
