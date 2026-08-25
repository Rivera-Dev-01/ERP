import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { PeriodTable } from '@/components/periods/PeriodTable';
import { PeriodForm } from '@/components/periods/PeriodForm';

export default async function PeriodsPage() {
  const { organization } = await requireOrganization();
  const supabase = await createClient();
  const { data: periods } = await supabase
    .from('fiscal_period')
    .select('*')
    .eq('organization_id', organization.id)
    .order('start_date', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fiscal Periods</h1>
          <p className="text-sm text-muted-foreground">Manage accounting periods</p>
        </div>
        <PeriodForm />
      </div>
      <PeriodTable data={periods ?? []} />
    </div>
  );
}
