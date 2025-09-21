import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { listSchedulesForBuoy, listOpsBuoys, BuoyRow } from '@/api/operations';
import { SchedulesList } from '@/components/Operations/SchedulesList';

export default function OperationsHistoryPage() {
  const { buoyId } = useParams<{ buoyId: string }>();
  const buoy_id = buoyId ? parseInt(buoyId, 10) : null;
  const [buoyInfo, setBuoyInfo] = useState<BuoyRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!buoy_id) return;
    
    const fetchBuoyInfo = async () => {
      try {
        const buoys = await listOpsBuoys();
        const buoy = buoys.find(b => b.buoy_id === buoy_id);
        setBuoyInfo(buoy || null);
      } catch (error) {
        console.error('Failed to fetch buoy info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBuoyInfo();
  }, [buoy_id]);


  if (!buoy_id || isNaN(buoy_id)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid Buoy ID</h1>
          <Link to="/dashboard" className="text-primary hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link to="/dashboard" className="text-primary hover:underline mb-4 inline-block">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold">
          Operations History - {loading ? 'Loading...' : buoyInfo ? buoyInfo.name : `Buoy #${buoy_id}`}
        </h1>
        <p className="text-muted-foreground mt-2">
          View all maintenance schedules and status changes for this buoy.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <h2 className="text-lg font-semibold mb-4">Maintenance Schedules</h2>
          {loading ? (
            <div className="text-center py-8">
              <div className="text-muted-foreground">Loading schedules...</div>
            </div>
          ) : (
            <SchedulesList buoy_id={buoy_id} />
          )}
        </div>
      </div>
    </div>
  );
}

