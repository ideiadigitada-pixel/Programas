import {
  Document,
  Packer,
  Paragraph,
  ImageRun,
  TextRun,
  AlignmentType,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';
import JSZip from 'jszip';
import { DividedDrawing, Orientation } from '../types';

export type SensitivityLevel = 'baixa' | 'media' | 'alta' | 'muito_alta';
export type CropPaddingMode = 'justo' | 'suave';

export interface SplitDrawingsOptions {
  sensitivity?: SensitivityLevel;
  customThreshold?: number;
  padding?: number; // em pixels (padrão: 2 para recorte justo)
  paddingMode?: CropPaddingMode;
}

/**
 * Converte dataURL (base64) em Uint8Array para uso com docx e jszip
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converte canvas para Blob
 */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Falha ao gerar blob do canvas'));
    }, 'image/png');
  });
}

/**
 * Calcula quantidade de colunas e linhas para dispor N partes em uma folha A4
 */
export function getGridColsRows(count: number, isPortrait = true): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return isPortrait ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 };
  if (count === 3) return isPortrait ? { cols: 1, rows: 3 } : { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return isPortrait ? { cols: 2, rows: 3 } : { cols: 3, rows: 2 };
  if (count <= 8) return isPortrait ? { cols: 2, rows: 4 } : { cols: 4, rows: 2 };
  if (count === 9) return { cols: 3, rows: 3 };
  if (count <= 12) return isPortrait ? { cols: 3, rows: 4 } : { cols: 4, rows: 3 };
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

interface ComponentInfo {
  id: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
  area: number;
  count: number;
  parentId: number | null;
  childIds: number[];
}

/**
 * Divide uma imagem contendo vários desenhos ou partes de molde em partes individuais.
 * - Recorta de forma justa ("recorte justo") sem deixar restos de outros desenhos vizinhos.
 * - Filtra textos sozinhos (legendas, numerações e títulos isolados), dividindo apenas desenhos.
 */
export async function splitDrawingsFromImage(
  imageElement: HTMLImageElement,
  options: SplitDrawingsOptions = {}
): Promise<DividedDrawing[]> {
  const origW = imageElement.naturalWidth || imageElement.width;
  const origH = imageElement.naturalHeight || imageElement.height;

  if (origW <= 0 || origH <= 0) {
    return [];
  }

  // 1. Cria canvas em resolução original completa
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = origW;
  fullCanvas.height = origH;
  const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
  if (!fullCtx) {
    throw new Error('Contexto 2D não disponível');
  }
  fullCtx.drawImage(imageElement, 0, 0);

  // 2. Downsampling controlado para detecção precisa e rápida (máx 1200px)
  const maxProcDim = 1200;
  const scale = Math.min(1, maxProcDim / Math.max(origW, origH));
  const pW = Math.max(10, Math.round(origW * scale));
  const pH = Math.max(10, Math.round(origH * scale));

  const procCanvas = document.createElement('canvas');
  procCanvas.width = pW;
  procCanvas.height = pH;
  const procCtx = procCanvas.getContext('2d', { willReadFrequently: true });
  if (!procCtx) {
    throw new Error('Contexto 2D não disponível');
  }
  procCtx.drawImage(fullCanvas, 0, 0, pW, pH);

  const imgData = procCtx.getImageData(0, 0, pW, pH);
  const pixels = imgData.data;

  // 3. Amostragem inteligente do fundo pelas bordas do documento
  let sampleCount = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let transparentCount = 0;

  const borderDepth = Math.max(2, Math.min(6, Math.floor(Math.min(pW, pH) * 0.015)));

  for (let y = 0; y < pH; y++) {
    for (let x = 0; x < pW; x++) {
      const isBorder =
        x < borderDepth ||
        x >= pW - borderDepth ||
        y < borderDepth ||
        y >= pH - borderDepth;

      if (isBorder) {
        const idx = (y * pW + x) << 2;
        const a = pixels[idx + 3];
        if (a < 30) {
          transparentCount++;
        } else {
          sumR += pixels[idx];
          sumG += pixels[idx + 1];
          sumB += pixels[idx + 2];
        }
        sampleCount++;
      }
    }
  }

  const isTransparentBg = transparentCount > sampleCount * 0.35;
  const bgR = sampleCount > transparentCount ? Math.round(sumR / (sampleCount - transparentCount)) : 255;
  const bgG = sampleCount > transparentCount ? Math.round(sumG / (sampleCount - transparentCount)) : 255;
  const bgB = sampleCount > transparentCount ? Math.round(sumB / (sampleCount - transparentCount)) : 255;
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

  // Parâmetros de sensibilidade (padrão: baixa)
  const sensitivity = options.sensitivity || 'baixa';
  let diffThreshold = 18;
  let colorDiffThreshold = 22;

  if (sensitivity === 'baixa') {
    diffThreshold = 30;
    colorDiffThreshold = 35;
  } else if (sensitivity === 'alta') {
    diffThreshold = 11;
    colorDiffThreshold = 14;
  } else if (sensitivity === 'muito_alta') {
    diffThreshold = 6;
    colorDiffThreshold = 8;
  }

  if (typeof options.customThreshold === 'number') {
    diffThreshold = options.customThreshold;
    colorDiffThreshold = options.customThreshold;
  }

  // 4. Criação da máscara binária do primeiro plano (desenhos / partes do molde)
  const mask = new Uint8Array(pW * pH);
  const borderMargin = Math.max(1, Math.round(Math.min(pW, pH) * 0.008));

  for (let y = 0; y < pH; y++) {
    const rowOffset = y * pW;
    const isOuterEdge = y < borderMargin || y >= pH - borderMargin;

    for (let x = 0; x < pW; x++) {
      if (isOuterEdge || x < borderMargin || x >= pW - borderMargin) {
        continue;
      }

      const idx = (rowOffset + x) << 2;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];

      if (a < 30) {
        continue;
      }

      if (isTransparentBg) {
        if (a >= 30) {
          mask[rowOffset + x] = 1;
        }
        continue;
      }

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const colorDist = Math.max(Math.abs(r - bgR), Math.abs(g - bgG), Math.abs(b - bgB));

      if (bgLum >= 120) {
        const diffLum = bgLum - lum;
        const isWhite = r >= 250 && g >= 250 && b >= 250;
        if (!isWhite && (diffLum >= diffThreshold || colorDist >= colorDiffThreshold)) {
          mask[rowOffset + x] = 1;
        }
      } else {
        const diffLum = lum - bgLum;
        if (diffLum >= diffThreshold || colorDiffThreshold <= colorDist) {
          mask[rowOffset + x] = 1;
        }
      }
    }
  }

  // 5. Fechamento morfológico mínimo (raio 1, 3x3 em cruz)
  const processedMask = new Uint8Array(pW * pH);
  for (let y = 1; y < pH - 1; y++) {
    const rowOffset = y * pW;
    for (let x = 1; x < pW - 1; x++) {
      const idx = rowOffset + x;
      if (mask[idx] === 1) {
        processedMask[idx] = 1;
      } else {
        const c1 = mask[idx - 1] === 1 && mask[idx + 1] === 1;
        const c2 = mask[idx - pW] === 1 && mask[idx + pW] === 1;
        if (c1 || c2) {
          processedMask[idx] = 1;
        }
      }
    }
  }

  // 6. Detecção de Componentes Conexos (Flood Fill BFS)
  const componentMap = new Int32Array(pW * pH); // 0 = fundo, >0 = id do componente
  const components: ComponentInfo[] = [];
  let nextComponentId = 1;

  for (let y = 0; y < pH; y++) {
    for (let x = 0; x < pW; x++) {
      const idx = y * pW + x;
      if (processedMask[idx] === 1 && componentMap[idx] === 0) {
        const currentId = nextComponentId++;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let count = 0;

        const queue: number[] = [idx];
        componentMap[idx] = currentId;

        while (queue.length > 0) {
          const curr = queue.pop()!;
          count++;
          const cx = curr % pW;
          const cy = Math.floor(curr / pW);

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // 4 vizinhos conectados
          if (cx > 0) {
            const left = curr - 1;
            if (processedMask[left] === 1 && componentMap[left] === 0) {
              componentMap[left] = currentId;
              queue.push(left);
            }
          }
          if (cx < pW - 1) {
            const right = curr + 1;
            if (processedMask[right] === 1 && componentMap[right] === 0) {
              componentMap[right] = currentId;
              queue.push(right);
            }
          }
          if (cy > 0) {
            const up = curr - pW;
            if (processedMask[up] === 1 && componentMap[up] === 0) {
              componentMap[up] = currentId;
              queue.push(up);
            }
          }
          if (cy < pH - 1) {
            const down = curr + pW;
            if (processedMask[down] === 1 && componentMap[down] === 0) {
              componentMap[down] = currentId;
              queue.push(down);
            }
          }
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;

        // Filtra borda externa de página e ruídos mínimos
        const isFrameBorder = bw >= pW * 0.88 && bh >= pH * 0.88;
        const isNoise = bw < 6 || bh < 6 || count < 20;

        if (!isFrameBorder && !isNoise) {
          components.push({
            id: currentId,
            minX,
            minY,
            maxX,
            maxY,
            w: bw,
            h: bh,
            area: bw * bh,
            count,
            parentId: null,
            childIds: [],
          });
        }
      }
    }
  }

  // 7. Hierarquia interna (elementos dentro de outros, ex: olhos dentro de uma face)
  for (let i = 0; i < components.length; i++) {
    const c1 = components[i];
    for (let j = 0; j < components.length; j++) {
      if (i === j) continue;
      const c2 = components[j];
      const isInside =
        c1.minX >= c2.minX - 2 &&
        c1.maxX <= c2.maxX + 2 &&
        c1.minY >= c2.minY - 2 &&
        c1.maxY <= c2.maxY + 2 &&
        c2.area > c1.area * 1.15;

      if (isInside) {
        c1.parentId = c2.id;
        c2.childIds.push(c1.id);
        break;
      }
    }
  }

  // 7.1. Filtragem inteligente de textos sozinhos
  // Regra solicitada: "Não dividir textos sozinhos, apenas desenhos."
  const isStandaloneText = (comp: ComponentInfo, allComps: ComponentInfo[]): boolean => {
    // Se possui componentes filhos internos, é um molde/desenho com detalhes ou recortes (não é texto isolado)
    if (comp.childIds.length > 0) {
      return false;
    }

    const { w, h, count, area } = comp;
    const density = count / area;
    const aspect = w / h;

    // A. Letras, números ou caracteres avulsos sozinhos (ex: "1", "2x", "A", símbolos pequenos)
    if (w <= 36 && h <= 36 && count < 200) {
      return true;
    }

    // B. Linhas de texto ou legendas horizontais isoladas (ex: "MOLDE CABEÇA", "CORTAR 2X NO EVA")
    if (h <= 38 && aspect >= 2.0 && density < 0.35) {
      return true;
    }

    // C. Textos muito estreitos horizontalmente ou verticalmente
    if (h <= 24 && w < 300) {
      return true;
    }
    if (w <= 24 && h < 300) {
      return true;
    }

    // D. Agrupamento de pequenos caracteres alinhados na mesma linha horizontal (palavras/frases)
    if (h <= 40 && count < 260) {
      const cy = comp.minY + h / 2;
      const alignedNeighbors = allComps.filter((other) => {
        if (other.id === comp.id) return false;
        if (other.h > 44) return false;
        const otherCy = other.minY + other.h / 2;
        return Math.abs(cy - otherCy) <= 8 && Math.abs(comp.minX - other.minX) < 180;
      });
      if (alignedNeighbors.length >= 2) {
        return true;
      }
    }

    return false;
  };

  // Identifica componentes que são textos sozinhos
  const textCompIds = new Set<number>();
  for (const comp of components) {
    if (comp.parentId === null && isStandaloneText(comp, components)) {
      textCompIds.add(comp.id);
    }
  }

  // Desenhos raiz (componentes independentes excluindo textos sozinhos)
  let rootDrawings = components.filter(
    (c) => c.parentId === null && !textCompIds.has(c.id)
  );

  // Fallback se nada foi detectado (garante que nunca falhe)
  if (rootDrawings.length === 0) {
    rootDrawings = components.filter((c) => c.parentId === null);
  }

  if (rootDrawings.length === 0) {
    rootDrawings.push({
      id: 1,
      minX: 0,
      minY: 0,
      maxX: pW - 1,
      maxY: pH - 1,
      w: pW,
      h: pH,
      area: pW * pH,
      count: pW * pH,
      parentId: null,
      childIds: [],
    });
  }

  // 8. Cálculo de caixa justa ("recorte justo") para cada desenho
  const snugPad = typeof options.padding === 'number'
    ? Math.max(0, options.padding)
    : options.paddingMode === 'suave'
    ? Math.max(4, Math.round(8 / scale))
    : 2; // Padrão "justo": 2px de segurança para não cortar suavização de borda

  interface DrawingEnvelope {
    root: ComponentInfo;
    familyIds: Set<number>;
    origX0: number;
    origY0: number;
    origX1: number;
    origY1: number;
    cropX0: number;
    cropY0: number;
    cropX1: number;
    cropY1: number;
    w: number;
    h: number;
  }

  // Coleta caixas em coordenadas originais completas
  const envelopes: DrawingEnvelope[] = rootDrawings.map((root) => {
    const familyIds = new Set<number>([root.id, ...root.childIds]);

    // Limites no espaço reduzido (engloba raiz + filhos internos)
    let dMinX = root.minX;
    let dMinY = root.minY;
    let dMaxX = root.maxX;
    let dMaxY = root.maxY;

    for (const childId of root.childIds) {
      const ch = components.find((c) => c.id === childId);
      if (ch) {
        if (ch.minX < dMinX) dMinX = ch.minX;
        if (ch.maxX > dMaxX) dMaxX = ch.maxX;
        if (ch.minY < dMinY) dMinY = ch.minY;
        if (ch.maxY > dMaxY) dMaxY = ch.maxY;
      }
    }

    const origX0 = Math.max(0, Math.floor(dMinX / scale));
    const origY0 = Math.max(0, Math.floor(dMinY / scale));
    const origX1 = Math.min(origW, Math.ceil((dMaxX + 1) / scale));
    const origY1 = Math.min(origH, Math.ceil((dMaxY + 1) / scale));

    return {
      root,
      familyIds,
      origX0,
      origY0,
      origX1,
      origY1,
      cropX0: origX0,
      cropY0: origY0,
      cropX1: origX1,
      cropY1: origY1,
      w: origX1 - origX0,
      h: origY1 - origY0,
    };
  });

  // Ajusta margem justa de cada envelope sem invadir envelopes vizinhos
  for (let i = 0; i < envelopes.length; i++) {
    const env = envelopes[i];
    let padLeft = snugPad;
    let padRight = snugPad;
    let padTop = snugPad;
    let padBottom = snugPad;

    for (let j = 0; j < envelopes.length; j++) {
      if (i === j) continue;
      const other = envelopes[j];

      // Se vizinho está à direita e compartilha faixa vertical
      if (other.origX0 >= env.origX1 && !(other.origY1 < env.origY0 || other.origY0 > env.origY1)) {
        const gap = other.origX0 - env.origX1;
        padRight = Math.min(padRight, Math.max(0, Math.floor(gap / 2)));
      }
      // Se vizinho está à esquerda
      if (other.origX1 <= env.origX0 && !(other.origY1 < env.origY0 || other.origY0 > env.origY1)) {
        const gap = env.origX0 - other.origX1;
        padLeft = Math.min(padLeft, Math.max(0, Math.floor(gap / 2)));
      }
      // Se vizinho está abaixo
      if (other.origY0 >= env.origY1 && !(other.origX1 < env.origX0 || other.origX0 > env.origX1)) {
        const gap = other.origY0 - env.origY1;
        padBottom = Math.min(padBottom, Math.max(0, Math.floor(gap / 2)));
      }
      // Se vizinho está acima
      if (other.origY1 <= env.origY0 && !(other.origX1 < env.origX0 || other.origX0 > env.origX1)) {
        const gap = env.origY0 - other.origY1;
        padTop = Math.min(padTop, Math.max(0, Math.floor(gap / 2)));
      }
    }

    env.cropX0 = Math.max(0, env.origX0 - padLeft);
    env.cropY0 = Math.max(0, env.origY0 - padTop);
    env.cropX1 = Math.min(origW, env.origX1 + padRight);
    env.cropY1 = Math.min(origH, env.origY1 + padBottom);
    env.w = Math.max(1, env.cropX1 - env.cropX0);
    env.h = Math.max(1, env.cropY1 - env.cropY0);
  }

  // 9. Ordenação por leitura natural (de cima para baixo, esquerda para a direita)
  envelopes.sort((a, b) => {
    const rowThreshold = Math.max(20, Math.min(a.h, b.h) * 0.45);
    if (Math.abs(a.cropY0 - b.cropY0) > rowThreshold) {
      return a.cropY0 - b.cropY0;
    }
    return a.cropX0 - b.cropX0;
  });

  // 10. Extração de cada desenho COM LIMPEZA RIGOROSA DE RESTOS DE OUTROS DESENHOS E TEXTOS
  const results: DividedDrawing[] = [];

  for (let i = 0; i < envelopes.length; i++) {
    const env = envelopes[i];
    const { cropX0, cropY0, w: boxW, h: boxH, familyIds } = env;

    // Canvas intermediário da região
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = boxW;
    cropCanvas.height = boxH;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    if (!cropCtx) continue;

    cropCtx.drawImage(
      fullCanvas,
      cropX0,
      cropY0,
      boxW,
      boxH,
      0,
      0,
      boxW,
      boxH
    );

    const cropImgData = cropCtx.getImageData(0, 0, boxW, boxH);
    const cropPixels = cropImgData.data;

    // Matriz de pixels a serem apagados (pertencentes a outros desenhos ou textos isolados)
    const toClear = new Uint8Array(boxW * boxH);

    for (let cy = 0; cy < boxH; cy++) {
      const origY = cropY0 + cy;
      const py = Math.floor(origY * scale);
      if (py < 0 || py >= pH) continue;

      const rowOffset = cy * boxW;

      for (let cx = 0; cx < boxW; cx++) {
        const origX = cropX0 + cx;
        const px = Math.floor(origX * scale);
        if (px < 0 || px >= pW) continue;

        const compId = componentMap[py * pW + px];

        // Se o pixel pertence a OUTRO componente que não é da família deste desenho (incluindo textos)
        if (compId > 0 && !familyIds.has(compId)) {
          toClear[rowOffset + cx] = 1;
        }
      }
    }

    // Dilatação de segurança de 2px na área a ser limpa para remover anti-aliasing / sombras do outro desenho
    const dilatedClear = new Uint8Array(boxW * boxH);
    for (let cy = 0; cy < boxH; cy++) {
      for (let cx = 0; cx < boxW; cx++) {
        const idx = cy * boxW + cx;
        if (toClear[idx] === 1) {
          for (let dy = -2; dy <= 2; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= boxH) continue;
            for (let dx = -2; dx <= 2; dx++) {
              const nx = cx + dx;
              if (nx < 0 || nx >= boxW) continue;
              dilatedClear[ny * boxW + nx] = 1;
            }
          }
        }
      }
    }

    // Substitui restos de outros desenhos e textos pelo fundo (ou transparência)
    let hasClearedRemnants = false;
    for (let cy = 0; cy < boxH; cy++) {
      for (let cx = 0; cx < boxW; cx++) {
        const idx = cy * boxW + cx;
        if (dilatedClear[idx] === 1) {
          const pixelIdx = idx << 2;
          if (isTransparentBg) {
            cropPixels[pixelIdx + 3] = 0;
          } else {
            cropPixels[pixelIdx] = bgR;
            cropPixels[pixelIdx + 1] = bgG;
            cropPixels[pixelIdx + 2] = bgB;
            cropPixels[pixelIdx + 3] = 255;
          }
          hasClearedRemnants = true;
        }
      }
    }

    if (hasClearedRemnants) {
      cropCtx.putImageData(cropImgData, 0, 0);
    }

    // 11. Refinamento de recorte justo ("recorte justo")
    let tightMinX = boxW;
    let tightMinY = boxH;
    let tightMaxX = -1;
    let tightMaxY = -1;

    for (let cy = 0; cy < boxH; cy++) {
      const origY = cropY0 + cy;
      const py = Math.floor(origY * scale);
      if (py < 0 || py >= pH) continue;

      const rowOffset = cy * boxW;

      for (let cx = 0; cx < boxW; cx++) {
        if (dilatedClear[rowOffset + cx] === 1) continue;

        const origX = cropX0 + cx;
        const px = Math.floor(origX * scale);
        if (px < 0 || px >= pW) continue;

        const compId = componentMap[py * pW + px];
        if (familyIds.has(compId)) {
          if (cx < tightMinX) tightMinX = cx;
          if (cx > tightMaxX) tightMaxX = cx;
          if (cy < tightMinY) tightMinY = cy;
          if (cy > tightMaxY) tightMaxY = cy;
        }
      }
    }

    let finalCanvas = cropCanvas;
    let finalW = boxW;
    let finalH = boxH;
    let finalOrigX = cropX0;
    let finalOrigY = cropY0;

    // Se encontrou os limites precisos do desenho, faz o recorte justo
    if (tightMaxX >= tightMinX && tightMaxY >= tightMinY) {
      const tightMargin = Math.max(1, Math.min(3, snugPad));
      const subX0 = Math.max(0, tightMinX - tightMargin);
      const subY0 = Math.max(0, tightMinY - tightMargin);
      const subX1 = Math.min(boxW, tightMaxX + 1 + tightMargin);
      const subY1 = Math.min(boxH, tightMaxY + 1 + tightMargin);

      const subW = Math.max(1, subX1 - subX0);
      const subH = Math.max(1, subY1 - subY0);

      const tightCanvas = document.createElement('canvas');
      tightCanvas.width = subW;
      tightCanvas.height = subH;
      const tightCtx = tightCanvas.getContext('2d');

      if (tightCtx) {
        tightCtx.drawImage(
          cropCanvas,
          subX0,
          subY0,
          subW,
          subH,
          0,
          0,
          subW,
          subH
        );
        finalCanvas = tightCanvas;
        finalW = subW;
        finalH = subH;
        finalOrigX = cropX0 + subX0;
        finalOrigY = cropY0 + subY0;
      }
    }

    const dataUrl = finalCanvas.toDataURL('image/png');
    const blob = await canvasToBlob(finalCanvas);

    results.push({
      id: i + 1,
      dataUrl,
      blob,
      width: finalW,
      height: finalH,
      selected: true, // Todas as partes são sempre selecionadas/adicionadas
      x: finalOrigX,
      y: finalOrigY,
    });
  }

  return results;
}

