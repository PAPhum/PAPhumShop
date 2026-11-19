import { Suspense } from 'react';
import { connection } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AdminLoginForm from '@/components/admin/AdminLoginForm';
import AdminDashboardClient from '@/components/admin/AdminDashboardClient';
import {
  AccountPublic,
  AdminRole,
  BannerCategory,
  InstallmentSettings,
} from '@/types/database';
import { DEFAULT_INSTALLMENT_RATES } from '@/lib/installment-config';

async function AdminContent() {
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
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!roleRow) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
        บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบหลังบ้าน (กรุณาเพิ่ม user_id ลงตาราง admin_roles)
      </div>
    );
  }

  const role = roleRow.role as AdminRole;
  const isOwner = role === 'owner';

  const [{ data: categoriesData }, { data: accountsData }, { data: settingsData }] =
    await Promise.all([
      supabase
        .from('banner_categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      isOwner
        ? supabase
            .from('accounts_public')
            .select('*')
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      isOwner
        ? supabase.from('installment_settings').select('*').eq('id', 1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const username = (user.email ?? 'admin').split('@')[0];

  const settings: InstallmentSettings = settingsData
    ? (settingsData as InstallmentSettings)
    : {
        id: 1,
        weekly_interest_rate: DEFAULT_INSTALLMENT_RATES.weeklyRate,
        monthly_interest_rate: DEFAULT_INSTALLMENT_RATES.monthlyRate,
        default_min_down_weekly: 1000,
        default_min_down_monthly: 2000,
        default_free_weeks: 2,
        default_free_months: 1,
        updated_at: new Date(0).toISOString(),
      };

  return (
    <AdminDashboardClient
      username={username}
      role={role}
      initialAccounts={(accountsData ?? []) as AccountPublic[]}
      initialCategories={(categoriesData ?? []) as BannerCategory[]}
      initialSettings={settings}
    />
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="h-96 animate-pulse rounded-2xl border border-white/[0.06] bg-[#111216]" />
      }
    >
      <AdminContent />
    </Suspense>
  );
}