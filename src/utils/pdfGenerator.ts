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

  const { sheets, nonEmptySheets } = calculatePosterSheets(
    config,
    imageInfo.widthPx,
    imageInfo.heightPx
  );

  const img = imageInfo.imgElement;
  const includeMontage = Boolean(config.includeMontage);
  const totalPages = nonEmptySheets + (includeMontage ? 1 : 0);
  let pageCount = 0;

  // -------------------------------------------------------------------------
  // PAGE 1: MODELO MONTADO DO PÔSTER (GUIA DE MONTAGEM)
  // -------------------------------------------------------------------------
  if (includeMontage) {
    pageCount++;
    onProgress?.(
      Math.round((pageCount / totalPages) * 100),
      `Gerando modelo montado do pôster (página 1 de ${totalPages})...`
    );

    // Header Title
    pdf.setFont('Helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(30, 41, 59);
    pdf.text('MODELO MONTADO DO PÔSTER', page.width / 2, 1.4, { align: 'center' });

    // Header Subtitle / Details
    pdf.setFont('Helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(71, 85, 105);
    const dimText = `Tamanho montado: ${config.widthCm.toFixed(1).replace('.', ',')} × ${config.heightCm.toFixed(1).replace('.', ',')} cm  |  Divisão: ${config.fH} col × ${config.fV} lin (${nonEmptySheets} folhas de impressão)`;
    pdf.text(dimText, page.width / 2, 1.95, { align: 'center' });

    // Decorative divider line
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.025);
    pdf.line(1.2, 2.2, page.width - 1.2, 2.2);

    // Compute preview placement keeping poster aspect ratio
    const topY = 2.5;
    const bottomY = page.height - 1.2;
    const sideMargin = 1.2;
    const availW = page.width - sideMargin * 2;
    const availH = bottomY - topY;

    // Gap/margem entre as folhas na miniatura montada
    const gapCm = Math.min(0.25, Math.max(0.12, 1.2 / Math.max(config.fH, config.fV)));
    const totalGapsW = (config.fH - 1) * gapCm;
    const totalGapsH = (config.fV - 1) * gapCm;
    const netAvailW = Math.max(1, availW - totalGapsW);
    const netAvailH = Math.max(1, availH - totalGapsH);

    const posterAspect = config.widthCm / config.heightCm;
    const netAspect = netAvailW / netAvailH;

    let miniW: number;
    let miniH: number;
    if (posterAspect > netAspect) {
      miniW = netAvailW;
      miniH = netAvailW / posterAspect;
    } else {
      miniH = netAvailH;
      miniW = netAvailH * posterAspect;
    }

    const totalMontageW = miniW + totalGapsW;
    const totalMontageH = miniH + totalGapsH;
    const startX = (page.width - totalMontageW) / 2;
    const startY = topY + (availH - totalMontageH) / 2;

    // Canvas reutilizável para miniaturas das fatias
    const thumbCanvas = document.createElement('canvas');
    const thumbCtx = thumbCanvas.getContext('2d');

    // Desenha cada folha com separação (margem) entre elas, linhas de grade pretas e nomes Pág. em preto
    let printedSheetCounter = 0;
    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i];

      const sheetX = startX + sheet.cropX * miniW + sheet.col * gapCm;
      const sheetY = startY + sheet.cropY * miniH + sheet.row * gapCm;
      const sheetW = sheet.cropW * miniW;
      const sheetH = sheet.cropH * miniH;

      if (sheet.isEmpty) {
        // Folha vazia na grade
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(128, 128, 128);
        pdf.setLineWidth(0.025);
        pdf.rect(sheetX, sheetY, sheetW, sheetH, 'FD');
        pdf.setDrawColor(203, 213, 225);
        pdf.line(sheetX, sheetY, sheetX + sheetW, sheetY + sheetH);
        pdf.line(sheetX + sheetW, sheetY, sheetX, sheetY + sheetH);
        continue;
      }

      printedSheetCounter++;

      // Imagem da fatia da folha
      const sourceX = Math.round(sheet.cropX * img.naturalWidth);
      const sourceY = Math.round(sheet.cropY * img.naturalHeight);
      const sourceW = Math.max(1, Math.round(sheet.cropW * img.naturalWidth));
      const sourceH = Math.max(1, Math.round(sheet.cropH * img.naturalHeight));

      const maxThumb = 800;
      let targetW = sourceW;
      let targetH = sourceH;
      if (targetW > maxThumb || targetH > maxThumb) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxThumb) / targetW);
          targetW = maxThumb;
        } else {
          targetW = Math.round((targetW * maxThumb) / targetH);
          targetH = maxThumb;
        }
      }

      thumbCanvas.width = targetW;
      thumbCanvas.height = targetH;
      if (thumbCtx) {
        thumbCtx.imageSmoothingEnabled = true;
        thumbCtx.imageSmoothingQuality = 'high';
        thumbCtx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, targetW, targetH);
        const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.90);
        pdf.addImage(thumbDataUrl, 'JPEG', sheetX, sheetY, sheetW, sheetH, undefined, 'FAST');
      }

      // Linha de grade da folha em CINZA (com margem branca entre as folhas)
      pdf.setDrawColor(128, 128, 128);
      pdf.setLineWidth(0.035);
      pdf.rect(sheetX, sheetY, sheetW, sheetH, 'S');

      // Selo com nome da página (Pág. X) em PRETO - tamanho dinâmico conforme a quantidade de folhas na grade
      const sheetCount = config.fH * config.fV;
      let baseFontSize = 13.5;
      if (sheetCount > 25) {
        baseFontSize = 7.5;
      } else if (sheetCount > 16) {
        baseFontSize = 8.5;
      } else if (sheetCount > 9) {
        baseFontSize = 10.5;
      } else if (sheetCount > 6) {
        baseFontSize = 11.5;
      } else if (sheetCount > 4) {
        baseFontSize = 12.5;
      } else {
        baseFontSize = 14;
      }

      const minDim = Math.min(sheetW, sheetH);
      const maxAllowedFont = Math.max(6.5, minDim * 2.2);
      const badgeFontSize = Math.min(baseFontSize, maxAllowedFont);

      const badgeText = `Pág. ${printedSheetCounter}`;
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(badgeFontSize);

      const textWidth = pdf.getTextWidth(badgeText);
      const badgePadX = Math.max(0.18, badgeFontSize * 0.02);
      const badgeH = badgeFontSize * 0.058;
      const badgeW = textWidth + badgePadX * 2;
      const badgeX = sheetX + (sheetW - badgeW) / 2;
      const badgeY = sheetY + (sheetH - badgeH) / 2;

      // Fundo branco com borda cinza para excelente legibilidade
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(128, 128, 128);
      pdf.setLineWidth(0.025);
      pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 0.08, 0.08, 'FD');

      // Texto Pág. em PRETO
      pdf.setTextColor(0, 0, 0);
      pdf.text(badgeText, badgeX + badgeW / 2, badgeY + badgeH * 0.72, { align: 'center' });
    }

    // Bottom note
    pdf.setFont('Helvetica', 'italic');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      '* Guia de montagem do pôster. As páginas seguintes contêm as folhas individuais em tamanho real para impressão.',
      page.width / 2,
      page.height - 0.6,
      { align: 'center' }
    );
  }

  // -------------------------------------------------------------------------
  // PRINT PAGES: INDIVIDUAL POSTER SHEETS
  // -------------------------------------------------------------------------
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    if (sheet.isEmpty) continue;

    if (pageCount > 0) {
      pdf.addPage([page.width, page.height], config.orientation === 'vertical' ? 'portrait' : 'landscape');
    }
    pageCount++;

    onProgress?.(
      Math.round((pageCount / totalPages) * 100),
      `Gerando página ${pageCount} de ${totalPages}...`
    );

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

    // Marcas de corte (marcas nos cantos e guias nas bordas)
    if (config.cutMarks) {
      const x1 = config.marginCm;
      const y1 = config.marginCm;
      const x2 = config.marginCm + sheet.drawW;
      const y2 = config.marginCm + sheet.drawH;

      const markLen = 0.4; // 4 mm
      const markGap = 0.05; // 0.5 mm

      pdf.setDrawColor(100, 116, 139); // slate-500
      pdf.setLineWidth(0.025); // traço fino e nítido

      // 1. Canto Superior Esquerdo
      pdf.line(x1, Math.max(0.1, y1 - markGap - markLen), x1, Math.max(0.1, y1 - markGap));
      pdf.line(Math.max(0.1, x1 - markGap - markLen), y1, Math.max(0.1, x1 - markGap), y1);

      // 2. Canto Superior Direito
      pdf.line(x2, Math.max(0.1, y1 - markGap - markLen), x2, Math.max(0.1, y1 - markGap));
      pdf.line(Math.min(page.width - 0.1, x2 + markGap), y1, Math.min(page.width - 0.1, x2 + markGap + markLen), y1);

      // 3. Canto Inferior Esquerdo
      pdf.line(x1, Math.min(page.height - 0.1, y2 + markGap), x1, Math.min(page.height - 0.1, y2 + markGap + markLen));
      pdf.line(Math.max(0.1, x1 - markGap - markLen), y2, Math.max(0.1, x1 - markGap), y2);

      // 4. Canto Inferior Direito
      pdf.line(x2, Math.min(page.height - 0.1, y2 + markGap), x2, Math.min(page.height - 0.1, y2 + markGap + markLen));
      pdf.line(Math.min(page.width - 0.1, x2 + markGap), y2, Math.min(page.width - 0.1, x2 + markGap + markLen), y2);

      // Guias de texto nas bordas de sobreposição para unir as folhas (apenas até as marcas de corte, onde há impressão)
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(6);
      pdf.setTextColor(74, 84, 105);

      const tagText = 'RECORTE AQUI';
      const tagWidth = pdf.getTextWidth(tagText);

      // Top margin marks (if row > 0) - apenas da marca de corte x1 até x2 (onde há impressão)
      if (sheet.row > 0 && sheet.drawW > 0.5) {
        const yTop = Math.max(0.25, config.marginCm - 0.1);
        const spanW = sheet.drawW;
        const numTagsW = Math.max(1, Math.floor(spanW / 3.2));
        for (let s = 1; s <= numTagsW; s++) {
          const xPos = x1 + (spanW * s) / (numTagsW + 1);
          pdf.text(tagText, xPos, yTop, { align: 'center' });
        }
      }

      // Left margin marks (if col > 0) - apenas da marca de corte y1 até y2 (onde há impressão)
      if (sheet.col > 0 && sheet.drawH > 0.5) {
        const xLeft = Math.max(0.25, config.marginCm - 0.1);
        const spanH = sheet.drawH;
        const numTagsH = Math.max(1, Math.floor(spanH / 3.2));
        for (let s = 1; s <= numTagsH; s++) {
          const yPos = y1 + (spanH * s) / (numTagsH + 1);
          // Angle 90 draws text upwards; centering vertically by offsetting yPos by half tagWidth
          pdf.text(tagText, xLeft, yPos + tagWidth / 2, { angle: 90 });
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
  const { cardW, cardH, spacing, pageW, pageH, totalCards, quantity } = calculateMontagemDimensions(
    config,
    imageInfo.widthPx,
    imageInfo.heightPx
  );

  const cardsPerPage = totalCards;
  const totalPages = Math.max(1, Math.ceil(quantity / cardsPerPage));

  onProgress?.(10, 'Preparando montagem para PDF...');

  const pdf = new jsPDF({
    orientation: config.orientation === 'vertical' ? 'portrait' : 'landscape',
    unit: 'cm',
    format: [pageW, pageH],
  });

  const fixedMarginCm = 0.4;
  const gradeX = fixedMarginCm;
  const gradeY = fixedMarginCm;

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

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) {
      pdf.addPage([pageW, pageH], config.orientation === 'vertical' ? 'portrait' : 'landscape');
    }

    const startCardIndex = p * cardsPerPage;
    const cardsOnThisPage = Math.min(cardsPerPage, quantity - startCardIndex);

    let drawnOnPage = 0;
    for (let r = 0; r < config.fV; r++) {
      for (let c = 0; c < config.fH; c++) {
        if (drawnOnPage >= cardsOnThisPage) break;

        const cardX = gradeX + c * (cardW + spacing);
        const cardY = gradeY + r * (cardH + spacing);

        // Não colocar cartões que ultrapassem os limites da folha / margem
        if (cardX + cardW > pageW - fixedMarginCm + 0.001 || cardY + cardH > pageH - fixedMarginCm + 0.001) {
          continue;
        }

        // Insere a imagem ocupando o cartão proporcional
        pdf.addImage(imgDataUrl, 'JPEG', cardX, cardY, cardW, cardH);

        if (config.cardBorder) {
          pdf.setDrawColor(185, 194, 206);
          pdf.setLineWidth(0.03);
          pdf.rect(cardX, cardY, cardW, cardH, 'S');
        }

        drawnOnPage++;
        drawnCount++;
        onProgress?.(
          Math.round((drawnCount / quantity) * 100),
          `Inserindo cartão ${drawnCount} de ${quantity} (página ${p + 1} de ${totalPages})...`
        );
      }
    }
  }

  const cleanName = imageInfo.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  pdf.save(`${cleanName}_montagem.pdf`);
}
