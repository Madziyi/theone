import { supabase } from '@/lib/supabase';

export type BuoyRow = {
  buoy_id: number;     // BIGINT in DB; use number in TS
  name: string;
  status: 'active'|'inactive'|'retrieved';
  status_changed_at: string;
  status_changed_by: string | null;
  latitude?: number | null;
  longitude?: number | null;
  last_contact_at?: string | null; // if you have it
  battery_pct?: number | null;     // if you have it
};

export type MaintenanceSchedule = {
  id: string;
  buoy_id: number;
  target_status: 'active'|'inactive'|'retrieved';
  start_at: string;
  end_at?: string | null;
  reason?: string | null;
  applied_start_at?: string | null;
  applied_end_at?: string | null;
  notified_24h: boolean;
  canceled_at?: string | null;
  created_at: string;
  created_by: string;
};

export async function listOpsBuoys(): Promise<BuoyRow[]> {
  const { data, error } = await supabase
    .from('buoys')
    .select('buoy_id,name,status,status_changed_at,status_changed_by,latitude,longitude')
    .order('name', { ascending: true });
  if (error) throw error;
  return data as unknown as BuoyRow[];
}

export async function opsSetStatus(buoy_id: number, next: BuoyRow['status'], reason?: string | null) {
  const { data, error } = await supabase.rpc('ops_update_buoy_status', {
    p_buoy_id: buoy_id,
    p_new_status: next,
    p_reason: reason ?? null,
    p_schedule_id: null
  });
  if (error) throw error;
  return data as unknown as BuoyRow;
}

export async function createSchedule(input: {
  buoy_id: number;
  target_status: BuoyRow['status'];
  start_at: string; // ISO
  end_at?: string | null;
  reason?: string | null;
}) {
  const { data, error } = await supabase.rpc('ops_schedule_buoy_status', {
    p_buoy_id: input.buoy_id,
    p_target_status: input.target_status,
    p_start_at: input.start_at,
    p_end_at: input.end_at ?? null,
    p_reason: input.reason ?? null
  });
  if (error) throw error;
  return data as unknown as MaintenanceSchedule;
}

export async function listSchedulesForBuoy(buoy_id: number): Promise<MaintenanceSchedule[]> {
  const { data, error } = await supabase
    .from('maintenance_schedules')
    .select('*')
    .eq('buoy_id', buoy_id)
    .order('start_at', { ascending: false });
  if (error) throw error;
  return data as MaintenanceSchedule[];
}

export async function cancelSchedule(id: string) {
  const { error } = await supabase.rpc('ops_cancel_schedule', { p_schedule_id: id });
  if (error) throw error;
}

