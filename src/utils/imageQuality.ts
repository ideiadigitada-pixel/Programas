import { ImageInfo, DPI_PADRAO } from '../types';

/**
 * Aplica um filtro sutil de nitidez (sharpening convolution) na imagem do canvas.
 * Preserva o brilho total (soma dos pesos = 1) e melhora a definição de bordas e detalhes.
 */
export function applySharpen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strength: number = 0.22
): void {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const src = imgData.data;
    const output = ctx.createImageData(width, height);
    const dst = output.data;

    const a = strength;
    const centerWeight = 1 + 4 * a;
    const rowStride = width * 4;

    for (let y = 0; y < height; y++) {
      const yTop = y > 0 ? y - 1 : y;
      const yBottom = y < height - 1 ? y + 1 : y;

      const rowOffset = y * rowStride;
      const topOffset = yTop * rowStride;
      const bottomOffset = yBottom * rowStride;

      for (let x = 0; x < width; x++) {
        const xLeft = x > 0 ? x - 1 : x;
        const xRight = x < width - 1 ? x + 1 : x;

        const px = rowOffset + x * 4;
        const pxLeft = rowOffset + xLeft * 4;
        const pxRight = rowOffset + xRight * 4;
        const pxTop = topOffset + x * 4;
        const pxBottom = bottomOffset + x * 4;

        // Canal R
        const r =
          src[px] * centerWeight -
          (src[pxTop] + src[pxBottom] + src[pxLeft] + src[pxRight]) * a;
        dst[px] = r < 0 ? 0 : r > 255 ? 255 : r;

        // Canal G
        const g =
          src[px + 1] * centerWeight -
          (src[pxTop + 1] + src[pxBottom + 1] + src[pxLeft + 1] + src[pxRight + 1]) * a;
        dst[px + 1] = g < 0 ? 0 : g > 255 ? 255 : g;

        // Canal B
        const b =
          src[px + 2] * centerWeight -
          (src[pxTop + 2] + src[pxBottom + 2] + src[pxLeft + 2] + src[pxRight + 2]) * a;
        dst[px + 2] = b < 0 ? 0 : b > 255 ? 255 : b;

        // Canal A (preserva transparência original)
        dst[px + 3] = src[px + 3];
      }
    }

    ctx.putImageData(output, 0, 0);
  } catch (e) {
    console.warn('Não foi possível aplicar filtro de nitidez:', e);
  }
}

/**
 * Redimensiona a imagem para alta resolução de acordo com as dimensões do pôster final
 * e o tamanho da imagem original, aplicando escalonamento progressivo e um toque de nitidez.
 */
export function resizeImageForPosterResolution(
  baseImage: ImageInfo,
  posterWidthCm: number,
  posterHeightCm: number,
  targetDpi: number = DPI_PADRAO
): Promise<ImageInfo> {
  return new Promise((resolve) => {
    const origW = baseImage.widthPx;
    const origH = baseImage.heightPx;

    // Calcular resolução alvo de acordo com o tamanho do pôster final
    const targetW = Math.round((posterWidthCm / 2.54) * targetDpi);
    const targetH = Math.round((posterHeightCm / 2.54) * targetDpi);

    const scaleFactor = Math.max(targetW / origW, targetH / origH);

    // Limite máximo seguro para estabilidade e memória do navegador
    const MAX_DIM = 6000;
    let newW = origW;
    let newH = origH;

    if (scaleFactor > 1) {
      newW = Math.round(origW * scaleFactor);
      newH = Math.round(origH * scaleFactor);

      if (newW > MAX_DIM || newH > MAX_DIM) {
        const cap = Math.min(MAX_DIM / newW, MAX_DIM / newH);
        newW = Math.round(newW * cap);
        newH = Math.round(newH * cap);
      }

      newW = Math.max(newW, origW);
      newH = Math.max(newH, origH);
    }

    // Canvas inicial com a imagem original
    let currentCanvas = document.createElement('canvas');
    currentCanvas.width = origW;
    currentCanvas.height = origH;
    let currentCtx = currentCanvas.getContext('2d');
    if (!currentCtx) {
      resolve(baseImage);
      return;
    }
    currentCtx.drawImage(baseImage.imgElement, 0, 0);

    // Escalonamento progressivo (se necessário aumentar)
    if (newW > origW || newH > origH) {
      let curW = origW;
      let curH = origH;

      while (curW < newW || curH < newH) {
        const nextW = Math.min(newW, Math.round(curW * 2));
        const nextH = Math.min(newH, Math.round(curH * 2));

        const nextCanvas = document.createElement('canvas');
        nextCanvas.width = nextW;
        nextCanvas.height = nextH;
        const nextCtx = nextCanvas.getContext('2d');
        if (!nextCtx) break;

        nextCtx.imageSmoothingEnabled = true;
        nextCtx.imageSmoothingQuality = 'high';
        nextCtx.drawImage(currentCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);

        currentCanvas = nextCanvas;
        currentCtx = nextCtx;
        curW = nextW;
        curH = nextH;
      }
    }

    // Aplica nitidez na imagem redimensionada
    if (currentCtx) {
      applySharpen(currentCtx, newW, newH, 0.22);
    }

    currentCanvas.toBlob((blob) => {
      if (!blob) {
        resolve(baseImage);
        return;
      }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        resolve({
          name: baseImage.name,
          url,
          imgElement: img,
          widthPx: newW,
          heightPx: newH,
          widthCm: (newW / DPI_PADRAO) * 2.54,
          heightCm: (newH / DPI_PADRAO) * 2.54,
        });
      };
      img.onerror = () => {
        resolve(baseImage);
      };
      img.src = url;
    }, 'image/png');
  });
}
