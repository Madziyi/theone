import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { listSchedulesForBuoy } from '@/api/operations';
import { SchedulesList } from '@/components/Operations/SchedulesList';

export default function OperationsHistoryPage() {
  const { buoyId } = useParams<{ buoyId: string }>();
  const buoy_id = buoyId ? parseInt(buoyId, 10) : null;

  if (!buoy_id || isNaN(buoy_id)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Invalid Buoy ID</h1>
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
        <h1 className="text-2xl font-bold text-gray-900">
          Operations History - Buoy #{buoy_id}
        </h1>
        <p className="text-gray-600 mt-2">
          View all maintenance schedules and status changes for this buoy.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Maintenance Schedules</h2>
          <SchedulesList buoy_id={buoy_id} />
        </div>
      </div>
    </div>
  );
}

