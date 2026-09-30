export type AppMode = 'poster' | 'montagem';
export type Orientation = 'vertical' | 'horizontal';
export type CropBox = [number, number, number, number]; // [x1, y1, x2, y2] normalizado de 0 a 1
export type PreviewBgTone = 'dark' | 'medium' | 'light';

export interface ImageInfo {
  name: string;
  url: string;
  imgElement: HTMLImageElement;
  widthPx: number;
  heightPx: number;
  widthCm: number;
  heightCm: number;
}

export interface PosterConfig {
  orientation: Orientation;
  widthCm: number;
  heightCm: number;
  fH: number;
  fV: number;
  marginCm: number;
  keepRatio: boolean;
  cutMarks: boolean;
  cornerMarks?: boolean;
  cutBorder?: boolean;
  includeMontage?: boolean;
  customAspect?: number;
}

export interface MontagemConfig {
  orientation: Orientation;
  fH: number;
  fV: number;
  cardWidthCm: number;
  cardHeightCm: number;
  marginCm: number;
  spacingCm: number;
  keepRatio: boolean;
  cardBorder: boolean;
  cardSpacing?: boolean;
  manualSize: boolean;
  quantity?: number;
  customAspect?: number;
}

export const FOLHA_MENOR = 21.0; // cm
export const FOLHA_MAIOR = 29.7; // cm
export const DPI_PADRAO = 300;
export const MARGEM_MINIMA_POSTER = 0.6;
export const MARGEM_MAXIMA_POSTER = 1.0;
export const MARGEM_PADRAO_POSTER = 0.7;
export const MARGEM_FIXA_MONTAGEM = 0.4;
export const ESPACO_MINIMO_MONTAGEM = 0.0;
export const ESPACO_MAXIMO_MONTAGEM = 1.0;
export const ESPACO_PADRAO_MONTAGEM = 0.1;
export const LIMITE_MAX_POSTER_CM = 600.0;
