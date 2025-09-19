import * as React from 'react';
import { OperationsStatusTable } from './OperationsStatusTable';
import { ScheduleModal } from './ScheduleModal';
import { SchedulesList } from './SchedulesList';

export default function OperationsPanel() {
  const [selectedBuoyId, setSelectedBuoyId] = React.useState<number | null>(null);
  const [showScheduleModal, setShowScheduleModal] = React.useState(false);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-md font-medium">Status Management</h3>
            <button 
              className="px-3 py-1.5 rounded-md bg-primary text-white text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setShowScheduleModal(true)}
              disabled={!selectedBuoyId}
            >
              Schedule Maintenance
            </button>
          </div>
          <OperationsStatusTable onBuoySelect={setSelectedBuoyId} selectedBuoyId={selectedBuoyId} />
        </div>

        {selectedBuoyId && (
          <div>
            <h3 className="text-md font-medium mb-2">Maintenance Schedules for Buoy #{selectedBuoyId}</h3>
            <SchedulesList buoy_id={selectedBuoyId} />
          </div>
        )}
      </div>

      {showScheduleModal && selectedBuoyId && (
        <ScheduleModal 
          buoy_id={selectedBuoyId} 
          onClose={() => {
            setShowScheduleModal(false);
            // Refresh the schedules list
            if (selectedBuoyId) {
              // The SchedulesList will refresh automatically via useEffect
            }
          }} 
        />
      )}
    </div>
  );
}
