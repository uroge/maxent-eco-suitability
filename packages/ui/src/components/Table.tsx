import type React from 'react';
import { cn } from '../lib/cn';

export const Table: React.FC<React.ComponentProps<'table'>> = ({ className, ...props }) => (
  <div className="w-full overflow-x-auto">
    <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
  </div>
);
export const TableHeader: React.FC<React.ComponentProps<'thead'>> = (props) => (
  <thead
    className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground"
    {...props}
  />
);
export const TableBody: React.FC<React.ComponentProps<'tbody'>> = (props) => (
  <tbody className="divide-y divide-border" {...props} />
);
export const TableRow: React.FC<React.ComponentProps<'tr'>> = ({ className, ...props }) => (
  <tr className={cn('hover:bg-surface-subtle', className)} {...props} />
);
export const TableHead: React.FC<React.ComponentProps<'th'>> = ({ className, ...props }) => (
  <th className={cn('px-3 py-3 font-semibold', className)} {...props} />
);
export const TableCell: React.FC<React.ComponentProps<'td'>> = ({ className, ...props }) => (
  <td className={cn('px-3 py-3', className)} {...props} />
);
