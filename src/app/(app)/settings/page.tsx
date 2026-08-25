import { requireOrganization } from '@/server/auth';
import { OrgProfileForm } from '@/components/settings/OrgProfileForm';

export default async function SettingsPage() {
  const { organization } = await requireOrganization();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
      </div>
      <section className="grid gap-2 rounded-lg border p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Currency</span>
          <span>{organization.currency_code}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Timezone</span>
          <span>{organization.timezone}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fiscal year starts</span>
          <span>Month {organization.fiscal_year_start_month}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">TIN</span>
          <span>{organization.tin ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">RDO</span>
          <span>{organization.rdo ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax classification</span>
          <span>{organization.tax_classification ?? '—'}</span>
        </div>
      </section>
      <OrgProfileForm
        defaultValues={{ name: organization.name, legal_name: organization.legal_name }}
      />
    </div>
  );
}
