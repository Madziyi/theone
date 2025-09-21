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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[1200]">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-4 shadow-lg">
        <h2 className="text-lg font-semibold">Schedule maintenance for #{buoy_id}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Target status</label>
            <select 
              className="w-full border border-border rounded-md p-2 bg-background text-foreground" 
              value={target} 
              onChange={e=>setTarget(e.target.value as any)}
            >
              <option value="inactive">Inactive</option>
              <option value="retrieved">Retrieved</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Start</label>
            <input 
              type="datetime-local" 
              className="w-full border border-border rounded-md p-2 bg-background text-foreground" 
              value={startAt} 
              onChange={e=>setStartAt(e.target.value)} 
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">End (optional)</label>
            <input 
              type="datetime-local" 
              className="w-full border border-border rounded-md p-2 bg-background text-foreground" 
              value={endAt} 
              onChange={e=>setEndAt(e.target.value)} 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Reason</label>
            <textarea 
              className="w-full border border-border rounded-md p-2 bg-background text-foreground resize-none" 
              value={reason} 
              onChange={e=>setReason(e.target.value)} 
              placeholder="Brief reason (required for non-active)"
              rows={3}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button 
            type="button" 
            className="px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-muted" 
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90"
          >
            Schedule
          </button>
        </div>
      </form>
    </div>
  );
}

