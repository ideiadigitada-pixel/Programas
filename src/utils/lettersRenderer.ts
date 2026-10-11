import { ImageInfo } from '../types';

export const PT_TO_CM = 2.54 / 72; // ~0.0352778 cm por ponto
export const CM_TO_PT = 72 / 2.54; // ~28.3464567 pontos por cm

export interface RenderLettersOptions {
  text: string;
  fontFamily: string;
  isOutline?: boolean; // Padrão: contorno para molde em EVA
  isAproveitamentoMaximo?: boolean;
  letrasPorPagina?: boolean; // Nova opção: letras inteiras por página sem fatiar
  fontSizePt?: number; // Tamanho da fonte em pt (pontos tipográficos)
  fontSizeCm?: number; // Mantido para compatibilidade
  marginCm?: number; // Margem da página (padrão 1.0 cm)
  forcedOrientation?: 'vertical' | 'horizontal'; // Opcional
  letterSpacingMm?: number; // Espaçamento entre letras em milímetros (0 = normal)
}

export interface LettersRenderResult {
  canvas: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
  aspect: number;
  normalAspect: number;
  fH: number;
  fV: number;
  orientation: 'vertical' | 'horizontal';
  fontSizePt: number;
  fontSizeCm: number;
  phraseWidthCm: number;
  phraseHeightCm: number;
  gridWidthCm: number;
  gridHeightCm: number;
  normalWidthCm: number;
  normalHeightCm: number;
  sheetCount: number;
  activeSheetCount: number;
  emptySlots: { col: number; row: number }[];
  letterSpacingMm: number;
  seams?: {
    horizontalSeams: { colLeft: number; colRight: number; row: number }[];
    verticalSeams: { col: number; rowTop: number; rowBottom: number }[];
  };
}

/**
 * Extrai todas as letras únicas da frase, preservando a ordem da primeira aparição e removendo duplicadas.
 * Mantém as letras exatamente como foram digitadas (maiúsculas e minúsculas).
 */
export function getUniqueLetters(rawText: string): string[] {
  const seen = new Set<string>();
  const uniqueList: string[] = [];

  for (const char of rawText) {
    if (!char.trim()) continue; // ignora espaços
    const key = char.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueList.push(char); // Preserva maiúscula/minúscula
    }
  }

  return uniqueList.length > 0 ? uniqueList : ['L', 'e', 't', 'r', 'a', 's'];
}

const SCALE = 50; // 50 px por cm (127 DPI)

/**
 * Renderiza o molde de letras tratando-as como uma imagem contínua
 * que aproveita todo o espaço útil até as margens da folha.
 * Seleciona automaticamente a melhor orientação (vertical ou horizontal)
 * para maximizar o aproveitamento da folha e acomodar letras grandes sem corte.
 */
