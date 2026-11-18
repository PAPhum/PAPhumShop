import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import {
  getCachedAccountByCode,
  getCachedInstallmentSettings,
} from '@/lib/public-data';
import AccountDetailClient from '@/components/AccountDetailClient';

interface AccountPageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({
  params,
}: AccountPageProps): Promise<Metadata> {
  const { code } = await params;
  let decodedCode = '';
  try {
    decodedCode = decodeURIComponent(code).trim();
  } catch {
    return { title: 'ไม่พบข้อมูลไอดี | PAPhum Shop' };
  }

  const account = await getCachedAccountByCode(decodedCode);
  if (!account) {
    return { title: 'ไม่พบข้อมูลไอดี | PAPhum Shop' };
  }

  const title = `ไอดี ${account.code} — ราคา ${account.price.toLocaleString('en-US')}.- | PAPhum Shop`;
  const description =
    account.description?.slice(0, 140) ||
    `รายละเอียดและคำนวณยอดผ่อนไอดี ${account.code} ราคา ${account.price.toLocaleString('en-US')} บาท`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: account.main_image_url ? [{ url: account.main_image_url }] : [],
    },
  };
}

async function AccountDetailLoader({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  let decodedCode = '';
  try {
    decodedCode = decodeURIComponent(code).trim();
  } catch {
    notFound();
  }

  if (!decodedCode) {
    notFound();
  }

  const [account, settings] = await Promise.all([
    getCachedAccountByCode(decodedCode),
    getCachedInstallmentSettings(),
  ]);

  if (!account) {
    notFound();
  }

  return (
    <AccountDetailClient
      account={account}
      settings={settings ?? undefined}
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