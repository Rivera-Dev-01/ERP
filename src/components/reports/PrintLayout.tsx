'use client';

import { Button } from '@/components/ui/button';

export function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="[&_[data-filter-bar]]:print:hidden [&_[data-sidebar]]:print:hidden">
      <div className="print:block">
        <Button onClick={() => window.print()} variant="outline" className="mb-4 print:hidden">
          Print
        </Button>
        {children}
      </div>
      <style>{`@media print { [data-filter-bar], [data-sidebar] { display: none !important; } }`}</style>
    </div>
  );
}
