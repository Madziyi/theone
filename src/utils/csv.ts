export function toCSVAligned(series: { name: string; rows: { ts: string; value: number | null }[] }[]): Blob {
  // Gather all timestamps
  const all = new Set<string>();
  for (const s of series) for (const r of s.rows) all.add(r.ts);
  const tsList = Array.from(all).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const header = ["ts", ...series.map((s) => s.name)].join(",") + "\n";
  let body = "";
  for (const ts of tsList) {
    const row = [ts];
    for (const s of series) {
      const found = s.rows.find((r) => r.ts === ts);
      row.push(found?.value == null ? "" : String(found.value));
    }
    body += row.join(",") + "\n";
  }
  return new Blob([header, body], { type: "text/csv;charset=utf-8" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}