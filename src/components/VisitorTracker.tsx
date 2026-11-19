'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;

    const storageKey = 'paphum_last_tracked';
    try {
      const last = Number(sessionStorage.getItem(storageKey) || '0');
      if (Date.now() - last < 30 * 60 * 1000) return;
      sessionStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // ignore storage errors
    }

    const controller = new AbortController();
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: pathname,
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => null);

    return () => controller.abort();
  }, [pathname]);

  return null;
}