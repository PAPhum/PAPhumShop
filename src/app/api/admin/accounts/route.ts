import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import {
  syncAccountToSheets,
  syncAllAccountsToSheets,
  SheetAccountPayload,
} from '@/lib/sheets-sync';
import { AccountStatus } from '@/types/database';

const VALID_STATUSES: AccountStatus[] = [
  'Unavailable',
  'Available',
  'Installment',
  'SoldOut',
];

async function requireOwner(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('admin_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.role === 'owner';
}

async function isPinUnlocked(userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get('paphum_admin_pin_ok')?.value === userId;
}

function packPrivateNotes(params: {
  purchaseDate?: string;
  phoneOwner?: string;
  notes?: string;
}): string {
  const parts: string[] = [];
  if (params.purchaseDate?.trim()) {
    parts.push(`[ซื้อ:${params.purchaseDate.trim()}]`);
  }
  if (params.phoneOwner?.trim()) {
    parts.push(`[เบอร์:${params.phoneOwner.trim()}]`);
  }
  if (params.notes?.trim()) {
    parts.push(params.notes.trim());
  }
  return parts.join(' ');
}

function buildDecryptedSheetPayload(row: Record<string, unknown>): SheetAccountPayload {
  return {
    code: String(row.code ?? ''),
    status: String(row.status ?? 'Unavailable'),
    price: Number(row.price ?? 0),
    cost: Number(row.cost ?? 0),
    min_down_weekly: Number(row.min_down_weekly ?? 0),
    min_down_monthly: Number(row.min_down_monthly ?? 0),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    game_uid: row.game_uid_enc ? decryptSecret(String(row.game_uid_enc)) : '',
    login_provider: row.login_provider_enc
      ? decryptSecret(String(row.login_provider_enc))
      : 'Garena',
    username: row.username_enc ? decryptSecret(String(row.username_enc)) : '',
    password: row.password_enc ? decryptSecret(String(row.password_enc)) : '',
    authenticator: row.authenticator_enc
      ? decryptSecret(String(row.authenticator_enc))
      : '',
    gmail: row.gmail_enc ? decryptSecret(String(row.gmail_enc)) : '',
    gmail_password: row.gmail_password_enc
      ? decryptSecret(String(row.gmail_password_enc))
      : '',
    gmail_authenticator: row.gmail_authenticator_enc
      ? decryptSecret(String(row.gmail_authenticator_enc))
      : '',
    gmail_recovery: row.gmail_recovery_enc
      ? decryptSecret(String(row.gmail_recovery_enc))
      : '',
    private_notes: row.private_notes_enc
      ? decryptSecret(String(row.private_notes_enc))
      : '',
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const owner = await requireOwner(supabase, user.id);
    if (!owner) {
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลไอดี (เฉพาะ Owner)' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('accounts_public')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ accounts: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const owner = await requireOwner(supabase, user.id);
    if (!owner) {
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์จัดการข้อมูลไอดี (เฉพาะ Owner)' },
        { status: 403 }
      );
    }

    const unlocked = await isPinUnlocked(user.id);
    if (!unlocked) {
      return NextResponse.json(
        { error: 'กรุณาปลดล็อก PIN 6 หลักก่อนทำรายการ' },
        { status: 403 }
      );
    }

    const body = await req.json();

    // กรณีกดปุ่ม Sync Sheet ทั้งหมด
    if (body.action === 'sync_all') {
      const { data: rows, error } = await supabase
        .from('accounts')
        .select('*')
        .order('code', { ascending: true });

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      const payloads = (rows ?? []).map((row) => buildDecryptedSheetPayload(row));
      const syncResult = await syncAllAccountsToSheets(payloads);

      if (!syncResult.ok) {
        return NextResponse.json(
          { ok: false, error: syncResult.error ?? 'Sync Sheet ไม่สำเร็จ' },
          { status: 502 }
        );
      }

      return NextResponse.json({ ok: true, count: payloads.length });
    }

    // กรณีสร้างไอดีใหม่
    const code = String(body.code ?? '').trim();
    if (!code) {
      return NextResponse.json({ error: 'กรุณาระบุรหัสไอดี' }, { status: 400 });
    }

    const status: AccountStatus = VALID_STATUSES.includes(body.status)
      ? body.status
      : 'Unavailable';

    const priceNum = Number(body.price) || 0;
    // กติกาผ่อน: <= 5,000 เป็นรายสัปดาห์ (ปลอดดอก 2 สัปดาห์), > 5,000 เป็นรายเดือน (ปลอดดอก 1 เดือน)
    const isMonthlyPlan = priceNum > 5000;
    const freeWeeks = isMonthlyPlan ? 0 : 2;
    const freeMonths = isMonthlyPlan ? 1 : 0;

    const combinedNotes = packPrivateNotes({
      purchaseDate: body.purchase_date,
      phoneOwner: body.phone_owner,
      notes: body.private_notes,
    });

    const now = new Date().toISOString();

    const insertData = {
      code,
      status,
      price: priceNum,
      cost: Number(body.cost) || 0,
      min_down_weekly: 0,
      min_down_monthly: 0,
      interest_free_weeks: freeWeeks,
      interest_free_months: freeMonths,
      tags: Array.isArray(body.tags) ? body.tags : [],
      description: body.description ? String(body.description) : null,
      main_image_url: body.main_image_url ? String(body.main_image_url) : null,
      gallery_urls: Array.isArray(body.gallery_urls) ? body.gallery_urls : [],
      game_uid_enc: body.game_uid ? encryptSecret(String(body.game_uid)) : null,
      login_provider_enc: body.login_provider
        ? encryptSecret(String(body.login_provider))
        : encryptSecret('Garena'),
      username_enc: body.username ? encryptSecret(String(body.username)) : null,
      password_enc: body.password ? encryptSecret(String(body.password)) : null,
      authenticator_enc: body.authenticator
        ? encryptSecret(String(body.authenticator))
        : null,
      gmail_enc: body.gmail ? encryptSecret(String(body.gmail)) : null,
      gmail_password_enc: body.gmail_password
        ? encryptSecret(String(body.gmail_password))
        : null,
      gmail_authenticator_enc: body.gmail_authenticator
        ? encryptSecret(String(body.gmail_authenticator))
        : null,
      gmail_recovery_enc: body.gmail_recovery
        ? encryptSecret(String(body.gmail_recovery))
        : null,
      private_notes_enc: combinedNotes ? encryptSecret(combinedNotes) : null,
      updated_at: now,
    };

    const { data: created, error: insertError } = await supabase
      .from('accounts')
      .insert(insertData)
      .select('*')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    let sheetWarning: string | undefined;
    try {
      const syncRes = await syncAccountToSheets(
        'upsert',
        buildDecryptedSheetPayload(created)
      );
      if (!syncRes.ok) {
        sheetWarning = syncRes.error;
      }
    } catch (err) {
      sheetWarning = err instanceof Error ? err.message : 'Sheets sync error';
    }

    return NextResponse.json({
      ok: true,
      id: created.id,
      sheetWarning,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างบันทึกไอดี' },
      { status: 500 }
    );
  }
}