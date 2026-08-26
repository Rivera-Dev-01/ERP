'use client';
import { useActionState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateOrganization } from '@/server/actions/organization-actions';
import {
  organizationUpdateSchema,
  type OrganizationUpdateInput,
} from '@/lib/validation/organization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export function OrgProfileForm({ defaultValues }: { defaultValues: OrganizationUpdateInput }) {
  const {
    register,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationUpdateInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(organizationUpdateSchema as any),
    defaultValues,
  });
  const [state, formAction, pending] = useActionState(updateOrganization, { ok: false } as never);

  useEffect(() => {
    if (!state) return;
    if ((state as { fieldErrors?: Record<string, string> }).fieldErrors) {
      for (const [k, v] of Object.entries(
        (state as { fieldErrors: Record<string, string> }).fieldErrors,
      )) {
        setError(k as keyof OrganizationUpdateInput, { message: v });
      }
    }
    if ((state as { formError?: string }).formError)
      toast.error((state as { formError: string }).formError);
    if ((state as { ok: boolean }).ok) toast.success('Organization updated');
  }, [state, setError]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input id="name" {...register('name')} name="name" />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="legal_name">Legal name</Label>
              <Input id="legal_name" {...register('legal_name')} name="legal_name" />
              {errors.legal_name && (
                <p className="text-sm text-destructive">{errors.legal_name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tin">TIN</Label>
              <Input id="tin" {...register('tin')} name="tin" placeholder="123-456-789-000" />
              {errors.tin && <p className="text-sm text-destructive">{String(errors.tin.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rdo">RDO</Label>
              <Input id="rdo" {...register('rdo')} name="rdo" placeholder="123" />
              {errors.rdo && <p className="text-sm text-destructive">{String(errors.rdo.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch_code">Branch code</Label>
              <Input id="branch_code" {...register('branch_code')} name="branch_code" placeholder="00000" />
              {errors.branch_code && <p className="text-sm text-destructive">{String(errors.branch_code.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_classification">VAT classification</Label>
              <select id="tax_classification" {...register('tax_classification')} name="tax_classification" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="">—</option>
                <option value="VAT">VAT</option>
                <option value="NON_VAT">NON-VAT</option>
                <option value="PERCENTAGE">PERCENTAGE</option>
              </select>
              {errors.tax_classification && <p className="text-sm text-destructive">{String(errors.tax_classification.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal_year_start_month">Fiscal year start month (1-12)</Label>
              <Input id="fiscal_year_start_month" type="number" min={1} max={12} {...register('fiscal_year_start_month')} name="fiscal_year_start_month" />
              {errors.fiscal_year_start_month && <p className="text-sm text-destructive">{String(errors.fiscal_year_start_month.message)}</p>}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...register('address')} name="address" placeholder="Full address" />
              {errors.address && <p className="text-sm text-destructive">{String(errors.address.message)}</p>}
            </div>
          </div>
          <Button type="submit" disabled={pending || isSubmitting}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
