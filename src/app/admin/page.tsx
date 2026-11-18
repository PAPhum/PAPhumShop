import { Suspense } from 'react';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  AccountPublic,
  AdminRole,
  BannerCategory,
  InstallmentSettings,
} from '@/types/database';
import AdminLoginForm from '@/components/admin/AdminLoginForm';
import AdminDashboardClient from '@/components/admin/AdminDashboardClient';

async function AdminLoader() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <AdminLoginForm />;
  }

  const { data: roleRow } = await supabase
    .from('admin_roles')
    .select('username, role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role: AdminRole = (roleRow?.role as AdminRole) ?? 'staff';
  const username: string =
    roleRow?.username ?? user.email?.split('@')[0] ?? 'admin';

  const categoriesRes = await supabase
    .from('banner_categories')
    .select('*')
    .order('sort_order', { ascending: true });

  const fallbackSettings: InstallmentSettings = {
    id: 1,
    weekly_interest_rate: 140,
    monthly_interest_rate: 600,
    default_min_down_weekly: 1000,
    default_min_down_monthly: 2000,
    default_free_weeks: 2,
    default_free_months: 1,
    updated_at: new Date().toISOString(),
  };

  if (role === 'staff') {
    return (
      <AdminDashboardClient
        role="staff"
        username={username}
        initialAccounts={[]}
        initialCategories={(categoriesRes.data ?? []) as BannerCategory[]}
        initialSettings={fallbackSettings}
        initialHasPin={false}
        initialPinUnlocked={false}
      />
    );
  }

  const [accountsRes, settingsRes, pinRes] = await Promise.all([
    supabase
      .from('accounts')
      .select(
        'id, code, status, price, min_down_weekly, min_down_monthly, interest_free_weeks, interest_free_months, tags, description, main_image_url, gallery_urls, created_at, updated_at'
      )
      .order('created_at', { ascending: false }),
    supabase.from('installment_settings').select('*').eq('id', 1).single(),
    supabase
      .from('admin_security')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const cookieStore = await cookies();
  const initialPinUnlocked =
    cookieStore.get('paphum_admin_pin_ok')?.value === user.id;

  return (
    <AdminDashboardClient
      role="owner"
      username={username}
      initialAccounts={(accountsRes.data ?? []) as AccountPublic[]}
      initialCategories={(categoriesRes.data ?? []) as BannerCategory[]}
      initialSettings={(settingsRes.data as InstallmentSettings) ?? fallbackSettings}
      initialHasPin={Boolean(pinRes.data)}
      initialPinUnlocked={initialPinUnlocked}
    />
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-xl border border-white/[0.06] bg-[#111216]" />
      }
    >
      <AdminLoader />
    </Suspense>
  );
}