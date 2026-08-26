'use client';
import { useActionState, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { upsertAccount } from '@/server/actions/account-actions';
import { accountSchema, type AccountInput } from '@/lib/validation/account';
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
import { useSearchParams } from 'next/navigation';
import type { Tables } from '@/types/database';

type Account = Tables<'account'>;

export function AccountForm({ account }: { account?: Account | null }) {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company') ?? searchParams.get('project') ?? '';
  const projectId = companyId;
  const isEdit = !!account;
  const [open, setOpen] = useState(false);

  const {
    register,
    setError,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AccountInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(accountSchema as any),
    defaultValues: {
      code: account?.code ?? '',
      name: account?.name ?? '',
      type: (account?.type as AccountInput['type']) ?? 'ASSET',
      normal_balance: (account?.normal_balance as AccountInput['normal_balance']) ?? 'DEBIT',
      is_active: account?.is_active ?? true,
      is_cash: (account as unknown as { is_cash?: boolean })?.is_cash ?? false,
    },
  });
  // eslint-disable-next-line react-hooks/incompatible-library
  const isActiveValue = watch('is_active');
  const isCashValue = watch('is_cash');

  const [state, formAction, pending] = useActionState(upsertAccount, { ok: false } as never);

  useEffect(() => {
    if (!state) return;
    const s = state as { fieldErrors?: Record<string, string>; formError?: string; ok?: boolean };
    if (s.fieldErrors) {
      for (const [k, v] of Object.entries(s.fieldErrors)) {
        setError(k as keyof AccountInput, { message: v });
      }
    }
    if (s.formError) toast.error(s.formError);
    if (s.ok) {
      toast.success(isEdit ? 'Account updated' : 'Account created');
      reset();
      setOpen(false);
    }
  }, [state, setError, reset, isEdit]);

  // Keep form in sync when editing different account; reset when opening
  useEffect(() => {
    if (open) {
      reset({
        code: account?.code ?? '',
        name: account?.name ?? '',
        type: (account?.type as AccountInput['type']) ?? 'ASSET',
        normal_balance: (account?.normal_balance as AccountInput['normal_balance']) ?? 'DEBIT',
        is_active: account?.is_active ?? true,
        is_cash: (account as unknown as { is_cash?: boolean })?.is_cash ?? false,
      });
    }
  }, [open, account, reset]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={isEdit ? 'ghost' : 'default'} size="sm">
            {isEdit ? 'Edit' : 'New Account'}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit account' : 'New account'}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={account!.id} />}
          {companyId && <input type="hidden" name="company_id" value={companyId} />}
          <div className="space-y-2">
            <Label htmlFor={isEdit ? `code-${account!.id}` : 'code'}>Code</Label>
            <Input
              id={isEdit ? `code-${account!.id}` : 'code'}
              {...register('code')}
              name="code"
              inputMode="numeric"
              placeholder="1000"
            />
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor={isEdit ? `name-${account!.id}` : 'name'}>Account Name</Label>
            <Input id={isEdit ? `name-${account!.id}` : 'name'} {...register('name')} name="name" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor={isEdit ? `type-${account!.id}` : 'type'}>Account Type</Label>
            <select
              id={isEdit ? `type-${account!.id}` : 'type'}
              {...register('type')}
              name="type"
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="ASSET">ASSET</option>
              <option value="LIABILITY">LIABILITY</option>
              <option value="EQUITY">EQUITY</option>
              <option value="INCOME">INCOME</option>
              <option value="EXPENSE">EXPENSE</option>
            </select>
            {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor={isEdit ? `normal_balance-${account!.id}` : 'normal_balance'}>
              Normal Balance
            </Label>
            <select
              id={isEdit ? `normal_balance-${account!.id}` : 'normal_balance'}
              {...register('normal_balance')}
              name="normal_balance"
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="DEBIT">DEBIT</option>
              <option value="CREDIT">CREDIT</option>
            </select>
            <p className="text-xs text-muted-foreground">
              ASSET/EXPENSE typically DEBIT; LIABILITY/EQUITY/INCOME typically CREDIT — any
              combination is allowed.
            </p>
            {errors.normal_balance && (
              <p className="text-sm text-destructive">{errors.normal_balance.message}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              id={isEdit ? `is_active-${account!.id}` : 'is_active'}
              type="checkbox"
              checked={!!isActiveValue}
              onChange={(e) => setValue('is_active', e.target.checked, { shouldValidate: true })}
              className="size-4 rounded border-input"
            />
            <input type="hidden" name="is_active" value={String(!!isActiveValue)} />
            <Label htmlFor={isEdit ? `is_active-${account!.id}` : 'is_active'}>Active</Label>
          </div>
          {errors.is_active && (
            <p className="text-sm text-destructive">{String(errors.is_active.message)}</p>
          )}
          <div className="flex items-center gap-2">
            <input
              id={isEdit ? `is_cash-${account!.id}` : 'is_cash'}
              type="checkbox"
              checked={!!isCashValue}
              onChange={(e) => setValue('is_cash', e.target.checked, { shouldValidate: true })}
              className="size-4 rounded border-input"
            />
            <input type="hidden" name="is_cash" value={String(!!isCashValue)} />
            <Label htmlFor={isEdit ? `is_cash-${account!.id}` : 'is_cash'}>Cash account (for Dashboard)</Label>
          </div>
          <Button type="submit" disabled={pending || isSubmitting}>
            {pending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
