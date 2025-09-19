import * as React from 'react';
import { Link } from 'react-router-dom';
import { listOpsBuoys, opsSetStatus, BuoyRow } from '@/api/operations';
import { StatusBadge } from './StatusBadge';

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
    <div className="rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left">Select</th>
            <th className="px-3 py-2 text-left">Buoy</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Last Change</th>
            <th className="px-3 py-2 text-left"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.buoy_id} className={`border-t ${selectedBuoyId === r.buoy_id ? 'bg-blue-50' : ''}`}>
              <td className="px-3 py-2">
                <input
                  type="radio"
                  name="selectedBuoy"
                  checked={selectedBuoyId === r.buoy_id}
                  onChange={() => onBuoySelect?.(r.buoy_id)}
                  className="rounded"
                />
              </td>
              <td className="px-3 py-2">{r.name} <span className="text-xs text-slate-400">#{r.buoy_id}</span></td>
              <td className="px-3 py-2">
                <div className="inline-flex items-center gap-2">
                  <StatusBadge status={r.status}/>
                  <select
                    className="px-2 py-1 border rounded-md bg-white"
                    value={r.status}
                    disabled={busy === r.buoy_id}
                    onChange={(e) => onChange(r, e.target.value as BuoyRow['status'])}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="retrieved">Retrieved</option>
                  </select>
                </div>
              </td>
              <td className="px-3 py-2">{new Date(r.status_changed_at).toLocaleString()}</td>
              <td className="px-3 py-2 text-right">
                <Link className="text-sm underline text-primary hover:text-primary/80" to={`/operations/history/${r.buoy_id}`}>History</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
