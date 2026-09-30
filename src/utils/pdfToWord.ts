import * as pdfjsLib from 'pdfjs-dist';
import { Document, Packer, Paragraph, ImageRun, PageOrientation, AlignmentType } from 'docx';
import JSZip from 'jszip';

// Configure worker for pdfjs-dist
if (typeof window !== 'undefined' && 'Worker' in window) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).toString();
  } catch {
    // Fallback if URL constructor fails
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  }
}

export interface RenderedPdfPage {
  pageNumber: number;
  widthCm: number;
  heightCm: number;
  imageBytes: Uint8Array;
}

/**
 * Loads a PDF file and returns the total number of pages.
 */
export async function getPdfInfo(file: File): Promise<{ totalPages: number; name: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/cmaps/',
    cMapPacked: true,
  });
  const pdfDoc = await loadingTask.promise;
  return {
    totalPages: pdfDoc.numPages,
    name: file.name,
  };
}

/**
 * Renders specified page numbers from a PDF to high-quality PNG image buffers.
 */
export async function renderPdfPages(
  file: File,
  pageNumbers: number[],
  onProgress?: (current: number, total: number) => void
): Promise<RenderedPdfPage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/cmaps/',
    cMapPacked: true,
  });
  const pdfDoc = await loadingTask.promise;

  const results: RenderedPdfPage[] = [];

  for (let i = 0; i < pageNumbers.length; i++) {
    const pageNum = pageNumbers[i];
    if (pageNum < 1 || pageNum > pdfDoc.numPages) continue;

    if (onProgress) {
      onProgress(i + 1, pageNumbers.length);
    }

    const page = await pdfDoc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1.0 });

    // Points to CM (72 pt = 1 inch = 2.54 cm)
    const widthCm = (baseViewport.width / 72) * 2.54;
    const heightCm = (baseViewport.height / 72) * 2.54;

    // Render at 2.0x scale for sharp print quality inside Word
    const renderScale = 2.0;
    const renderViewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(renderViewport.width);
    canvas.height = Math.round(renderViewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });

    if (!ctx) {
      throw new Error('Falha ao inicializar o renderizador de imagem.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // @ts-expect-error canvasContext accepts CanvasRenderingContext2D in browser
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      throw new Error(`Falha ao converter página ${pageNum} em imagem.`);
    }

    const imgBuffer = new Uint8Array(await blob.arrayBuffer());
    results.push({
      pageNumber: pageNum,
      widthCm,
      heightCm,
      imageBytes: imgBuffer,
    });
  }

  return results;
}

/**
 * Creates a NEW Word document (.docx) with the rendered pages as full pages.
 */
export async function createNewWordDocWithPages(pages: RenderedPdfPage[]): Promise<Blob> {
  const marginCm = 0.5;
  const marginTwips = Math.round(marginCm * 567); // 284 twips (0.5cm)

  const sections = pages.map((p) => {
    // In Word twips: 1 cm = 567 twips
    const widthTwips = Math.round(p.widthCm * 567);
    const heightTwips = Math.round(p.heightCm * 567);
    const isLandscape = p.widthCm > p.heightCm;

    // Scale image proportionally to fit comfortably inside page printable area
    const fitWidthCm = Math.max(1, p.widthCm - marginCm * 2);
    const fitHeightCm = Math.max(1, p.heightCm - marginCm * 2);

    // Pixel width/height at standard 96 DPI: 1 cm = 37.795 px
    const pixelWidth = Math.round(fitWidthCm * 37.795);
    const pixelHeight = Math.round(fitHeightCm * 37.795);

    return {
      properties: {
        page: {
          size: {
            width: widthTwips,
            height: heightTwips,
            orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
          margin: {
            top: marginTwips,
            bottom: marginTwips,
            left: marginTwips,
            right: marginTwips,
          },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0, line: 240 },
          children: [
            new ImageRun({
              type: 'png',
              data: p.imageBytes,
              transformation: {
                width: pixelWidth,
                height: pixelHeight,
              },
            }),
          ],
        }),
      ],
    };
  });

  const doc = new Document({
    sections,
  });

  return await Packer.toBlob(doc);
}