export function renderLettersToCanvas(options: RenderLettersOptions): LettersRenderResult {
  const {
    text,
    fontFamily,
    isAproveitamentoMaximo = false,
    letrasPorPagina = false,
    fontSizePt: requestedFontSizePt,
    fontSizeCm: requestedFontSizeCm,
    marginCm = 1.0,
    forcedOrientation,
    letterSpacingMm = 0,
  } = options;

  const rawText = text.trim() || 'Letras';

  // 1. Determina tamanho da fonte
  let fontSizePt: number;
  let fontSizeCm: number;

  if (requestedFontSizePt != null) {
    fontSizePt = Math.max(10, Math.min(1200, Math.round(requestedFontSizePt)));
    fontSizeCm = Math.max(0.35, Math.min(42, Math.round(fontSizePt * PT_TO_CM * 10) / 10));
  } else if (requestedFontSizeCm != null) {
    fontSizeCm = Math.max(0.35, Math.min(42, requestedFontSizeCm));
    fontSizePt = Math.max(10, Math.min(1200, Math.round(fontSizeCm * CM_TO_PT)));
  } else {
    fontSizePt = 65; // ~2.3 cm padrão
    fontSizeCm = Math.round(fontSizePt * PT_TO_CM * 10) / 10;
  }

  // 2. Linhas de texto: Frase completa e linhas para renderização
  const fullLines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const completeLines = fullLines.length > 0 ? fullLines : ['Letras'];

  let lines: string[] = [];
  if (isAproveitamentoMaximo) {
    const unique = getUniqueLetters(rawText);
    lines = [unique.join('')]; // Letras únicas unidas no canvas
  } else {
    lines = completeLines;
  }

  // 3. Medição tipográfica exata da tinta das letras
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) {
    throw new Error('Canvas 2D context não disponível');
  }

  const fontSizePx = Math.max(8, Math.round(fontSizeCm * SCALE));
  const isCustomFont = fontFamily.includes('CustomEVAFont');
  const fontStyle = isCustomFont
    ? `${fontSizePx}px "${fontFamily}", sans-serif`
    : fontFamily.includes('bold') || fontFamily.includes('Bold') || fontFamily.includes('800') || fontFamily.includes('900')
      ? `${fontSizePx}px ${fontFamily}`
      : `900 ${fontSizePx}px ${fontFamily}`;
  measureCtx.font = fontStyle;

  // Espaçamento entre letras em pixels na escala de medição
  const letterSpacingCm = letterSpacingMm / 10;
  const letterSpacingPx = letterSpacingCm * SCALE;

  // Mede as linhas da frase COMPLETA (para tamanho da frase exibido na interface)
  let fullMaxLineWidthPx = 0;
  let fullMaxAscentPx = 0;
  let fullMaxDescentPx = 0;

  for (const line of completeLines) {
    const chars = Array.from(line);
    const baseWidth = measureCtx.measureText(line).width;
    const extraSpacing = Math.max(0, chars.length - 1) * letterSpacingPx;
    const lineWidth = Math.max(0, baseWidth + extraSpacing);

    if (lineWidth > fullMaxLineWidthPx) {
      fullMaxLineWidthPx = lineWidth;
    }
    const metrics = measureCtx.measureText(line);
    const ascent = metrics.actualBoundingBoxAscent || fontSizePx * 0.78;
    const descent = metrics.actualBoundingBoxDescent || fontSizePx * 0.22;
    if (ascent > fullMaxAscentPx) fullMaxAscentPx = ascent;
    if (descent > fullMaxDescentPx) fullMaxDescentPx = descent;
  }

  const strokePaddingPx = 2;
  const fullSingleLineHeightPx = fullMaxAscentPx + fullMaxDescentPx + strokePaddingPx * 2;
  const fullLineSpacingPx = completeLines.length > 1 ? Math.round(fontSizePx * 0.12) : 0;
  const fullTextHeightPx = completeLines.length * fullSingleLineHeightPx + (completeLines.length - 1) * fullLineSpacingPx;
  const fullTextWidthPx = fullMaxLineWidthPx + strokePaddingPx * 2;

  const fullPhraseWidthCm = Math.max(0.5, fullTextWidthPx / SCALE);
  const fullPhraseHeightCm = Math.max(0.5, fullTextHeightPx / SCALE);

  // Mede as linhas desenhadas no canvas (se aproveitamento, são as letras únicas unidas)
  let maxLineWidthPx = 0;
  let maxAscentPx = 0;
  let maxDescentPx = 0;

  for (const line of lines) {
    const chars = Array.from(line);
    const baseWidth = measureCtx.measureText(line).width;
    const extraSpacing = Math.max(0, chars.length - 1) * letterSpacingPx;
    const lineWidth = Math.max(0, baseWidth + extraSpacing);

    if (lineWidth > maxLineWidthPx) {
      maxLineWidthPx = lineWidth;
    }
    const metrics = measureCtx.measureText(line);
    const ascent = metrics.actualBoundingBoxAscent || fontSizePx * 0.78;
    const descent = metrics.actualBoundingBoxDescent || fontSizePx * 0.22;
    if (ascent > maxAscentPx) maxAscentPx = ascent;
    if (descent > maxDescentPx) maxDescentPx = descent;
  }

  const singleLineHeightPx = maxAscentPx + maxDescentPx + strokePaddingPx * 2;
  const lineSpacingPx = lines.length > 1 ? Math.round(fontSizePx * 0.12) : 0;
  const totalTextHeightPx = lines.length * singleLineHeightPx + (lines.length - 1) * lineSpacingPx;
  const totalTextWidthPx = maxLineWidthPx + strokePaddingPx * 2;

  const textWidthCm = Math.max(0.5, totalTextWidthPx / SCALE);
  const textHeightCm = Math.max(0.5, totalTextHeightPx / SCALE);

  // 4. Dimensões úteis da folha A4 considerando a margem
  const A4_SHORT = 21.0;
  const A4_LONG = 29.7;
  const margin2 = marginCm * 2;

  // Portrait (vertical): largura 21.0, altura 29.7
  const portUsableW = Math.max(1, A4_SHORT - margin2);
  const portUsableH = Math.max(1, A4_LONG - margin2);

  // Landscape (horizontal): largura 29.7, altura 21.0
  const landUsableW = Math.max(1, A4_LONG - margin2);
  const landUsableH = Math.max(1, A4_SHORT - margin2);

  // 5. SELEÇÃO INTELIGENTE DE ORIENTAÇÃO PARA APROVEITAR AO MÁXIMO
  // "Quando a letra está muito grande, ultrapassa a area da folha para fora.
  // Quero que mude a orientação das folhas para aproveitar o máximo.
  // Trate as letras como se fosse uma imagem, aproveitando até as margens"
  // A orientação é idêntica tanto no modo normal quanto com "letra em cada página" ativo.
  let orientation: 'vertical' | 'horizontal';
  if (forcedOrientation) {
    orientation = forcedOrientation;
  } else {
    // Se a altura da letra ultrapassa a folha horizontal (landUsableH),
    // mas cabe na altura da folha vertical (portUsableH):
    if (textHeightCm > landUsableH && textHeightCm <= portUsableH) {
      orientation = 'vertical';
    } else if (textHeightCm <= landUsableH) {
      // Ambas cabem na altura de 1 folha (fV = 1).
      // Escolhe a orientação que usa menos folhas para acomodar a largura da frase:
      const sheetsLand = Math.ceil(textWidthCm / landUsableW);
      const sheetsPort = Math.ceil(textWidthCm / portUsableW);
      orientation = sheetsPort < sheetsLand ? 'vertical' : 'horizontal';
    } else {
      // Letras muito grandes que excedem a altura de 1 folha em ambas:
      // Escolhe a orientação que minimiza o total de folhas
      const sheetsLand = Math.ceil(textWidthCm / landUsableW) * Math.ceil(textHeightCm / landUsableH);
      const sheetsPort = Math.ceil(textWidthCm / portUsableW) * Math.ceil(textHeightCm / portUsableH);
      if (sheetsPort < sheetsLand) {
        orientation = 'vertical';
      } else if (sheetsLand < sheetsPort) {
        orientation = 'horizontal';
      } else {
        // Empate: prefere a orientação que requer menos divisões verticais (fV)
        const fVPort = Math.ceil(textHeightCm / portUsableH);
        const fVLand = Math.ceil(textHeightCm / landUsableH);
        orientation = fVPort <= fVLand ? 'vertical' : 'horizontal';
      }
    }
  }

  const uW = orientation === 'vertical' ? portUsableW : landUsableW;
  const uH = orientation === 'vertical' ? portUsableH : landUsableH;

  // 6. Quantidade de folhas necessárias na horizontal e na vertical
  const fV = Math.max(1, Math.ceil(textHeightCm / uH));
  let fH = Math.max(1, Math.ceil(textWidthCm / uW));

  // No modo "Letras em cada página":
  // As letras são mantidas inteiras na folha (não passam para a próxima folha cortadas pela metade).
  // Se uma letra cabe na folha atual junto com as anteriores, fica nela. Se não couber, passa inteira para a próxima folha.
  // Se uma letra individual for maior que a folha inteira, é dividida entre folhas adjacentes
  // e apenas as emendas dessa letra dividida são marcadas para cola no PDF.
  interface ChunkPlacement {
    text: string;
    col: number;
    spanCols: number;
    lineIndex: number;
  }
  const chunkPlacements: ChunkPlacement[] = [];
  const horizontalSeams: { colLeft: number; colRight: number; row: number }[] = [];
  const verticalSeams: { col: number; rowTop: number; rowBottom: number }[] = [];

  if (letrasPorPagina) {
    const sheetWPx = Math.round(uW * SCALE);
    const sheetUsableWPx = Math.max(10, sheetWPx - strokePaddingPx * 2);
    let maxCols = 1;

    for (let l = 0; l < lines.length; l++) {
      const lineText = lines[l];
      let curCol = 0;
      let currentChunk = '';
      const chars = Array.from(lineText);

      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        if (char === ' ') {
          if (currentChunk.length > 0) currentChunk += ' ';
          continue;
        }

        const testChunk = currentChunk + char;
        const testChars = Array.from(testChunk);
        const testWidth = measureCtx.measureText(testChunk).width + Math.max(0, testChars.length - 1) * letterSpacingPx;

        if (testWidth <= sheetUsableWPx) {
          // A letra cabe na folha atual junto com as anteriores
          currentChunk = testChunk;
        } else {
          // A letra não cabe na folha atual junto com as anteriores
          if (currentChunk.trim().length > 0) {
            chunkPlacements.push({
              text: currentChunk,
              col: curCol,
              spanCols: 1,
              lineIndex: l,
            });
            curCol++;
            currentChunk = '';
          }

          const singleWidth = measureCtx.measureText(char).width;
          if (singleWidth <= sheetUsableWPx) {
            // A letra cabe inteira na próxima folha
            currentChunk = char;
          } else {
            // A letra individual é maior que a folha inteira
            const spanCols = Math.max(1, Math.ceil((singleWidth + strokePaddingPx * 2) / sheetWPx));
            chunkPlacements.push({
              text: char,
              col: curCol,
              spanCols,
              lineIndex: l,
            });

            // Registra emendas horizontais apenas onde essa letra gigante foi cortada
            for (let s = 0; s < spanCols - 1; s++) {
              for (let r = 0; r < fV; r++) {
                horizontalSeams.push({ colLeft: curCol + s, colRight: curCol + s + 1, row: r });
              }
            }

            curCol += spanCols;
            currentChunk = '';
          }
        }
      }

      if (currentChunk.trim().length > 0) {
        chunkPlacements.push({
          text: currentChunk,
          col: curCol,
          spanCols: 1,
          lineIndex: l,
        });
        curCol++;
      }

      if (curCol > maxCols) {
        maxCols = curCol;
      }
    }

    fH = Math.max(1, maxCols);

    // Registra emendas verticais se a altura ultrapassar 1 folha
    if (fV > 1) {
      for (let r = 0; r < fV - 1; r++) {
        for (let c = 0; c < fH; c++) {
          verticalSeams.push({ col: c, rowTop: r, rowBottom: r + 1 });
        }
      }
    }
  }

  // 7. Dimensões totais da grade útil em cm
  const gridWidthCm = fH * uW;
  const gridHeightCm = fV * uH;

  // 8. Cria o canvas do molde com as dimensões exatas da grade e limite seguro de resolução
  // Limita a 4096px / 10MP para garantir máxima estabilidade e evitar que o navegador trave ou descarte o contexto 2D
  const maxSafeDim = 4096;
  const maxSafePixels = 10_000_000;
  let drawScale = SCALE;
  const rawW = gridWidthCm * drawScale;
  const rawH = gridHeightCm * drawScale;
  if (rawW > maxSafeDim || rawH > maxSafeDim || (rawW * rawH) > maxSafePixels) {
    const scaleFactor = Math.min(
      maxSafeDim / Math.max(rawW, rawH),
      Math.sqrt(maxSafePixels / (rawW * rawH))
    );
    drawScale = Math.max(5, drawScale * scaleFactor);
  }

  const canvasW = Math.max(10, Math.round(gridWidthCm * drawScale));
  const canvasH = Math.max(10, Math.round(gridHeightCm * drawScale));

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context não disponível');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fundo branco sólido puro
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const scaleRatio = drawScale / SCALE;
  const drawFontSizePx = Math.max(6, Math.round(fontSizeCm * drawScale));
  const drawFontStyle = isCustomFont
    ? `${drawFontSizePx}px "${fontFamily}", sans-serif`
    : fontFamily.includes('bold') || fontFamily.includes('Bold') || fontFamily.includes('800') || fontFamily.includes('900')
      ? `${drawFontSizePx}px ${fontFamily}`
      : `900 ${drawFontSizePx}px ${fontFamily}`;

  // Configuração de texto com contorno fino nítido
  ctx.font = drawFontStyle;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = Math.max(1, Math.round(2 * scaleRatio));
  ctx.strokeStyle = '#000000';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const drawStrokePaddingPx = Math.max(1, Math.round(strokePaddingPx * scaleRatio));
  const drawTotalTextWidthPx = totalTextWidthPx * scaleRatio;
  const drawTotalTextHeightPx = totalTextHeightPx * scaleRatio;

  // Posicionamento:
  // Se fH === 1: centraliza horizontalmente na folha única
  // Se fH > 1: alinha à margem esquerda para aproveitar as folhas sequenciais
  const startXPx = fH === 1
    ? Math.max(drawStrokePaddingPx, Math.round((canvasW - drawTotalTextWidthPx) / 2))
    : drawStrokePaddingPx;

  // Se fV === 1: centraliza verticalmente na folha
  // Se fV > 1: alinha à margem superior
  const startYPx = fV === 1
    ? Math.max(drawStrokePaddingPx, Math.round((canvasH - drawTotalTextHeightPx) / 2))
    : drawStrokePaddingPx;

  const drawLetterSpacingPx = letterSpacingCm * drawScale;

  if (!letrasPorPagina) {
    // Modo normal contínuo
    for (let l = 0; l < lines.length; l++) {
      const lineText = lines[l];
      const baselineY = startYPx + l * (singleLineHeightPx + lineSpacingPx) * scaleRatio + drawStrokePaddingPx + maxAscentPx * scaleRatio;
      if (drawLetterSpacingPx === 0) {
        ctx.strokeText(lineText, startXPx, baselineY);
      } else {
        let curX = startXPx;
        const chars = Array.from(lineText);
        for (const char of chars) {
          ctx.strokeText(char, curX, baselineY);
          curX += ctx.measureText(char).width + drawLetterSpacingPx;
        }
      }
    }
  } else {
    // Modo letra em cada página: cada bloco de letras inteiras é desenhado em sua respectiva folha
    const drawSheetWPx = Math.round(uW * drawScale);
    for (const p of chunkPlacements) {
      const drawX = p.col * drawSheetWPx + drawStrokePaddingPx;
      const baselineY = startYPx + p.lineIndex * (singleLineHeightPx + lineSpacingPx) * scaleRatio + drawStrokePaddingPx + maxAscentPx * scaleRatio;

      if (drawLetterSpacingPx === 0) {
        ctx.strokeText(p.text, drawX, baselineY);
      } else {
        let curX = drawX;
        for (const ch of Array.from(p.text)) {
          ctx.strokeText(ch, curX, baselineY);
          curX += ctx.measureText(ch).width + drawLetterSpacingPx;
        }
      }
    }
  }

  // 9. Detecção rápida de folhas vazias
  const occupiedSlots = new Set<string>();
  if (letrasPorPagina) {
    for (const p of chunkPlacements) {
      for (let s = 0; s < p.spanCols; s++) {
        for (let r = 0; r < fV; r++) {
          occupiedSlots.add(`${p.col + s}-${r}`);
        }
      }
    }
  }

  const emptySlots: { col: number; row: number }[] = [];
  let activeSheetCount = 0;

  for (let r = 0; r < fV; r++) {
    for (let c = 0; c < fH; c++) {
      let isEmpty = false;
      if (letrasPorPagina) {
        isEmpty = !occupiedSlots.has(`${c}-${r}`);
      } else {
        const sheetXStart = c * uW * drawScale;
        const sheetXEnd = (c + 1) * uW * drawScale;
        const sheetYStart = r * uH * drawScale;
        const sheetYEnd = (r + 1) * uH * drawScale;

        // Se a folha estiver completamente fora da área de texto calculada:
        const isOutsideText =
          sheetXEnd < startXPx ||
          sheetXStart > startXPx + drawTotalTextWidthPx ||
          sheetYEnd < startYPx ||
          sheetYStart > startYPx + drawTotalTextHeightPx;

        isEmpty = isOutsideText && (fH > 1 || fV > 1);
      }

      if (isEmpty) {
        emptySlots.push({ col: c, row: r });
      } else {
        activeSheetCount++;
      }
    }
  }

  const aspect = canvasW / canvasH;

  return {
    canvas,
    widthPx: canvasW,
    heightPx: canvasH,
    aspect,
    normalAspect: textWidthCm / textHeightCm,
    fH,
    fV,
    orientation,
    fontSizePt,
    fontSizeCm,
    phraseWidthCm: Math.round(fullPhraseWidthCm * 10) / 10,
    phraseHeightCm: Math.round(fullPhraseHeightCm * 10) / 10,
    gridWidthCm: Math.round(gridWidthCm * 10) / 10,
    gridHeightCm: Math.round(gridHeightCm * 10) / 10,
    normalWidthCm: Math.round(fullPhraseWidthCm * 10) / 10,
    normalHeightCm: Math.round(fullPhraseHeightCm * 10) / 10,
    sheetCount: fH * fV,
    activeSheetCount: Math.max(1, activeSheetCount),
    emptySlots,
    letterSpacingMm,
    seams: {
      horizontalSeams,
      verticalSeams,
    },
  };
}

