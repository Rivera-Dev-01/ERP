import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { CompanyForm } from '@/components/companies/CompanyForm';
import { Badge } from '@/components/ui/badge';
import { formatBusinessDate } from '@/lib/format';
import { archiveCompany } from '@/server/actions/company-actions';
import { Button } from '@/components/ui/button';

export default async function CompaniesPage() {
  const { organization } = await requireOrganization();
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from('company')
    .select('*')
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Companies</h1>
        <p className="text-sm text-muted-foreground">Each company has its own accounts, periods, journals and reports. JE numbering stays per organization.</p>
      </div>

      <CompanyForm />

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Client</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Created</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(companies ?? []).length ? (
              (companies ?? []).map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-2">{p.name}</td>
                  <td className="p-2">{p.client_name ?? '—'}</td>
                  <td className="p-2">
                    <Badge variant={p.status === 'ACTIVE' ? 'default' : 'secondary'}>{p.status}</Badge>
                  </td>
                  <td className="p-2">{formatBusinessDate(p.created_at.slice(0, 10))}</td>
                  <td className="p-2">
                    {p.status === 'ACTIVE' ? (
                      <form action={archiveCompany as never}>
                        <input type="hidden" name="id" value={p.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Archive
                        </Button>
                      </form>
                    ) : (
                      <span className="text-muted-foreground">Archived</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  No companies yet. Create your first company (e.g., Example Client).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Backwards compat alias
export const ProjectsPage = CompaniesPage;
