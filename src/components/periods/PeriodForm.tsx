'use client';
import { useActionState, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFiscalPeriod } from '@/server/actions/period-actions';
import { fiscalPeriodSchema, type FiscalPeriodInput } from '@/lib/validation/fiscal-period';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export function PeriodForm() {
  const [open, setOpen] = useState(false);
  const {
    register,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FiscalPeriodInput>({
    resolver: zodResolver(fiscalPeriodSchema),
    defaultValues: { name: '', start_date: '', end_date: '' },
  });

  const [state, formAction, pending] = useActionState(createFiscalPeriod, { ok: false } as never);

  useEffect(() => {
    if (!state) return;
    const s = state as { fieldErrors?: Record<string, string>; formError?: string; ok?: boolean };
    if (s.fieldErrors) {
      for (const [k, v] of Object.entries(s.fieldErrors)) {
        setError(k as keyof FiscalPeriodInput, { message: v });
      }
    }
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success('Period created');
      reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state, setError, reset]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New Period</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Fiscal Period</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} name="name" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="start_date">Start date</Label>
            <Input id="start_date" type="date" {...register('start_date')} name="start_date" />
            {errors.start_date && (
              <p className="text-sm text-destructive">{errors.start_date.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date">End date</Label>
            <Input id="end_date" type="date" {...register('end_date')} name="end_date" />
            {errors.end_date && (
              <p className="text-sm text-destructive">{errors.end_date.message}</p>
            )}
          </div>
          <Button type="submit" disabled={pending || isSubmitting}>
            {pending ? 'Creating…' : 'Create'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
