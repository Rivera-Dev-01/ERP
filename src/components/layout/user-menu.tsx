'use client';

import { logout } from '@/server/actions/auth-actions';
import { Button } from '@/components/ui/button';

export function UserMenu({ userName }: { userName: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm">{userName}</span>
      <Button variant="outline" size="sm" onClick={() => logout()}>
        Sign out
      </Button>
    </div>
  );
}