/**
 * Exporta as partes dos desenhos para um documento Word (.docx)
 * - Cada desenho é mantido SEPARADO (imagem individual no Word).
 * - Todos os desenhos alinhados em disposição com o texto (em linha com o texto).
 * - Quando houver mais de uma parte por folha, dispostos em grade alinhada sem bordas.
 */
export async function exportDrawingsToWord(
  drawings: DividedDrawing[],
  fileName = 'desenhos_divididos.docx',
  partesPorFolha = 1,
  _orientation: Orientation = 'vertical',
  origWidthPx?: number,
  origHeightPx?: number
): Promise<void> {
  const activeDrawings = drawings.filter((d) => d.selected !== false);
  if (activeDrawings.length === 0) {
    throw new Error('Nenhum desenho selecionado para salvar');
  }

  // Página A4 Retrato fixa
  const pageW_dxa = 11906; // 210mm A4
  const pageH_dxa = 16838; // 297mm A4

  // Dimensões úteis do Word em pontos (Word A4 Retrato com margens de 0.5 pol = 720 dxa = 36 pt)
  const maxTargetW = 515;
  const maxTargetH = 740;

  const validPartesPorFolha = Math.max(1, partesPorFolha);

  const paragraphChildren: (ImageRun | TextRun)[] = [];

  // Se o usuário selecionou mais de 1 parte por folha explicitamente
  if (validPartesPorFolha > 1) {
    const { cols, rows } = getGridColsRows(validPartesPorFolha, true);
    const cellMaxW = Math.max(60, Math.floor(maxTargetW / cols));
    const cellMaxH = Math.max(60, Math.floor(maxTargetH / rows));

    for (let i = 0; i < activeDrawings.length; i++) {
      const drawing = activeDrawings[i];
      const uint8 = dataUrlToUint8Array(drawing.dataUrl);

      const aspect = drawing.width / drawing.height;
      let targetW = cellMaxW;
      let targetH = targetW / aspect;

      if (targetH > cellMaxH) {
        targetH = cellMaxH;
        targetW = targetH * aspect;
      }

      if (i > 0) {
        paragraphChildren.push(new TextRun({ text: ' ' }));
      }

      paragraphChildren.push(
        new ImageRun({
          type: 'png',
          data: uint8,
          transformation: {
            width: Math.round(targetW),
            height: Math.round(targetH),
          },
        })
      );
    }
  } else {
    // validPartesPorFolha === 1:
    // "No word, se o desenho cabe na pagina anterior, colocar, nao fazer quebra de pagina, independente do painel de visualização"
    if (activeDrawings.length === 1) {
      // Único desenho: ajusta para preencher bem a folha A4 mantendo proporção
      const drawing = activeDrawings[0];
      const uint8 = dataUrlToUint8Array(drawing.dataUrl);
      const aspect = drawing.width / drawing.height;
      let targetW = maxTargetW;
      let targetH = targetW / aspect;
      if (targetH > maxTargetH) {
        targetH = maxTargetH;
        targetW = targetH * aspect;
      }
      paragraphChildren.push(
        new ImageRun({
          type: 'png',
          data: uint8,
          transformation: {
            width: Math.round(targetW),
            height: Math.round(targetH),
          },
        })
      );
    } else {
      // Múltiplos desenhos:
      // Mantém a proporção real em relação à imagem/folha original,
      // permitindo que desenhos caibam juntos na mesma página no Word se houver espaço
      const refW = origWidthPx || Math.max(...activeDrawings.map((d) => d.x + d.width), 100);
      const refH = origHeightPx || Math.max(...activeDrawings.map((d) => d.y + d.height), 100);
      const propScale = Math.min(maxTargetW / refW, maxTargetH / refH);

      for (let i = 0; i < activeDrawings.length; i++) {
        const drawing = activeDrawings[i];
        const uint8 = dataUrlToUint8Array(drawing.dataUrl);

        let targetW = Math.round(drawing.width * propScale);
        let targetH = Math.round(drawing.height * propScale);

        // Limites de segurança (nunca maior que a área útil de uma página)
        if (targetW > maxTargetW) {
          const ratio = maxTargetW / targetW;
          targetW = maxTargetW;
          targetH = Math.round(targetH * ratio);
        }
        if (targetH > maxTargetH) {
          const ratio = maxTargetH / targetH;
          targetH = maxTargetH;
          targetW = Math.round(targetW * ratio);
        }

        // Garante tamanho mínimo visível e editável
        targetW = Math.max(50, targetW);
        targetH = Math.max(50, targetH);

        if (i > 0) {
          paragraphChildren.push(new TextRun({ text: ' ' }));
        }

        paragraphChildren.push(
          new ImageRun({
            type: 'png',
            data: uint8,
            transformation: {
              width: targetW,
              height: targetH,
            },
          })
        );
      }
    }
  }

  // Coloca todos os desenhos selecionados juntos em fluxo contínuo,
  // um após o outro, sem tabelas, sem espaçamento e sem quebra de página manual.
  // Se o desenho couber na página anterior, o Word o mantém nela naturalmente.
  const docParagraph = new Paragraph({
    spacing: { before: 0, after: 0, line: 240 },
    children: paragraphChildren,
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: pageW_dxa,
              height: pageH_dxa,
            },
            margin: {
              top: 720,
              bottom: 720,
              left: 720,
              right: 720,
            },
          },
        },
        children: [docParagraph],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exporta os desenhos selecionados como imagem PNG (ou ZIP se forem vários)
 */
export async function exportDrawingsToPng(
  drawings: DividedDrawing[],
  baseName = 'desenhos_divididos'
): Promise<void> {
  const activeDrawings = drawings.filter((d) => d.selected !== false);
  if (activeDrawings.length === 0) {
    throw new Error('Nenhum desenho selecionado para salvar');
  }

  if (activeDrawings.length === 1) {
    // Apenas 1 desenho: download direto do PNG
    const drawing = activeDrawings[0];
    const link = document.createElement('a');
    link.href = drawing.dataUrl;
    link.download = `${baseName}_01.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  // Múltiplos desenhos: compacta em arquivo ZIP
  const zip = new JSZip();

  for (let i = 0; i < activeDrawings.length; i++) {
    const drawing = activeDrawings[i];
    const num = String(i + 1).padStart(2, '0');
    const bytes = dataUrlToUint8Array(drawing.dataUrl);
    zip.file(`${baseName}_${num}.png`, bytes);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
