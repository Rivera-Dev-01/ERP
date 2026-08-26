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
        <div className="flex justify-between">
          <span className="text-muted-foreground">Branch code</span>
          <span>{(organization as unknown as { branch_code?: string | null }).branch_code ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Address</span>
          <span className="truncate max-w-[240px]">{(organization as unknown as { address?: string | null }).address ?? '—'}</span>
        </div>
      </section>
      <OrgProfileForm
        defaultValues={{
          name: organization.name,
          legal_name: organization.legal_name,
          tin: organization.tin ?? null,
          rdo: organization.rdo ?? null,
          branch_code: (organization as unknown as { branch_code?: string | null }).branch_code ?? null,
          address: (organization as unknown as { address?: string | null }).address ?? null,
          tax_classification: organization.tax_classification as unknown as 'VAT' | 'NON_VAT' | 'PERCENTAGE' | null,
          fiscal_year_start_month: organization.fiscal_year_start_month ?? 1,
        }}
      />
    </div>
  );
}
