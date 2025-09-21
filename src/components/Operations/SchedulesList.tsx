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
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[200px]">Window</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Target</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Status</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">Reason</th>
              <th className="px-3 py-2 font-medium text-muted-foreground w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const state = r.canceled_at ? 'Canceled'
                : r.applied_end_at ? 'Completed'
                : r.applied_start_at ? 'Active'
                : 'Upcoming';
              const startDate = new Date(r.start_at);
              const endDate = r.end_at ? new Date(r.end_at) : null;
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/50">
                  <td className="px-3 py-2">
                    <div className="text-xs">
                      <div className="font-medium">{startDate.toLocaleDateString()}</div>
                      <div className="text-muted-foreground">{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      {endDate && (
                        <>
                          <div className="text-xs text-muted-foreground">→ {endDate.toLocaleDateString()}</div>
                          <div className="text-xs text-muted-foreground">{endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </>
                      )}
                      {!endDate && <div className="text-xs text-muted-foreground">(one-way)</div>}
                    </div>
                  </td>
                  <td className="px-3 py-2 capitalize text-center">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                      r.target_status === 'active' 
                        ? 'border-green-500/30 bg-green-500/15 text-green-400'
                        : r.target_status === 'inactive'
                        ? 'border-yellow-500/30 bg-yellow-500/15 text-yellow-400'
                        : 'border-gray-500/30 bg-gray-500/15 text-gray-400'
                    }`}>
                      {r.target_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                      state === 'Active' 
                        ? 'border-blue-500/30 bg-blue-500/15 text-blue-400'
                        : state === 'Completed'
                        ? 'border-green-500/30 bg-green-500/15 text-green-400'
                        : state === 'Canceled'
                        ? 'border-red-500/30 bg-red-500/15 text-red-400'
                        : 'border-gray-500/30 bg-gray-500/15 text-gray-400'
                    }`}>
                      {state}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <div className="text-xs break-words">{r.reason ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!r.canceled_at && !r.applied_start_at && (
                      <button className="text-sm underline text-primary hover:text-primary/80 whitespace-nowrap" onClick={() => onCancel(r.id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

