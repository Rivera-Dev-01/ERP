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
    resolver: zodResolver(organizationUpdateSchema),
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
          <Button type="submit" disabled={pending || isSubmitting}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
