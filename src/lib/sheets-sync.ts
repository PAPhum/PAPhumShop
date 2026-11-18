export interface SheetAccountPayload {
  code: string;
  status: string;
  price: number;
  cost: number;
  min_down_weekly: number;
  min_down_monthly: number;
  tags: string[];
  game_uid: string;
  login_provider: string;
  username: string;
  password: string;
  authenticator: string;
  gmail: string;
  gmail_password: string;
  gmail_authenticator: string;
  gmail_recovery: string;
  private_notes: string;
  updated_at: string;
}

export async function syncAccountToSheets(
  action: 'upsert' | 'delete',
  account: Partial<SheetAccountPayload> & { code: string }
): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;

  if (!webhookUrl || !secret) {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า GOOGLE_SHEETS_WEBHOOK_URL' };
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      action,
      account,
    }),
  });

  if (!res.ok) {
    return { ok: false, error: `Google Sheets HTTP ${res.status}` };
  }

  const data = await res.json().catch(() => ({ ok: true }));
  return data;
}

export async function syncAllAccountsToSheets(
  accounts: SheetAccountPayload[]
): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;

  if (!webhookUrl || !secret) {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า GOOGLE_SHEETS_WEBHOOK_URL' };
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      action: 'sync_all',
      accounts,
    }),
  });

  if (!res.ok) {
    return { ok: false, error: `Google Sheets HTTP ${res.status}` };
  }

  const data = await res.json().catch(() => ({ ok: true }));
  return data;
}