'use client';

import { Button } from '@/components/ui/button';

export function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div>
        <Button onClick={() => window.print()} variant="outline" className="mb-4" data-print-hide>
          Print
        </Button>
        {children}
      </div>
      <style>{`@media print { [data-filter-bar], [data-sidebar], [data-print-hide] { display: none !important; } }`}</style>
    </div>
  );
}
