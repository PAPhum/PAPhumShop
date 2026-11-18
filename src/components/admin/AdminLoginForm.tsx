'use client';

import { useState } from 'react';
import { Snowflake } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

export default function AdminLoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const trimmed = username.trim().toLowerCase();
    const internalEmail = trimmed.includes('@')
      ? trimmed
      : `${trimmed}@paphum.local`;

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: internalEmail,
      password,
    });

    if (signInError) {
      setError('Username หรือรหัสผ่านไม่ถูกต้อง');
      setLoading(false);
      return;
    }

    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-sm pt-16 animate-panel-in">
      <div className="rounded-xl border border-white/[0.08] bg-[#111216] p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <Snowflake className="h-5 w-5 text-[#93C5FD]" />
          <h1 className="font-[family-name:var(--font-display)] text-base font-semibold text-[#F1F5F9]">
            PAPhum Console
          </h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Username</label>
            <input
              type="text"
              required
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="paphum"
              className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-3.5 py-2.5 font-[family-name:var(--font-mono)] text-sm text-[#F1F5F9] placeholder:text-zinc-600 focus:border-[#93C5FD]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-3.5 py-2.5 text-sm text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#F1F5F9] py-2.5 text-sm font-semibold text-[#0A0A0D] transition-colors hover:bg-white disabled:opacity-50"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  );
}