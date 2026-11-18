import { Suspense } from 'react';
import { getCachedStoreAccounts } from '@/lib/public-data';
import AccountCatalogClient from '@/components/AccountCatalogClient';

async function StoreAccountsList() {
  const accounts = await getCachedStoreAccounts();
  return <AccountCatalogClient accounts={accounts} />;
}

export default function StorePage() {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`store-skel-${i}`}
              className="aspect-[4/5] animate-pulse rounded-2xl border border-white/[0.06] bg-[#111216]"
            />
          ))}
        </div>
      }
    >
      <StoreAccountsList />
    </Suspense>
  );
}