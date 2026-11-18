import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AccountPublic, InstallmentSettings } from '@/types/database';
import AccountDetailClient from '@/components/AccountDetailClient';

interface AccountPageProps {
  params: Promise<{ code: string }>;
}

async function AccountDetailLoader({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await connection();
  const { code } = await params;
  const decodedCode = decodeURIComponent(code).trim();
  const supabase = await createSupabaseServerClient();

  const [accountRes, settingsRes] = await Promise.all([
    supabase
      .from('accounts')
      .select(
        'id, code, status, price, min_down_weekly, min_down_monthly, interest_free_weeks, interest_free_months, tags, description, main_image_url, gallery_urls, created_at, updated_at'
      )
      .ilike('code', decodedCode)
      .neq('status', 'Unavailable')
      .maybeSingle(),
    supabase.from('installment_settings').select('*').eq('id', 1).maybeSingle(),
  ]);

  if (!accountRes.data) {
    notFound();
  }

  return (
    <AccountDetailClient
      account={accountRes.data as AccountPublic}
      settings={(settingsRes.data as InstallmentSettings) ?? undefined}
    />
  );
}

export default function AccountDetailPage({ params }: AccountPageProps) {
  return (
    <Suspense
      fallback={
        <div className="h-96 animate-pulse rounded-2xl border border-white/[0.06] bg-[#111216]" />
      }
    >
      <AccountDetailLoader params={params} />
    </Suspense>
  );
}