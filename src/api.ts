// src/api.ts
/* eslint-disable no-console */

export type Vec = { lon: number; lat: number; u: number; v: number };
export type Sc = { lon: number; lat: number; value: number };

export type Frame = {
  meta: { lake: string; run: string; tag: string; units: { wind: string; curr: string; temp: string } };
  time: string;
  dxDeg: number;
  dyDeg: number;
  wind: Vec[];
  curr: Vec[];
  temp: Sc[];
};

export type MultiFrames = Record<string, Frame | { error: string }>;

const API_BASE = (import.meta.env.VITE_GLOFS_API ?? "").replace(/\/$/, ""); // e.g. "http://YOUR_HOST:2153"

/** Toggle request logging via env var */
const DEBUG = String(import.meta.env.VITE_FLOW_DEBUG ?? "false") === "true";

function qs(params: Record<string, string | number | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.set(k, String(v));
  return u.toString();
}

/** Get latest available run(s). lake: "leofs" | "lmhofs" | "loofs" | "lsofs" | "all" */
export async function latestRun(lake: string): Promise<Record<string, string | null>> {
  const url = `${API_BASE}/api/glofs/latest_run?${qs({ lake })}`;
  const t0 = performance.now();
  DEBUG && console.debug("[glofs] latest_run →", url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`latest_run failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as Record<string, string | null>;
  DEBUG && console.debug("[glofs] latest_run ✓", j, `(${Math.round(performance.now() - t0)} ms)`);
  return j;
}

/** One lake/hour frame */
export async function fetchFrame(
  lake: "leofs" | "lmhofs" | "loofs" | "lsofs",
  hour: number, // -6..120
  bbox: [number, number, number, number],
  run?: string, // optional; if omitted, server auto-picks
  stride_rg = 4,
  stride_wind = 5
): Promise<Frame> {
  const url = `${API_BASE}/api/glofs/frame?${qs({
    lake,
    run,
    hour,
    bbox: bbox.join(","),
    stride_rg,
    stride_wind,
  })}`;
  const t0 = performance.now();
  DEBUG && console.debug("[glofs] frame →", url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`frame ${lake} failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as Frame;
  DEBUG && console.debug(
    `[glofs] frame ${lake} ✓`,
    { time: j.time, wind: j.wind.length, curr: j.curr.length, temp: j.temp.length },
    `(${Math.round(performance.now() - t0)} ms)`
  );
  return j;
}

/** Multiple lakes in one go; returns map keyed by lake code */
export async function fetchFrameMulti(
  lakesCsv: string, // "leofs,lmhofs,loofs,lsofs"
  hour: number,
  bbox: [number, number, number, number],
  run?: string,
  stride_rg = 4,
  stride_wind = 5
): Promise<MultiFrames> {
  const url = `${API_BASE}/api/glofs/frame_multi?${qs({
    lakes: lakesCsv,
    run,
    hour,
    bbox: bbox.join(","),
    stride_rg,
    stride_wind,
  })}`;
  const t0 = performance.now();
  DEBUG && console.debug("[glofs] frame_multi →", url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`frame_multi failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as MultiFrames;

  if (DEBUG) {
    const report: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(j)) {
      if ("error" in (v as any)) report[k] = (v as any).error;
      else {
        const f = v as Frame;
        report[k] = { time: f.time, wind: f.wind.length, curr: f.curr.length, temp: f.temp.length };
      }
    }
    console.debug("[glofs] frame_multi ✓", report, `(${Math.round(performance.now() - t0)} ms)`);
  }
  return j;
}