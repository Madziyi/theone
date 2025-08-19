export function computeSpeedDir(ex: number, ny: number) {
  const speed = Math.hypot(ex, ny);
  let deg = ((Math.atan2(ny, ex) * 180) / Math.PI) + 90;
  if (deg < 0) deg += 360;

  // 8-wind cardinal snap (0° = E)
  const dirs = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"] as const;
  const idx = Math.round(deg / 45) % 8;

  return { speed, deg, cardinal: dirs[idx] };
}
