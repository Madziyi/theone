import { VectorFieldProvider, VectorFieldGrid, ScalarFieldProvider, ScalarFieldGrid } from "../types";

// Simple hashable PRNG
function rnd(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 0xffff) / 0xffff;
  };
}

// Smooth-ish noise via bilinear combo of a coarse grid (fast and good enough for a mock)
function makeSmoothNoise(nx: number, ny: number, seed = 1) {
  const r = rnd(seed);
  const coarseX = Math.max(8, Math.floor(nx / 8));
  const coarseY = Math.max(8, Math.floor(ny / 8));
  const c = new Float32Array(coarseX * coarseY);
  for (let j = 0; j < coarseY; j++) {
    for (let i = 0; i < coarseX; i++) c[j * coarseX + i] = r();
  }
  const out = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const v = (j / (ny - 1)) * (coarseY - 1);
    const j0 = Math.floor(v), j1 = Math.min(coarseY - 1, j0 + 1);
    const tv = v - j0;
    for (let i = 0; i < nx; i++) {
      const u = (i / (nx - 1)) * (coarseX - 1);
      const i0 = Math.floor(u), i1 = Math.min(coarseX - 1, i0 + 1);
      const tu = u - i0;
      const a = c[j0 * coarseX + i0];
      const b = c[j0 * coarseX + i1];
      const d = c[j1 * coarseX + i0];
      const e = c[j1 * coarseX + i1];
      out[j * nx + i] = (1 - tv) * ((1 - tu) * a + tu * b) + tv * ((1 - tu) * d + tu * e);
    }
  }
  return out;
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

function gridDims(bbox: [number,number,number,number]) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const w = Math.max(1, Math.abs(maxLon - minLon));
  const h = Math.max(1, Math.abs(maxLat - minLat));
  // ~8–10 km spacing at mid-lats ≈ 0.1 deg; scale with bbox size for speed
  const d = clamp(Math.max(w, h) / 100, 0.05, 0.2);
  const nx = Math.max(32, Math.floor(w / d));
  const ny = Math.max(28, Math.floor(h / d));
  return { nx, ny, lon0: minLon, lat0: minLat, dLon: w / nx, dLat: h / ny };
}

export const mockWindProvider: VectorFieldProvider = {
  async getGrid(bbox, timeISO): Promise<VectorFieldGrid> {
    const { nx, ny, lon0, lat0, dLon, dLat } = gridDims(bbox);
    const tSeed = Math.floor(new Date(timeISO).getTime() / (60 * 60 * 1000)); // hourly
    const n1 = makeSmoothNoise(nx, ny, 1234 + tSeed);
    const n2 = makeSmoothNoise(nx, ny, 5678 + tSeed);
    const u = new Float32Array(nx * ny);
    const v = new Float32Array(nx * ny);
    for (let i = 0; i < u.length; i++) {
      // Wind 0–14 m/s with gentle curl
      const angle = n1[i] * Math.PI * 2;
      const mag = 3 + 11 * n2[i];
      u[i] = mag * Math.cos(angle);
      v[i] = mag * Math.sin(angle);
    }
    return { nx, ny, lon0, lat0, dLon, dLat, u, v, units: { u: "m/s", v: "m/s" }, range: { min: 0, max: 14 } };
  }
};

export const mockWaveProvider: VectorFieldProvider = {
  async getGrid(bbox, timeISO): Promise<VectorFieldGrid> {
    const { nx, ny, lon0, lat0, dLon, dLat } = gridDims(bbox);
    const tSeed = Math.floor(new Date(timeISO).getTime() / (60 * 60 * 1000));
    const dirNoise = makeSmoothNoise(nx, ny, 2468 + tSeed);
    const tmNoise  = makeSmoothNoise(nx, ny, 9753 + tSeed);
    const hsNoise  = makeSmoothNoise(nx, ny, 8642 + tSeed);
    const u = new Float32Array(nx * ny);
    const v = new Float32Array(nx * ny);
    const Hs = new Float32Array(nx * ny);
    for (let i = 0; i < u.length; i++) {
      // Mock mean wave direction (coming-from), period, Hs
      const MWD = dirNoise[i] * 360;                 // deg coming-from
      const dirTo = (MWD + 180) % 360;               // going-to
      const theta = (dirTo * Math.PI) / 180;
      const Tm = 3 + 7 * tmNoise[i];                 // 3–10 s
      const c_g = 0.78 * Tm;                         // m/s, deep-water approx
      u[i] = c_g * Math.sin(theta);
      v[i] = c_g * Math.cos(theta);
      Hs[i] = 0.2 + 2.2 * hsNoise[i];               // 0.2–2.4 m
    }
    return {
      nx, ny, lon0, lat0, dLon, dLat, u, v,
      meta: { Hs },
      units: { u: "m/s", v: "m/s" },
      range: { min: 0, max: 8 }
    };
  }
};

export const mockTempProvider: ScalarFieldProvider = {
  async getGrid(bbox, timeISO): Promise<ScalarFieldGrid> {
    const { nx, ny, lon0, lat0, dLon, dLat } = gridDims(bbox);
    const tSeed = Math.floor(new Date(timeISO).getTime() / (3 * 60 * 60 * 1000)); // smoother in time
    const base = makeSmoothNoise(nx, ny, 1357 + tSeed);
    const t = new Float32Array(nx * ny);
    for (let i = 0; i < t.length; i++) {
      // 6–24°C mock lake surface temps with gentle spatial gradients
      t[i] = 279.15 + (6 + 18 * base[i]); // Kelvin for generality
    }
    return { nx, ny, lon0, lat0, dLon, dLat, t, units: "K", range: { min: 279.15, max: 297.15 } };
  }
};
