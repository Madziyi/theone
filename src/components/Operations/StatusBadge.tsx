import { BuoyRow } from '@/api/operations';

interface StatusBadgeProps {
  status: BuoyRow['status'];
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    active: {
      className: "bg-green-100 text-green-800 border-green-200",
      label: "Active"
    },
    inactive: {
      className: "bg-yellow-100 text-yellow-800 border-yellow-200",
      label: "Inactive"
    },
    retrieved: {
      className: "bg-gray-100 text-gray-800 border-gray-200",
      label: "Retrieved"
    }
  };

  const { className, label } = config[status];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