let lastLettersBlobUrl: string | null = null;

/**
 * Cria um objeto ImageInfo completo compatível com todo o sistema do Pôster
 */
export async function createLettersImageInfo(
  options: RenderLettersOptions
): Promise<LettersRenderResult & { imageInfo: ImageInfo }> {
  const result = renderLettersToCanvas(options);
  const { canvas, widthPx, heightPx, gridWidthCm, gridHeightCm } = result;

  // Usa canvas.toBlob com JPEG para geração ultra-rápida sem travar a interface
  let dataUrl: string;
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
    });
    if (blob) {
      dataUrl = URL.createObjectURL(blob);
    } else {
      dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    }
  } else {
    dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  }

  const img = new Image();
  img.src = dataUrl;

  // Revoga o Blob URL anterior com pequeno delay para não piscar os quadros que já o exibem
  if (lastLettersBlobUrl && lastLettersBlobUrl !== dataUrl && lastLettersBlobUrl.startsWith('blob:')) {
    const oldUrl = lastLettersBlobUrl;
    setTimeout(() => {
      try {
        URL.revokeObjectURL(oldUrl);
      } catch {
        // ignore
      }
    }, 1500);
  }
  lastLettersBlobUrl = dataUrl;

  const cleanName = options.text.trim().slice(0, 16) || 'Letras';

  const imageInfo: ImageInfo = {
    url: dataUrl,
    name: `Molde EVA - ${cleanName}`,
    widthPx,
    heightPx,
    widthCm: gridWidthCm,
    heightCm: gridHeightCm,
    imgElement: img,
  };

  return {
    ...result,
    imageInfo,
  };
}
