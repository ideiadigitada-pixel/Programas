export type AppMode = 'poster' | 'montagem';
export type Orientation = 'vertical' | 'horizontal';

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
  cutBorder: boolean;
  cutMarks: boolean;
}

export interface MontagemConfig {
  orientation: Orientation;
  fH: number;
  fV: number;
  cardWidthCm: number;
  cardHeightCm: number;
  marginCm: number;
  keepRatio: boolean;
  cardBorder: boolean;
  cardSpacing: boolean;
  manualSize: boolean;
  quantity?: number;
}

export const FOLHA_MENOR = 21.0; // cm
export const FOLHA_MAIOR = 29.7; // cm
export const DPI_PADRAO = 300;
export const MARGEM_MINIMA_POSTER = 0.6;
export const MARGEM_MAXIMA_POSTER = 0.9;
export const MARGEM_MINIMA_MONTAGEM = 0.4;
export const MARGEM_MAXIMA_MONTAGEM = 0.9;
export const LIMITE_MAX_POSTER_CM = 600.0;
