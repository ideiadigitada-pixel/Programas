import { jsPDF } from 'jspdf';
import {
  PosterConfig,
  MontagemConfig,
  ImageInfo,
  FOLHA_MAIOR,
  FOLHA_MENOR,
} from '../types';
import {
  calculatePosterSheets,
  calculateMontagemDimensions,
  getPageDimensions,
} from './calculations';

export async function generatePosterPdf(
  imageInfo: ImageInfo,
  config: PosterConfig,
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  const page = getPageDimensions(config.orientation);
  const pdf = new jsPDF({
    orientation: config.orientation === 'vertical' ? 'portrait' : 'landscape',
    unit: 'cm',
    format: [page.width, page.height],
  });

  const { sheets, nonEmptySheets, usableW, usableH } = calculatePosterSheets(
    config,
    imageInfo.widthPx,
    imageInfo.heightPx
  );

  const img = imageInfo.imgElement;
  let pageCount = 0;

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    if (sheet.isEmpty) continue;

    if (pageCount > 0) {
      pdf.addPage([page.width, page.height], config.orientation === 'vertical' ? 'portrait' : 'landscape');
    }
    pageCount++;

    onProgress?.(
      Math.round((pageCount / nonEmptySheets) * 100),
      `Gerando página ${pageCount} de ${nonEmptySheets}...`
    );

    // If cutBorder is enabled, fill background in margins with light gray (#E5E7EB)
    if (config.cutBorder) {
      pdf.setFillColor(229, 231, 235);
      pdf.rect(0, 0, page.width, page.height, 'F');
    }

    // High quality canvas slice of the image
    const sourceX = Math.round(sheet.cropX * img.naturalWidth);
    const sourceY = Math.round(sheet.cropY * img.naturalHeight);
    const sourceW = Math.max(1, Math.round(sheet.cropW * img.naturalWidth));
    const sourceH = Math.max(1, Math.round(sheet.cropH * img.naturalHeight));

    // Target slice canvas
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = sourceW;
    sliceCanvas.height = sourceH;
    const ctx = sliceCanvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceW,
        sourceH,
        0,
        0,
        sourceW,
        sourceH
      );

      const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.95);

      pdf.addImage(
        sliceDataUrl,
        'JPEG',
        config.marginCm,
        config.marginCm,
        sheet.drawW,
        sheet.drawH,
        undefined,
        'FAST'
      );
    }

    // "RECORTE AQUI" cutting marks (matches TEXTO_BORDA in Python)
    if (config.cutMarks) {
      pdf.setFont('Helvetica', 'normal');
      pdf.setFontSize(5.5);
      pdf.setTextColor(74, 84, 105);

      const tagText = 'RECORTE AQUI';

      // Top margin marks (if row > 0)
      if (sheet.row > 0) {
        const yTop = Math.max(0.18, config.marginCm - 0.08);
        const steps = 5;
        for (let s = 1; s <= steps; s++) {
          const xPos = 0.5 + ((page.width - 1.0) * s) / (steps + 1);
          pdf.text(tagText, xPos, yTop, { align: 'center' });
        }
      }

      // Left margin marks (if col > 0)
      if (sheet.col > 0) {
        const xLeft = Math.max(0.18, config.marginCm - 0.08);
        const steps = 7;
        for (let s = 1; s <= steps; s++) {
          const yPos = 0.5 + ((page.height - 1.0) * s) / (steps + 1);
          pdf.text(tagText, xLeft, yPos, { angle: 90, align: 'center' });
        }
      }
    }
  }

  const cleanName = imageInfo.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  pdf.save(`${cleanName}_poster.pdf`);
}

export async function generateMontagemPdf(
  imageInfo: ImageInfo,
  config: MontagemConfig,
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  const { cardW, cardH, spacing, pageW, pageH, quantity } = calculateMontagemDimensions(
    config,
    imageInfo.widthPx,
    imageInfo.heightPx
  );

  onProgress?.(30, 'Preparando montagem para PDF...');

  const pdf = new jsPDF({
    orientation: config.orientation === 'vertical' ? 'portrait' : 'landscape',
    unit: 'cm',
    format: [pageW, pageH],
  });

  const gradeX = config.marginCm;
  const gradeY = config.marginCm;

  // Prepare image slice or full image
  const img = imageInfo.imgElement;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a imagem.');
  ctx.drawImage(img, 0, 0);
  const imgDataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);

  let drawnCount = 0;
  for (let r = 0; r < config.fV; r++) {
    for (let c = 0; c < config.fH; c++) {
      if (drawnCount >= quantity) break;

      const cardX = gradeX + c * (cardW + spacing);
      const cardY = gradeY + r * (cardH + spacing);

      if (config.keepRatio) {
        const aspect = imageInfo.widthPx / imageInfo.heightPx;
        let drawW = cardW;
        let drawH = drawW / aspect;
        if (drawH > cardH) {
          drawH = cardH;
          drawW = drawH * aspect;
        }
        const offsetX = (cardW - drawW) / 2;
        const offsetY = (cardH - drawH) / 2;

        pdf.addImage(imgDataUrl, 'JPEG', cardX + offsetX, cardY + offsetY, drawW, drawH);
      } else {
        pdf.addImage(imgDataUrl, 'JPEG', cardX, cardY, cardW, cardH);
      }

      if (config.cardBorder) {
        pdf.setDrawColor(185, 194, 206);
        pdf.setLineWidth(0.03);
        pdf.rect(cardX, cardY, cardW, cardH, 'S');
      }

      drawnCount++;
      onProgress?.(
        Math.round((drawnCount / quantity) * 100),
        `Inserindo cartão ${drawnCount} de ${quantity}...`
      );
    }
  }

  const cleanName = imageInfo.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  pdf.save(`${cleanName}_montagem.pdf`);
}
