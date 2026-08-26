'use client';

import { useActionState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCompany } from '@/server/actions/company-actions';
import { companySchema, type CompanyInput } from '@/lib/validation/company';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export function CompanyForm({ onSuccess }: { onSuccess?: () => void }) {
  const {
    register,
    setError,
    formState: { errors },
  } = useForm<CompanyInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(companySchema) as any,
    defaultValues: { name: '', client_name: '' },
  });
  const [state, formAction, pending] = useActionState(createCompany as never, { ok: false } as never);

  useEffect(() => {
    if (!state) return;
    const s = state as { fieldErrors?: Record<string, string>; formError?: string; ok?: boolean };
    if (s.fieldErrors) {
      for (const [k, v] of Object.entries(s.fieldErrors)) {
        setError(k as keyof CompanyInput, { message: v });
      }
    }
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success('Company created');
      onSuccess?.();
    }
  }, [state, setError, onSuccess]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Company</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company name</Label>
            <Input id="name" {...register('name')} name="name" placeholder="Example: My Client 2026" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_name">Client name (optional)</Label>
            <Input id="client_name" {...register('client_name')} name="client_name" placeholder="Client display name" />
            {errors.client_name && <p className="text-sm text-destructive">{errors.client_name.message}</p>}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// Backwards compat alias
export const ProjectForm = CompanyForm;
