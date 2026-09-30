import { ImageInfo, CropBox, DPI_PADRAO } from '../types';

export function createCroppedImage(
  original: ImageInfo,
  cropBox: CropBox
): Promise<ImageInfo> {
  return new Promise((resolve) => {
    const [x1, y1, x2, y2] = cropBox;
    const isFull = x1 <= 0.015 && y1 <= 0.015 && x2 >= 0.985 && y2 >= 0.985;

    if (isFull) {
      resolve(original);
      return;
    }

    const cropX = Math.max(0, Math.min(original.widthPx - 1, Math.round(x1 * original.widthPx)));
    const cropY = Math.max(0, Math.min(original.heightPx - 1, Math.round(y1 * original.heightPx)));
    const cropW = Math.max(1, Math.min(original.widthPx - cropX, Math.round((x2 - x1) * original.widthPx)));
    const cropH = Math.max(1, Math.min(original.heightPx - cropY, Math.round((y2 - y1) * original.heightPx)));

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      resolve(original);
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      original.imgElement,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH
    );

    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(original);
        return;
      }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        resolve({
          name: original.name,
          url,
          imgElement: img,
          widthPx: cropW,
          heightPx: cropH,
          widthCm: (cropW / DPI_PADRAO) * 2.54,
          heightCm: (cropH / DPI_PADRAO) * 2.54,
        });
      };
      img.onerror = () => {
        resolve(original);
      };
      img.src = url;
    }, 'image/png');
  });
}
