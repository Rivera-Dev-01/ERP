import { requireOrganization } from '@/server/auth';
import { createClient } from '@/server/supabase/server';
import { seedDemoAccountsIfEmpty } from '@/server/actions/account-actions';
import { AccountsTable } from '@/components/accounts/AccountsTable';
import { CsvUpload } from '@/components/imports/CsvUpload';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

export default async function AccountsPage() {
  const { organization } = await requireOrganization();
  await seedDemoAccountsIfEmpty();
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from('account')
    .select('*')
    .eq('organization_id', organization.id)
    .order('code');
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/templates/chart-of-accounts.csv"
            download
            className={buttonVariants({ variant: 'outline' })}
          >
            Download template
          </Link>
          <CsvUpload />
        </div>
      </div>
      <AccountsTable data={accounts ?? []} />
    </div>
  );
}
