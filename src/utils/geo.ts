export function bearingTo(lon1: number, lat1: number, lon2: number, lat2: number) {
  const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
  const λ1 = lon1 * Math.PI/180, λ2 = lon2 * Math.PI/180;
  const y = Math.sin(λ2-λ1) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  return (Math.atan2(y, x) * 180/Math.PI + 360) % 360;
}

export function destPoint(lon: number, lat: number, bearingDeg: number, distanceMeters: number) {
  const R = 6371000;
  const δ = distanceMeters / R;
  const θ = bearingDeg * Math.PI/180;
  const φ1 = lat * Math.PI/180;
  const λ1 = lon * Math.PI/180;
  const φ2 = Math.asin(Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ)*Math.sin(δ)*Math.cos(φ1), Math.cos(δ) - Math.sin(φ1)*Math.sin(φ2));
  return [((λ2*180/Math.PI + 540) % 360) - 180, φ2*180/Math.PI] as [number, number];
}
