import * as React from 'react';
import { listSchedulesForBuoy, cancelSchedule, MaintenanceSchedule } from '@/api/operations';

interface SchedulesListProps {
  buoy_id: number;
}

export function SchedulesList({ buoy_id }: SchedulesListProps) {
  const [rows, setRows] = React.useState<MaintenanceSchedule[]>([]);
  
  React.useEffect(() => { 
    listSchedulesForBuoy(buoy_id).then(setRows).catch(e=>alert(e.message)); 
  }, [buoy_id]);

  async function onCancel(id: string) {
    if (!confirm('Cancel this schedule?')) return;
    await cancelSchedule(id);
    setRows(prev => prev.map(r => r.id===id ? { ...r, canceled_at: new Date().toISOString() } : r));
  }

  return (
    <div className="rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left">Window</th>
            <th className="px-3 py-2 text-left">Target</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Reason</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const state = r.canceled_at ? 'Canceled'
              : r.applied_end_at ? 'Completed'
              : r.applied_start_at ? 'Active'
              : 'Upcoming';
            const range = r.end_at
              ? `${new Date(r.start_at).toLocaleString()} → ${new Date(r.end_at).toLocaleString()}`
              : `${new Date(r.start_at).toLocaleString()} (one-way)`;
            return (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{range}</td>
                <td className="px-3 py-2 capitalize">{r.target_status}</td>
                <td className="px-3 py-2">{state}</td>
                <td className="px-3 py-2">{r.reason ?? '—'}</td>
                <td className="px-3 py-2 text-right">
                  {!r.canceled_at && !r.applied_start_at && (
                    <button className="text-sm underline" onClick={() => onCancel(r.id)}>Cancel</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

