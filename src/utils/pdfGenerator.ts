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
  calculatePosterSavings,
  calculateMontagemDimensions,
  getPageDimensions,
} from './calculations';
import { applySharpen } from './imageQuality';

function getTagText(isRecorte: boolean, pageNumber: number, spanCm: number): string {
  if (isRecorte) {
    return spanCm < 3.8 ? 'RECOR...' : 'RECORTE AQUI';
  }
  return spanCm < 3.8 ? `PÁG. ${pageNumber}` : `PÁGINA ${pageNumber}`;
}

export function getSheetSeams(
  sheet: { col: number; row: number },
  config: PosterConfig
): { hasLeftSeam: boolean; hasRightSeam: boolean; hasTopSeam: boolean; hasBottomSeam: boolean } {
  if (config.letrasPorPagina) {
    const horizontalSeams = config.seams?.horizontalSeams || [];
    const verticalSeams = config.seams?.verticalSeams || [];

    const hasLeftSeam = horizontalSeams.some(
      (s) => s.colRight === sheet.col && s.row === sheet.row
    );
    const hasRightSeam = horizontalSeams.some(
      (s) => s.colLeft === sheet.col && s.row === sheet.row
    );
    const hasTopSeam = verticalSeams.some(
      (s) => s.rowBottom === sheet.row && s.col === sheet.col
    );
    const hasBottomSeam = verticalSeams.some(
      (s) => s.rowTop === sheet.row && s.col === sheet.col
    );

    return { hasLeftSeam, hasRightSeam, hasTopSeam, hasBottomSeam };
  }

  // Padrão do pôster contínuo tradicional:
  return {
    hasLeftSeam: sheet.col > 0,
    hasRightSeam: sheet.col < config.fH - 1,
    hasTopSeam: sheet.row > 0,
    hasBottomSeam: sheet.row < config.fV - 1,
  };
}

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
  if (img && !img.complete && typeof img.decode === 'function') {
    try {
      await img.decode();
    } catch {
      // fallback se decode falhar
    }
  }
  const includeMontage = Boolean(config.includeMontage);
  const isEconomizeActive = Boolean(config.economizarFolhas);
  const savingsInfo = calculatePosterSavings(config, imageInfo.widthPx, imageInfo.heightPx);
  const useSavings = isEconomizeActive && savingsInfo.canEconomize;

  const actualPrintSheets = useSavings ? savingsInfo.optimizedNonEmptySheets : nonEmptySheets;
  const totalPages = actualPrintSheets + (includeMontage ? 1 : 0);
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
    const economizeNote = useSavings
      ? `  |  Economia: -${savingsInfo.savedSheets} ${savingsInfo.savedSheets === 1 ? 'folha' : 'folhas'} (${savingsInfo.fractionLabel})`
      : '';
    const dimText = `Tamanho montado: ${config.widthCm.toFixed(1).replace('.', ',')} × ${config.heightCm.toFixed(1).replace('.', ',')} cm  |  Divisão: ${config.fH} col × ${config.fV} lin (${actualPrintSheets} folhas de impressão${economizeNote})`;
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

      // No poster montado, deixar o número de página dividida no mesmo tamanho das páginas inteiras, apenas com o destaque em verde
      const badgeFontSize = baseFontSize;

      const mapped = useSavings ? savingsInfo.sheetPageMap.get(`${sheet.col}-${sheet.row}`) : null;
      const pageNum = mapped ? mapped.pageNumber : printedSheetCounter;
      const badgeText = String(pageNum);

      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(badgeFontSize);

      const textWidth = pdf.getTextWidth(badgeText);
      const badgePadX = Math.max(0.22, badgeFontSize * 0.03);
      const badgeH = badgeFontSize * 0.06;
      const badgeW = textWidth + badgePadX * 2;
      const badgeX = sheetX + (sheetW - badgeW) / 2;
      const badgeY = sheetY + (sheetH - badgeH) / 2;

      if (mapped?.isCombined) {
        // Destacado de verde, no mesmo tamanho das páginas inteiras
        pdf.setFillColor(16, 185, 129); // emerald-500
        pdf.setDrawColor(5, 150, 105); // emerald-600
        pdf.setLineWidth(0.03);
        pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 0.08, 0.08, 'FD');
        pdf.setTextColor(255, 255, 255);
      } else {
        // Fundo branco com borda cinza
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(128, 128, 128);
        pdf.setLineWidth(0.025);
        pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, 0.08, 0.08, 'FD');
        pdf.setTextColor(0, 0, 0);
      }

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
  if (!useSavings) {
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

      // Permite que a UI processe eventos e atualize a tela sem travar
      await new Promise((resolve) => setTimeout(resolve, 15));

      // High quality canvas slice of the image
      const sourceX = Math.round(sheet.cropX * img.naturalWidth);
      const sourceY = Math.round(sheet.cropY * img.naturalHeight);
      const sourceW = Math.max(1, Math.round(sheet.cropW * img.naturalWidth));
      const sourceH = Math.max(1, Math.round(sheet.cropH * img.naturalHeight));

      // Target slice canvas
      const targetPrintW = config.aumentarResolucao
        ? Math.max(sourceW, Math.round((sheet.drawW / 2.54) * 300))
        : sourceW;
      const targetPrintH = config.aumentarResolucao
        ? Math.max(sourceH, Math.round((sheet.drawH / 2.54) * 300))
        : sourceH;

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = targetPrintW;
      sliceCanvas.height = targetPrintH;
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
          targetPrintW,
          targetPrintH
        );

        if (config.aumentarResolucao) {
          applySharpen(ctx, targetPrintW, targetPrintH, 0.22);
        }

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

        const { hasLeftSeam, hasRightSeam, hasTopSeam, hasBottomSeam } = getSheetSeams(sheet, config);
        const isLetrasPorPagina = Boolean(config.letrasPorPagina);

        const drawTopLeft = !isLetrasPorPagina || (hasTopSeam || hasLeftSeam);
        const drawTopRight = !isLetrasPorPagina || (hasTopSeam || hasRightSeam);
        const drawBottomLeft = !isLetrasPorPagina || (hasBottomSeam || hasLeftSeam);
        const drawBottomRight = !isLetrasPorPagina || (hasBottomSeam || hasRightSeam);

        pdf.setDrawColor(100, 116, 139); // slate-500
        pdf.setLineWidth(0.025); // traço fino e nítido

        // 1. Canto Superior Esquerdo
        if (drawTopLeft) {
          pdf.line(x1, Math.max(0.1, y1 - markGap - markLen), x1, Math.max(0.1, y1 - markGap));
          pdf.line(Math.max(0.1, x1 - markGap - markLen), y1, Math.max(0.1, x1 - markGap), y1);
        }

        // 2. Canto Superior Direito
        if (drawTopRight) {
          pdf.line(x2, Math.max(0.1, y1 - markGap - markLen), x2, Math.max(0.1, y1 - markGap));
          pdf.line(Math.min(page.width - 0.1, x2 + markGap), y1, Math.min(page.width - 0.1, x2 + markGap + markLen), y1);
        }

        // 3. Canto Inferior Esquerdo
        if (drawBottomLeft) {
          pdf.line(x1, Math.min(page.height - 0.1, y2 + markGap), x1, Math.min(page.height - 0.1, y2 + markGap + markLen));
          pdf.line(Math.max(0.1, x1 - markGap - markLen), y2, Math.max(0.1, x1 - markGap), y2);
        }

        // 4. Canto Inferior Direito
        if (drawBottomRight) {
          pdf.line(x2, Math.min(page.height - 0.1, y2 + markGap), x2, Math.min(page.height - 0.1, y2 + markGap + markLen));
          pdf.line(Math.min(page.width - 0.1, x2 + markGap), y2, Math.min(page.width - 0.1, x2 + markGap + markLen), y2);
        }

        // Guias de texto nas bordas para recortar e unir as folhas
        pdf.setFont('Helvetica', 'bold');
        pdf.setFontSize(6);
        pdf.setTextColor(74, 84, 105);

        // Top margin marks - apenas onde precisa colar com a folha de cima
        if (hasTopSeam && sheet.drawW > 0.5) {
          const yTop = Math.max(0.25, config.marginCm - 0.1);
          const spanW = sheet.drawW;
          const numTagsW = Math.max(1, Math.floor(spanW / (spanW < 3.8 ? 1.6 : 3.0)));
          for (let s = 1; s <= numTagsW; s++) {
            const isRecorte = s % 2 !== 0;
            const tag = getTagText(isRecorte, sheet.sheetIndex, spanW);
            const xPos = x1 + (spanW * s) / (numTagsW + 1);
            pdf.text(tag, xPos, yTop, { align: 'center' });
          }
        }

        // Left margin marks - apenas onde precisa colar com a folha da esquerda
        if (hasLeftSeam && sheet.drawH > 0.5) {
          const xLeft = Math.max(0.25, config.marginCm - 0.1);
          const spanH = sheet.drawH;
          const numTagsH = Math.max(1, Math.floor(spanH / (spanH < 3.8 ? 1.6 : 3.5)));
          for (let s = 1; s <= numTagsH; s++) {
            const isRecorte = s % 2 !== 0;
            const tag = getTagText(isRecorte, sheet.sheetIndex, spanH);
            const tagWidth = pdf.getTextWidth(tag);
            const yPos = y1 + (spanH * s) / (numTagsH + 1);
            pdf.text(tag, xLeft, yPos + tagWidth / 2, { angle: 90 });
          }
        }
      }
    }
  } else {
    // -------------------------------------------------------------------------
    // MODO ECONOMIA DE FOLHAS ATIVO:
    // 1. Imprime as folhas normais (que não estão na linha/coluna reduzida)
    // 2. Agrupa as partes pequenas em folhas compartilhadas (2 ou 3 partes por folha)
    // -------------------------------------------------------------------------
    const regularSheets = sheets.filter(
      (s) => !s.isEmpty && !savingsInfo.sheetPageMap.get(`${s.col}-${s.row}`)?.isCombined
    );

    for (const sheet of regularSheets) {
      if (pageCount > 0) {
        pdf.addPage([page.width, page.height], config.orientation === 'vertical' ? 'portrait' : 'landscape');
      }
      pageCount++;

      onProgress?.(
        Math.round((pageCount / totalPages) * 100),
        `Gerando página ${pageCount} de ${totalPages}...`
      );

      // Permite que a UI processe eventos e atualize a tela sem travar
      await new Promise((resolve) => setTimeout(resolve, 15));

      const sourceX = Math.round(sheet.cropX * img.naturalWidth);
      const sourceY = Math.round(sheet.cropY * img.naturalHeight);
      const sourceW = Math.max(1, Math.round(sheet.cropW * img.naturalWidth));
      const sourceH = Math.max(1, Math.round(sheet.cropH * img.naturalHeight));

      const targetPrintW = config.aumentarResolucao
        ? Math.max(sourceW, Math.round((sheet.drawW / 2.54) * 300))
        : sourceW;
      const targetPrintH = config.aumentarResolucao
        ? Math.max(sourceH, Math.round((sheet.drawH / 2.54) * 300))
        : sourceH;

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = targetPrintW;
      sliceCanvas.height = targetPrintH;
      const ctx = sliceCanvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, targetPrintW, targetPrintH);
        if (config.aumentarResolucao) {
          applySharpen(ctx, targetPrintW, targetPrintH, 0.22);
        }
        const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(sliceDataUrl, 'JPEG', config.marginCm, config.marginCm, sheet.drawW, sheet.drawH, undefined, 'FAST');
      }

      if (config.cutMarks) {
        const x1 = config.marginCm;
        const y1 = config.marginCm;
        const x2 = config.marginCm + sheet.drawW;
        const y2 = config.marginCm + sheet.drawH;

        const markLen = 0.4;
        const markGap = 0.05;

        const { hasLeftSeam, hasRightSeam, hasTopSeam, hasBottomSeam } = getSheetSeams(sheet, config);
        const isLetrasPorPagina = Boolean(config.letrasPorPagina);

        const drawTopLeft = !isLetrasPorPagina || (hasTopSeam || hasLeftSeam);
        const drawTopRight = !isLetrasPorPagina || (hasTopSeam || hasRightSeam);
        const drawBottomLeft = !isLetrasPorPagina || (hasBottomSeam || hasLeftSeam);
        const drawBottomRight = !isLetrasPorPagina || (hasBottomSeam || hasRightSeam);

        pdf.setDrawColor(100, 116, 139);
        pdf.setLineWidth(0.025);

        if (drawTopLeft) {
          pdf.line(x1, Math.max(0.1, y1 - markGap - markLen), x1, Math.max(0.1, y1 - markGap));
          pdf.line(Math.max(0.1, x1 - markGap - markLen), y1, Math.max(0.1, x1 - markGap), y1);
        }

        if (drawTopRight) {
          pdf.line(x2, Math.max(0.1, y1 - markGap - markLen), x2, Math.max(0.1, y1 - markGap));
          pdf.line(Math.min(page.width - 0.1, x2 + markGap), y1, Math.min(page.width - 0.1, x2 + markGap + markLen), y1);
        }

        if (drawBottomLeft) {
          pdf.line(x1, Math.min(page.height - 0.1, y2 + markGap), x1, Math.min(page.height - 0.1, y2 + markGap + markLen));
          pdf.line(Math.max(0.1, x1 - markGap - markLen), y2, Math.max(0.1, x1 - markGap), y2);
        }

        if (drawBottomRight) {
          pdf.line(x2, Math.min(page.height - 0.1, y2 + markGap), x2, Math.min(page.height - 0.1, y2 + markGap + markLen));
          pdf.line(Math.min(page.width - 0.1, x2 + markGap), y2, Math.min(page.width - 0.1, x2 + markGap + markLen), y2);
        }

        pdf.setFont('Helvetica', 'bold');
        pdf.setFontSize(6);
        pdf.setTextColor(74, 84, 105);

        const mapped = savingsInfo.sheetPageMap.get(`${sheet.col}-${sheet.row}`);
        const pageNum = mapped ? mapped.pageNumber : sheet.sheetIndex;

        // Top margin marks - apenas onde precisa colar com a folha de cima
        if (hasTopSeam && sheet.drawW > 0.5) {
          const yTop = Math.max(0.25, config.marginCm - 0.1);
          const spanW = sheet.drawW;
          const numTagsW = Math.max(1, Math.floor(spanW / (spanW < 3.8 ? 1.6 : 3.0)));
          for (let s = 1; s <= numTagsW; s++) {
            const isRecorte = s % 2 !== 0;
            const tag = getTagText(isRecorte, pageNum, spanW);
            const xPos = x1 + (spanW * s) / (numTagsW + 1);
            pdf.text(tag, xPos, yTop, { align: 'center' });
          }
        }

        // Left margin marks - apenas onde precisa colar com a folha da esquerda
        if (hasLeftSeam && sheet.drawH > 0.5) {
          const xLeft = Math.max(0.25, config.marginCm - 0.1);
          const spanH = sheet.drawH;
          const numTagsH = Math.max(1, Math.floor(spanH / (spanH < 3.8 ? 1.6 : 3.5)));
          for (let s = 1; s <= numTagsH; s++) {
            const isRecorte = s % 2 !== 0;
            const tag = getTagText(isRecorte, pageNum, spanH);
            const tagWidth = pdf.getTextWidth(tag);
            const yPos = y1 + (spanH * s) / (numTagsH + 1);
            pdf.text(tag, xLeft, yPos + tagWidth / 2, { angle: 90 });
          }
        }
      }
    }

    // 2. Imprime os grupos de partes estreitas/baixas combinadas em folhas únicas
    for (const group of savingsInfo.groups) {
      if (pageCount > 0) {
        pdf.addPage([page.width, page.height], config.orientation === 'vertical' ? 'portrait' : 'landscape');
      }
      pageCount++;

      onProgress?.(
        Math.round((pageCount / totalPages) * 100),
        `Gerando folha combinada ${pageCount} de ${totalPages} (${group.items.length} partes agrupadas)...`
      );

      // Permite que a UI processe eventos e atualize a tela sem travar
      await new Promise((resolve) => setTimeout(resolve, 15));

      const N = group.items.length; // partes nesta folha

      if (group.type === 'col') {
        // As partes juntadas alinhadas no lado esquerdo, sem dividir a página em partes iguais
        let currentX = config.marginCm;

        for (let p = 0; p < N; p++) {
          const item = group.items[p];
          const slotX = currentX;
          const slotY = config.marginCm;
          const drawW = item.drawW;
          const drawH = item.drawH;

          const sourceX = Math.round(item.cropX * img.naturalWidth);
          const sourceY = Math.round(item.cropY * img.naturalHeight);
          const sourceW = Math.max(1, Math.round(item.cropW * img.naturalWidth));
          const sourceH = Math.max(1, Math.round(item.cropH * img.naturalHeight));

          const targetPrintW = config.aumentarResolucao
            ? Math.max(sourceW, Math.round((drawW / 2.54) * 300))
            : sourceW;
          const targetPrintH = config.aumentarResolucao
            ? Math.max(sourceH, Math.round((drawH / 2.54) * 300))
            : sourceH;

          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = targetPrintW;
          sliceCanvas.height = targetPrintH;
          const ctx = sliceCanvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, targetPrintW, targetPrintH);
            if (config.aumentarResolucao) {
              applySharpen(ctx, targetPrintW, targetPrintH, 0.22);
            }
            const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(sliceDataUrl, 'JPEG', slotX, slotY, drawW, drawH, undefined, 'FAST');
          }

          if (config.cutMarks) {
            const x1 = slotX;
            const y1 = slotY;
            const x2 = slotX + drawW;
            const y2 = slotY + drawH;
            const markLen = 0.4;
            const markGap = 0.05;

            pdf.setDrawColor(100, 116, 139);
            pdf.setLineWidth(0.025);

            pdf.line(x1, Math.max(0.1, y1 - markGap - markLen), x1, Math.max(0.1, y1 - markGap));
            pdf.line(Math.max(0.1, x1 - markGap - markLen), y1, Math.max(0.1, x1 - markGap), y1);

            pdf.line(x2, Math.max(0.1, y1 - markGap - markLen), x2, Math.max(0.1, y1 - markGap));
            pdf.line(Math.min(page.width - 0.1, x2 + markGap), y1, Math.min(page.width - 0.1, x2 + markGap + markLen), y1);

            pdf.line(x1, Math.min(page.height - 0.1, y2 + markGap), x1, Math.min(page.height - 0.1, y2 + markGap + markLen));
            pdf.line(Math.max(0.1, x1 - markGap - markLen), y2, Math.max(0.1, x1 - markGap), y2);

            pdf.line(x2, Math.min(page.height - 0.1, y2 + markGap), x2, Math.min(page.height - 0.1, y2 + markGap + markLen));
            pdf.line(Math.min(page.width - 0.1, x2 + markGap), y2, Math.min(page.width - 0.1, x2 + markGap + markLen), y2);
          }

          // Texto alternado: "RECORTE AQUI" e "PÁGINA X" em cada parte (abreviado se lado pequeno)
          pdf.setFont('Helvetica', 'bold');
          pdf.setFontSize(6);
          pdf.setTextColor(74, 84, 105);

          // 1. Ao longo do TOPO: APENAS se item.row > 0 (as laterais externas do pôster nunca têm recorte)
          if (item.row > 0 && drawW > 0.5) {
            const numTagsW = Math.max(1, Math.floor(drawW / (drawW < 3.8 ? 1.6 : 2.8)));
            for (let s = 1; s <= numTagsW; s++) {
              const isRecorte = s % 2 !== 0;
              const tag = getTagText(isRecorte, item.pageNumber, drawW);
              const xPos = slotX + (drawW * s) / (numTagsW + 1);
              pdf.text(tag, xPos, Math.max(0.25, slotY - 0.1), { align: 'center' });
            }
          }

          // 2. Ao longo do LADO ESQUERDO: APENAS se item.col > 0
          // "No recorte aqui da esquerda, nas partes econômicas, o texto está afastado das partes, deixar igual a do modo normal"
          if (item.col > 0 && drawH > 0.5) {
            const numTagsH = Math.max(1, Math.floor(drawH / (drawH < 3.8 ? 1.6 : 3.5)));
            for (let s = 1; s <= numTagsH; s++) {
              const isRecorte = s % 2 !== 0;
              const tag = getTagText(isRecorte, item.pageNumber, drawH);
              const tagW = pdf.getTextWidth(tag);
              const yPos = slotY + (drawH * s) / (numTagsH + 1);
              const tagX = Math.max(0.25, slotX - 0.1);
              pdf.text(tag, tagX, yPos + tagW / 2, { angle: 90 });
            }
          }

          // A linha tracejada não é colada com as partes, tem a margem da parte que não tem o recorte aqui.
          // Cada parte tem a margem nos quatro cantos.
          // Ex: margem da parte sem recorte (config.marginCm) -> linha tracejada -> margem da parte com recorte (config.marginCm)
          const cutX = slotX + drawW + config.marginCm;

          pdf.setDrawColor(148, 163, 184); // slate-400
          pdf.setLineWidth(0.025);
          pdf.setLineDashPattern([0.4, 0.25], 0);
          pdf.line(cutX, 0.45, cutX, page.height - 0.45);
          pdf.setLineDashPattern([], 0);

          // A próxima parte começa após a sua própria margem (com o recorte aqui)
          currentX = cutX + config.marginCm;
        }
      } else {
        // Linhas tracejadas de corte entre as partes da folha (horizontal)
        // Alinhadas no topo, sem dividir a página em partes iguais
        let currentY = config.marginCm;

        for (let p = 0; p < N; p++) {
          const item = group.items[p];
          const slotX = config.marginCm;
          const slotY = currentY;
          const drawW = item.drawW;
          const drawH = item.drawH;

          const sourceX = Math.round(item.cropX * img.naturalWidth);
          const sourceY = Math.round(item.cropY * img.naturalHeight);
          const sourceW = Math.max(1, Math.round(item.cropW * img.naturalWidth));
          const sourceH = Math.max(1, Math.round(item.cropH * img.naturalHeight));

          const targetPrintW = config.aumentarResolucao
            ? Math.max(sourceW, Math.round((drawW / 2.54) * 300))
            : sourceW;
          const targetPrintH = config.aumentarResolucao
            ? Math.max(sourceH, Math.round((drawH / 2.54) * 300))
            : sourceH;

          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = targetPrintW;
          sliceCanvas.height = targetPrintH;
          const ctx = sliceCanvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, targetPrintW, targetPrintH);
            if (config.aumentarResolucao) {
              applySharpen(ctx, targetPrintW, targetPrintH, 0.22);
            }
            const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(sliceDataUrl, 'JPEG', slotX, slotY, drawW, drawH, undefined, 'FAST');
          }

          if (config.cutMarks) {
            const x1 = slotX;
            const y1 = slotY;
            const x2 = slotX + drawW;
            const y2 = slotY + drawH;
            const markLen = 0.4;
            const markGap = 0.05;

            pdf.setDrawColor(100, 116, 139);
            pdf.setLineWidth(0.025);

            pdf.line(x1, Math.max(0.1, y1 - markGap - markLen), x1, Math.max(0.1, y1 - markGap));
            pdf.line(Math.max(0.1, x1 - markGap - markLen), y1, Math.max(0.1, x1 - markGap), y1);

            pdf.line(x2, Math.max(0.1, y1 - markGap - markLen), x2, Math.max(0.1, y1 - markGap));
            pdf.line(Math.min(page.width - 0.1, x2 + markGap), y1, Math.min(page.width - 0.1, x2 + markGap + markLen), y1);

            pdf.line(x1, Math.min(page.height - 0.1, y2 + markGap), x1, Math.min(page.height - 0.1, y2 + markGap + markLen));
            pdf.line(Math.max(0.1, x1 - markGap - markLen), y2, Math.max(0.1, x1 - markGap), y2);

            pdf.line(x2, Math.min(page.height - 0.1, y2 + markGap), x2, Math.min(page.height - 0.1, y2 + markGap + markLen));
            pdf.line(Math.min(page.width - 0.1, x2 + markGap), y2, Math.min(page.width - 0.1, x2 + markGap + markLen), y2);
          }

          // Texto alternado: "RECORTE AQUI" e "PÁGINA X" em cada parte (abreviado se lado pequeno)
          pdf.setFont('Helvetica', 'bold');
          pdf.setFontSize(6);
          pdf.setTextColor(74, 84, 105);

          // 1. Ao longo do TOPO: APENAS se item.row > 0
          if (item.row > 0 && drawW > 0.8) {
            const numTagsW = Math.max(1, Math.floor(drawW / (drawW < 3.8 ? 1.8 : 3.5)));
            for (let s = 1; s <= numTagsW; s++) {
              const isRecorte = s % 2 !== 0;
              const tag = getTagText(isRecorte, item.pageNumber, drawW);
              const xPos = slotX + (drawW * s) / (numTagsW + 1);
              const tagY = Math.max(0.22, slotY - 0.1);
              pdf.text(tag, xPos, tagY, { align: 'center' });
            }
          }

          // 2. Ao longo do LADO ESQUERDO: APENAS se item.col > 0
          // "No recorte aqui da esquerda, nas partes econômicas, o texto está afastado das partes, deixar igual a do modo normal"
          if (item.col > 0 && drawH > 0.5) {
            const numTagsH = Math.max(1, Math.floor(drawH / (drawH < 3.8 ? 1.6 : 3.5)));
            for (let s = 1; s <= numTagsH; s++) {
              const isRecorte = s % 2 !== 0;
              const tag = getTagText(isRecorte, item.pageNumber, drawH);
              const tagW = pdf.getTextWidth(tag);
              const yPos = slotY + (drawH * s) / (numTagsH + 1);
              const tagX = Math.max(0.25, slotX - 0.1);
              pdf.text(tag, tagX, yPos + tagW / 2, { angle: 90 });
            }
          }

          // A linha tracejada não é colada com as partes, tem a margem da parte que não tem o recorte aqui.
          // Cada parte tem a margem nos quatro cantos.
          const cutY = slotY + drawH + config.marginCm;

          pdf.setDrawColor(148, 163, 184);
          pdf.setLineWidth(0.025);
          pdf.setLineDashPattern([0.4, 0.25], 0);
          pdf.line(0.45, cutY, page.width - 0.45, cutY);
          pdf.setLineDashPattern([], 0);

          // A próxima parte começa após a sua própria margem (com o recorte aqui no topo)
          currentY = cutY + config.marginCm;
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
  const { totalCards, quantity, slots } = calculateMontagemDimensions(
    config,
    imageInfo.widthPx,
    imageInfo.heightPx
  );

  const pageW = FOLHA_MENOR; // 21.0 cm (Retrato)
  const pageH = FOLHA_MAIOR; // 29.7 cm (Retrato)
  const cardsPerPage = totalCards;
  const totalPages = Math.max(1, Math.ceil(quantity / cardsPerPage));

  onProgress?.(10, 'Preparando montagem para PDF...');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'cm',
    format: [pageW, pageH],
  });

  const fixedMarginCm = 0.4;
  const gradeX = fixedMarginCm;
  const gradeY = fixedMarginCm;

  // Prepare images: normal and rotated 90 degrees clockwise
  const img = imageInfo.imgElement;

  // Normal image canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a imagem.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0);
  const normalImgDataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);

  // Rotated 90 deg clockwise image canvas
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = img.naturalHeight;
  rotCanvas.height = img.naturalWidth;
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) throw new Error('Não foi possível processar a imagem rotacionada.');
  rotCtx.imageSmoothingEnabled = true;
  rotCtx.imageSmoothingQuality = 'high';
  rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rotCtx.rotate((90 * Math.PI) / 180);
  rotCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const rotatedImgDataUrl = rotCanvas.toDataURL('image/jpeg', 0.95);

  let drawnCount = 0;

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) {
      pdf.addPage([pageW, pageH], 'portrait');
    }

    const startCardIndex = p * cardsPerPage;
    const cardsOnThisPage = Math.min(cardsPerPage, quantity - startCardIndex);

    for (let i = 0; i < cardsOnThisPage && i < slots.length; i++) {
      const slot = slots[i];
      const cardX = gradeX + slot.x;
      const cardY = gradeY + slot.y;
      const cardW = slot.w;
      const cardH = slot.h;

      // Não colocar cartões que ultrapassem os limites da folha / margem
      if (cardX + cardW > pageW - fixedMarginCm + 0.01 || cardY + cardH > pageH - fixedMarginCm + 0.01) {
        continue;
      }

      // Insere a imagem ocupando o cartão proporcional (normal ou rotacionada 90°)
      const imgToDraw = slot.rotated ? rotatedImgDataUrl : normalImgDataUrl;
      pdf.addImage(imgToDraw, 'JPEG', cardX, cardY, cardW, cardH, undefined, 'FAST');

      if (config.cardBorder) {
        pdf.setDrawColor(185, 194, 206);
        pdf.setLineWidth(0.03);
        pdf.rect(cardX, cardY, cardW, cardH, 'S');
      }

      drawnCount++;
      onProgress?.(
        Math.round((drawnCount / quantity) * 100),
        `Inserindo cartão ${drawnCount} de ${quantity} (página ${p + 1} de ${totalPages})...`
      );
    }
  }

  const cleanName = imageInfo.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  pdf.save(`${cleanName}_montagem.pdf`);
}