/**
 * Appends the rendered PDF pages to an EXISTING Word document (.docx) using OpenXML injection,
 * strictly adhering to Microsoft Word and OpenXML specifications:
 * 1. Inserts content immediately BEFORE the final <w:sectPr> (the document section properties must remain the last child of <w:body>).
 * 2. Ensures all required namespaces (w, r, wp, a, pic) are declared on <w:document>.
 * 3. Registers PNG extension in [Content_Types].xml if not already present.
 * 4. Generates unique, non-colliding relationship IDs (rId) in word/_rels/document.xml.rels.
 * 5. Uses unique docPr integer IDs (>= 5000) and calculates dimensions in EMUs with max width 5,486,400 EMUs.
 */
export async function appendPagesToExistingWordDoc(
  existingWordFile: File,
  pages: RenderedPdfPage[]
): Promise<Blob> {
  const arrayBuffer = await existingWordFile.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const docXmlFile = zip.file('word/document.xml');
  const relsXmlFile = zip.file('word/_rels/document.xml.rels');
  const contentTypesFile = zip.file('[Content_Types].xml');

  if (!docXmlFile || !relsXmlFile || !contentTypesFile) {
    throw new Error('O arquivo selecionado não é um documento Word (.docx) válido.');
  }

  let docXml = await docXmlFile.async('text');
  let relsXml = await relsXmlFile.async('text');
  let contentTypesXml = await contentTypesFile.async('text');

  // 1. Cadastrar extensão PNG em [Content_Types].xml se ainda não existir
  if (!contentTypesXml.toLowerCase().includes('extension="png"')) {
    contentTypesXml = contentTypesXml.replace(
      '</Types>',
      '<Default Extension="png" ContentType="image/png"/></Types>'
    );
    zip.file('[Content_Types].xml', contentTypesXml);
  }

  // 2. Garantir todos os namespaces obrigatórios na tag raiz <w:document>
  const docTagMatch = docXml.match(/<w:document\b[^>]*>/);
  if (docTagMatch) {
    let docTag = docTagMatch[0];
    const requiredNamespaces = [
      { prefix: 'xmlns:w', uri: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' },
      { prefix: 'xmlns:r', uri: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships' },
      { prefix: 'xmlns:wp', uri: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing' },
      { prefix: 'xmlns:a', uri: 'http://schemas.openxmlformats.org/drawingml/2006/main' },
      { prefix: 'xmlns:pic', uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
    ];

    for (const ns of requiredNamespaces) {
      if (!docTag.includes(`${ns.prefix}=`)) {
        docTag = docTag.replace('<w:document', `<w:document ${ns.prefix}="${ns.uri}"`);
      }
    }
    docXml = docXml.replace(docTagMatch[0], docTag);
  }

  // 3. Mapear todos os IDs de relacionamento existentes para evitar qualquer colisão
  const existingRelIds = new Set<string>();
  let maxRelNum = 0;
  const relIdMatches = relsXml.matchAll(/Id="([^"]+)"/g);
  for (const m of relIdMatches) {
    existingRelIds.add(m[1]);
    const numMatch = m[1].match(/^rId(\d+)$/);
    if (numMatch) {
      const val = parseInt(numMatch[1], 10);
      if (val > maxRelNum) maxRelNum = val;
    }
  }

  // 4. Mapear o maior ID de docPr existente (começando em no mínimo 5000)
  let maxDocPrId = 5000;
  const docPrMatches = docXml.matchAll(/<wp:docPr[^>]*\bid="(\d+)"/g);
  for (const m of docPrMatches) {
    const val = parseInt(m[1], 10);
    if (!isNaN(val) && val >= maxDocPrId) {
      maxDocPrId = val;
    }
  }

  // 5. Constantes EMU (1 polegada = 914.400 EMUs)
  // Largura máxima padrão para caber perfeitamente nas margens A4: 5.486.400 EMUs (~6 polegadas / ~15,24 cm)
  const maxWidthEmu = 5486400;
  const maxHeightEmu = 7315200; // ~8 polegadas / ~20,32 cm

  let appendedXml = '';

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];

    // Gerar próximo ID rId único
    let nextRelNum = Math.max(maxRelNum + 1, 100);
    while (existingRelIds.has(`rId${nextRelNum}`)) {
      nextRelNum++;
    }
    const relId = `rId${nextRelNum}`;
    existingRelIds.add(relId);
    maxRelNum = nextRelNum;

    // Gerar próximo ID docPr único
    maxDocPrId++;
    const docPrId = maxDocPrId;

    const imageFileName = `image_pdf_inserted_${nextRelNum}.png`;

    // Gravar imagem em word/media/ garantindo flag binária
    zip.file(`word/media/${imageFileName}`, p.imageBytes, { binary: true });

    // Adicionar relacionamento em word/_rels/document.xml.rels
    const newRel = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageFileName}"/>`;
    relsXml = relsXml.replace('</Relationships>', `${newRel}</Relationships>`);

    // Calcular dimensões cx e cy em EMUs proporcionalmente
    const aspectRatio = p.widthCm / p.heightCm;
    let cx = maxWidthEmu;
    let cy = Math.round(cx / aspectRatio);

    if (cy > maxHeightEmu) {
      cy = maxHeightEmu;
      cx = Math.round(cy * aspectRatio);
    }

    // Estrutura DrawingML em estrita conformidade com o schema OpenXML do Word:
    // - Quebra de página prévia (<w:br w:type="page"/>)
    // - Elementos obrigatórios: wp:extent, wp:effectExtent, wp:docPr, wp:cNvGraphicFramePr
    // - pic:nvPicPr com pic:cNvPr e pic:cNvPicPr com a:picLocks
    // - a:blip com cstate="none", a:srcRect e a:stretch com a:fillRect
    // - a:prstGeom com atributo obrigatório prst="rect" (NUNCA geom="rect")
    appendedXml += `
      <w:p>
        <w:pPr>
          <w:jc w:val="center"/>
          <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
        </w:pPr>
        <w:r>
          <w:br w:type="page"/>
        </w:r>
        <w:r>
          <w:drawing>
            <wp:inline distT="0" distB="0" distL="0" distR="0">
              <wp:extent cx="${cx}" cy="${cy}"/>
              <wp:effectExtent t="0" r="0" b="0" l="0"/>
              <wp:docPr id="${docPrId}" name="Página PDF ${p.pageNumber}"/>
              <wp:cNvGraphicFramePr>
                <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
              </wp:cNvGraphicFramePr>
              <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:nvPicPr>
                      <pic:cNvPr id="0" name="" descr=""/>
                      <pic:cNvPicPr>
                        <a:picLocks noChangeAspect="1" noChangeArrowheads="1"/>
                      </pic:cNvPicPr>
                    </pic:nvPicPr>
                    <pic:blipFill>
                      <a:blip r:embed="${relId}" cstate="none"/>
                      <a:srcRect/>
                      <a:stretch>
                        <a:fillRect/>
                      </a:stretch>
                    </pic:blipFill>
                    <pic:spPr bwMode="auto">
                      <a:xfrm>
                        <a:off x="0" y="0"/>
                        <a:ext cx="${cx}" cy="${cy}"/>
                      </a:xfrm>
                      <a:prstGeom prst="rect">
                        <a:avLst/>
                      </a:prstGeom>
                    </pic:spPr>
                  </pic:pic>
                </a:graphicData>
              </a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>
    `;
  }

  // Ponto de Inserção: OBRIGATORIAMENTE antes do último <w:sectPr> filho de <w:body>.
  // <w:sectPr> deve permanecer como o último elemento de <w:body>.
  const bodyEnd = docXml.lastIndexOf('</w:body>');
  const lastSectPrIndex = docXml.lastIndexOf('<w:sectPr', bodyEnd !== -1 ? bodyEnd : undefined);
  if (lastSectPrIndex !== -1) {
    docXml = docXml.slice(0, lastSectPrIndex) + appendedXml + docXml.slice(lastSectPrIndex);
  } else if (bodyEnd !== -1) {
    docXml = docXml.slice(0, bodyEnd) + appendedXml + docXml.slice(bodyEnd);
  } else {
    docXml = docXml.replace('</w:body>', `${appendedXml}</w:body>`);
  }

  zip.file('word/document.xml', docXml);
  zip.file('word/_rels/document.xml.rels', relsXml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/**
 * Helper to download a Blob as a file in the browser.
 */
export function downloadFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}
