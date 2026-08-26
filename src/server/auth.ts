import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/server/supabase/server';
import type { Tables } from '@/types/database';

type Profile = Tables<'profile'>;
type Organization = Tables<'organization'>;
type OrganizationMembership = Tables<'organization_membership'>;

export class UnauthorizedError extends Error {
  constructor() {
    super('Not authorized');
    this.name = 'UnauthorizedError';
  }
}

export async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }
  return { user };
}

export const getOrganizationContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch profile + membership in parallel — was sequential (2 round trips)
  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('profile').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('organization_membership')
      .select('*, organization(*)')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const profile = profileRes.data as Profile | null;
  if (!profile) return null;

  const membership = membershipRes.data as
    | (OrganizationMembership & { organization: Organization })
    | null;
  if (!membership) return null;

  return {
    user,
    profile,
    membership,
    organization: membership.organization,
  };
});

export async function requireOrganization() {
  const ctx = await getOrganizationContext();
  if (!ctx) {
    redirect('/login');
  }
  return ctx;
}

export async function requireOrganizationAction() {
  const ctx = await getOrganizationContext();
  if (!ctx) {
    throw new UnauthorizedError();
  }
  return ctx;
}

export async function requireProject(organizationId: string, projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project')
    .select('*')
    .eq('id', projectId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !data) {
    throw new UnauthorizedError();
  }
  return data as Tables<'project'>;
}

export const getActiveProjects = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('project')
    .select('id,name,client_name,status,created_at')
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });
  return (data ?? []) as Array<Tables<'project'>>;
});

export const getDefaultProjectId = cache(async (organizationId: string): Promise<string | null> => {
  const projects = await getActiveProjects(organizationId);
  return projects[0]?.id ?? null;
});
