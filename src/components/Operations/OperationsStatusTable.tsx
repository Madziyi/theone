import * as React from 'react';
import { Link } from 'react-router-dom';
import { listOpsBuoys, opsSetStatus, BuoyRow } from '@/api/operations';

interface OperationsStatusTableProps {
  onBuoySelect?: (buoyId: number | null) => void;
  selectedBuoyId?: number | null;
}

export function OperationsStatusTable({ onBuoySelect, selectedBuoyId }: OperationsStatusTableProps) {
  const [rows, setRows] = React.useState<BuoyRow[]>([]);
  const [busy, setBusy] = React.useState<number | null>(null);

  React.useEffect(() => { 
    listOpsBuoys().then(setRows).catch(err => alert(err.message)); 
  }, []);

  async function onChange(r: BuoyRow, next: BuoyRow['status']) {
    const needsReason = next !== 'active' || r.status === 'retrieved';
    const reason = needsReason ? window.prompt(`Reason for ${r.name} → ${next}?`) ?? '' : null;
    if (needsReason && reason?.trim().length === 0) return;

    setBusy(r.buoy_id);
    const prev = rows;
    setRows(prev.map(x => x.buoy_id === r.buoy_id ? { ...x, status: next } : x));
    try {
      const updated = await opsSetStatus(r.buoy_id, next, reason);
      setRows(prev2 => prev2.map(x => x.buoy_id === r.buoy_id ? { ...x, ...updated } : x));
    } catch (e: any) {
      setRows(prev);
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Select</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Buoy</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last Change</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.buoy_id} className={`border-t border-border hover:bg-muted/50 ${selectedBuoyId === r.buoy_id ? 'bg-accent/50' : ''}`}>
                <td className="px-3 py-2">
                  <input
                    type="radio"
                    name="selectedBuoy"
                    checked={selectedBuoyId === r.buoy_id}
                    onChange={() => onBuoySelect?.(r.buoy_id)}
                    className="rounded border-border"
                  />
                </td>
                <td className="px-3 py-2 min-w-[120px]">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">#{r.buoy_id}</div>
                </td>
                <td className="px-3 py-2 min-w-[140px]">
                  <select
                    className={`w-full px-2 py-1 border rounded-md bg-background text-foreground transition-all duration-200 hover:scale-105 ${
                      r.status === 'active' 
                        ? 'border-green-500/50 shadow-[0_0_0_1px_rgba(34,197,94,0.3)] shadow-green-500/20 hover:shadow-[0_0_0_2px_rgba(34,197,94,0.4)] hover:shadow-green-500/30' 
                        : r.status === 'inactive' 
                        ? 'border-yellow-500/50 shadow-[0_0_0_1px_rgba(234,179,8,0.3)] shadow-yellow-500/20 hover:shadow-[0_0_0_2px_rgba(234,179,8,0.4)] hover:shadow-yellow-500/30'
                        : 'border-gray-500/50 shadow-[0_0_0_1px_rgba(107,114,128,0.3)] shadow-gray-500/20 hover:shadow-[0_0_0_2px_rgba(107,114,128,0.4)] hover:shadow-gray-500/30'
                    }`}
                    value={r.status}
                    disabled={busy === r.buoy_id}
                    onChange={(e) => onChange(r, e.target.value as BuoyRow['status'])}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="retrieved">Retrieved</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-muted-foreground min-w-[140px]">
                  <div className="text-xs">{new Date(r.status_changed_at).toLocaleDateString()}</div>
                  <div className="text-xs">{new Date(r.status_changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </td>
                <td className="px-3 py-2 text-right">
                  <Link className="text-sm underline text-primary hover:text-primary/80 whitespace-nowrap" to={`/operations/history/${r.buoy_id}`}>History</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
