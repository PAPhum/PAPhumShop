import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { syncAccountToSheets, SheetAccountPayload } from '@/lib/sheets-sync';
import { AccountSecretDecrypted, AccountStatus } from '@/types/database';

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

function unpackPrivateNotes(raw: string): {
  purchase_date: string;
  phone_owner: string;
  private_notes: string;
} {
  let text = raw;
  let purchaseDate = '';
  let phoneOwner = '';

  const purchaseMatch = text.match(/\[ซื้อ:([^\]]+)\]/);
  if (purchaseMatch) {
    purchaseDate = purchaseMatch[1].trim();
    text = text.replace(purchaseMatch[0], '').trim();
  }

  const phoneMatch = text.match(/\[เบอร์:([^\]]+)\]/);
  if (phoneMatch) {
    phoneOwner = phoneMatch[1].trim();
    text = text.replace(phoneMatch[0], '').trim();
  }

  return {
    purchase_date: purchaseDate,
    phone_owner: phoneOwner,
    private_notes: text,
  };
}

function decryptAccountRow(row: Record<string, unknown>): AccountSecretDecrypted {
  const rawNotes = row.private_notes_enc
    ? decryptSecret(String(row.private_notes_enc))
    : '';
  const unpacked = unpackPrivateNotes(rawNotes);

  return {
    cost: Number(row.cost ?? 0),
    purchase_date: unpacked.purchase_date,
    phone_owner: unpacked.phone_owner,
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
    private_notes: unpacked.private_notes,
  };
}

function buildDecryptedSheetPayload(row: Record<string, unknown>): SheetAccountPayload {
  const secret = decryptAccountRow(row);
  const fullNotes = row.private_notes_enc
    ? decryptSecret(String(row.private_notes_enc))
    : '';

  return {
    code: String(row.code ?? ''),
    status: String(row.status ?? 'Unavailable'),
    price: Number(row.price ?? 0),
    cost: secret.cost,
    min_down_weekly: Number(row.min_down_weekly ?? 0),
    min_down_monthly: Number(row.min_down_monthly ?? 0),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    game_uid: secret.game_uid,
    login_provider: secret.login_provider,
    username: secret.username,
    password: secret.password,
    authenticator: secret.authenticator,
    gmail: secret.gmail,
    gmail_password: secret.gmail_password,
    gmail_authenticator: secret.gmail_authenticator,
    gmail_recovery: secret.gmail_recovery,
    private_notes: fullNotes,
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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
        { error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลลับ (เฉพาะ Owner)' },
        { status: 403 }
      );
    }

    const unlocked = await isPinUnlocked(user.id);
    if (!unlocked) {
      return NextResponse.json(
        { error: 'กรุณาปลดล็อก PIN 6 หลักก่อนดูข้อมูลลับ' },
        { status: 403 }
      );
    }

    const { data: row, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลไอดี' }, { status: 404 });
    }

    const secret = decryptAccountRow(row);
    return NextResponse.json({ secret });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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
        { error: 'ไม่มีสิทธิ์แก้ไขข้อมูลไอดี (เฉพาะ Owner)' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const now = new Date().toISOString();

    // กรณีเปลี่ยนสถานะด่วนบนการ์ด (ไม่ต้องปลดล็อก PIN)
    if (body.quickStatusOnly === true) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
      }

      const { data: updated, error } = await supabase
        .from('accounts')
        .update({ status: body.status, updated_at: now })
        .eq('id', id)
        .select('*')
        .single();

      if (error || !updated) {
        return NextResponse.json(
          { error: error?.message ?? 'อัปเดตสถานะไม่สำเร็จ' },
          { status: 400 }
        );
      }

      try {
        await syncAccountToSheets('upsert', buildDecryptedSheetPayload(updated));
      } catch {
        // Non-blocking sync
      }

      return NextResponse.json({ ok: true });
    }

    // กรณีแก้ไขข้อมูลเต็มรูปแบบ (ต้องปลดล็อก PIN)
    const unlocked = await isPinUnlocked(user.id);
    if (!unlocked) {
      return NextResponse.json(
        { error: 'กรุณาปลดล็อก PIN 6 หลักก่อนแก้ไขข้อมูล' },
        { status: 403 }
      );
    }

    const code = String(body.code ?? '').trim();
    if (!code) {
      return NextResponse.json({ error: 'กรุณาระบุรหัสไอดี' }, { status: 400 });
    }

    const status: AccountStatus = VALID_STATUSES.includes(body.status)
      ? body.status
      : 'Unavailable';

    const priceNum = Number(body.price) || 0;
    const isMonthlyPlan = priceNum > 5000;
    const freeWeeks = isMonthlyPlan ? 0 : 2;
    const freeMonths = isMonthlyPlan ? 1 : 0;

    const combinedNotes = packPrivateNotes({
      purchaseDate: body.purchase_date,
      phoneOwner: body.phone_owner,
      notes: body.private_notes,
    });

    const updateData = {
      code,
      status,
      price: priceNum,
      cost: Number(body.cost) || 0,
      min_down_weekly: Number(body.min_down_weekly) || 0,
      min_down_monthly: Number(body.min_down_monthly) || 0,
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

    const { data: updated, error: updateError } = await supabase
      .from('accounts')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message ?? 'บันทึกข้อมูลไม่สำเร็จ' },
        { status: 400 }
      );
    }

    let sheetWarning: string | undefined;
    try {
      const syncRes = await syncAccountToSheets(
        'upsert',
        buildDecryptedSheetPayload(updated)
      );
      if (!syncRes.ok) {
        sheetWarning = syncRes.error;
      }
    } catch (err) {
      sheetWarning = err instanceof Error ? err.message : 'Sheets sync error';
    }

    return NextResponse.json({ ok: true, sheetWarning });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างแก้ไขไอดี' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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
        { error: 'ไม่มีสิทธิ์ลบข้อมูลไอดี (เฉพาะ Owner)' },
        { status: 403 }
      );
    }

    const unlocked = await isPinUnlocked(user.id);
    if (!unlocked) {
      return NextResponse.json(
        { error: 'กรุณาปลดล็อก PIN 6 หลักก่อนลบไอดี' },
        { status: 403 }
      );
    }

    const { data: existing } = await supabase
      .from('accounts')
      .select('code')
      .eq('id', id)
      .maybeSingle();

    const { error: deleteError } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    if (existing?.code) {
      try {
        await syncAccountToSheets('delete', { code: existing.code });
      } catch {
        // Non-blocking delete sync
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างลบไอดี' },
      { status: 500 }
    );
  }
}