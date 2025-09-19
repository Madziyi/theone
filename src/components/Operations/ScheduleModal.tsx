import * as React from 'react';
import { createSchedule } from '@/api/operations';

interface ScheduleModalProps {
  buoy_id: number;
  onClose: () => void;
}

export function ScheduleModal({ buoy_id, onClose }: ScheduleModalProps) {
  const [target, setTarget] = React.useState<'inactive'|'retrieved'>('inactive');
  const [startAt, setStartAt] = React.useState<string>(new Date(Date.now()+60*60*1000).toISOString().slice(0,16)); // default +1h (YYYY-MM-DDTHH:mm)
  const [endAt, setEndAt] = React.useState<string>('');
  const [reason, setReason] = React.useState<string>('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createSchedule({
      buoy_id,
      target_status: target,
      start_at: new Date(startAt).toISOString(),
      end_at: endAt ? new Date(endAt).toISOString() : null,
      reason
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white rounded-2xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Schedule maintenance for #{buoy_id}</h2>
        <label className="block">
          <span className="text-sm text-slate-600">Target status</span>
          <select className="mt-1 w-full border rounded-md p-2" value={target} onChange={e=>setTarget(e.target.value as any)}>
            <option value="inactive">Inactive</option>
            <option value="retrieved">Retrieved</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Start</span>
          <input type="datetime-local" className="mt-1 w-full border rounded-md p-2" value={startAt} onChange={e=>setStartAt(e.target.value)} required/>
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">End (optional)</span>
          <input type="datetime-local" className="mt-1 w-full border rounded-md p-2" value={endAt} onChange={e=>setEndAt(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Reason</span>
          <textarea className="mt-1 w-full border rounded-md p-2" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Brief reason (required for non-active)"/>
        </label>
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="px-3 py-1.5 rounded-md border" onClick={onClose}>Cancel</button>
          <button type="submit" className="px-3 py-1.5 rounded-md bg-black text-white">Schedule</button>
        </div>
      </form>
    </div>
  );
}

