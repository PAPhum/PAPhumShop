import { Suspense } from 'react';
import { connection } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AccountPublic } from '@/types/database';
import AccountCatalogClient from '@/components/AccountCatalogClient';

async function StoreAccountsList() {
  await connection();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('accounts_public')
    .select('*')
    .in('status', ['Available', 'Installment', 'SoldOut'])
    .order('created_at', { ascending: false });

  const accounts = (data ?? []) as AccountPublic[];

  return <AccountCatalogClient accounts={accounts} />;
}

export default function StorePage() {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`store-skel-${i}`}
              className="aspect-[3/4] animate-pulse rounded-xl border border-white/[0.06] bg-[#111216]"
            />
          ))}
        </div>
      }
    >
      <StoreAccountsList />
    </Suspense>
  );
}