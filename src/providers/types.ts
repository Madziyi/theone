export type VectorFieldGrid = {
  nx: number; ny: number;
  lon0: number; lat0: number; dLon: number; dLat: number;
  u: Float32Array; v: Float32Array;              // length nx*ny
  meta?: Record<string, Float32Array>;           // e.g., Hs
  units?: { u?: string; v?: string };
  range?: { min?: number; max?: number };
};

export type VectorFieldProvider = {
  getGrid: (
    bbox: [number, number, number, number], // [minLon, minLat, maxLon, maxLat]
    timeISO: string
  ) => Promise<VectorFieldGrid>;
};

export type ScalarFieldGrid = {
  nx: number; ny: number;
  lon0: number; lat0: number; dLon: number; dLat: number;
  t: Float32Array;
  units?: string; // 'K' | '°C'
  range?: { min?: number; max?: number };
};

export type ScalarFieldProvider = {
  getGrid: (bbox: [number,number,number,number], timeISO: string) => Promise<ScalarFieldGrid>;
};
