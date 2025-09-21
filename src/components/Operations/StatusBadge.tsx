import { BuoyRow } from '@/api/operations';

interface StatusBadgeProps {
  status: BuoyRow['status'];
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    active: {
      className: "bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400 dark:bg-green-500/10 dark:border-green-500/20",
      label: "Active"
    },
    inactive: {
      className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400 dark:bg-yellow-500/10 dark:border-yellow-500/20",
      label: "Inactive"
    },
    retrieved: {
      className: "bg-muted text-muted-foreground border-border",
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

