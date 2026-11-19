import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { AccountStatus } from '@/types/database';
import { jsonNoStore, requireAdmin } from '@/lib/auth/guard';
import { dbErrorResponse, serverErrorResponse } from '@/lib/api-error';

const VALID_STATUSES: AccountStatus[] = ['Available', 'Installment', 'SoldOut'];

export async function GET() {
  try {
    const auth = await requireAdmin({ ownerOnly: true });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.ctx;

    const { data, error } = await supabase
      .from('accounts_public')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return dbErrorResponse('accounts.list', error, 500);
    }

    return jsonNoStore({ accounts: data ?? [] });
  } catch (err) {
    return serverErrorResponse('accounts.get', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin({ ownerOnly: true });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.ctx;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonNoStore({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    }

    const code = String(body.code ?? '').trim();
    if (!code) {
      return jsonNoStore({ error: 'กรุณาระบุรหัสไอดี เช่น PM0001' }, { status: 400 });
    }

    const mainImageUrl = body.main_image_url ? String(body.main_image_url).trim() : '';
    if (!mainImageUrl) {
      return jsonNoStore({ error: 'กรุณาอัปโหลดรูปป้ายหลักก่อนบันทึก' }, { status: 400 });
    }

    const status: AccountStatus = VALID_STATUSES.includes(body.status)
      ? body.status
      : 'Available';

    const priceNum = Math.max(0, Number(body.price) || 0);
    const now = new Date().toISOString();

    const insertData = {
      code,
      status,
      price: priceNum,
      cost: 0,
      min_down_weekly: Math.max(0, Math.trunc(Number(body.min_down_weekly) || 0)),
      min_down_monthly: Math.max(0, Math.trunc(Number(body.min_down_monthly) || 0)),
      interest_free_weeks: Math.max(0, Math.trunc(Number(body.interest_free_weeks) || 0)),
      interest_free_months: Math.max(0, Math.trunc(Number(body.interest_free_months) || 0)),
      tags: Array.isArray(body.tags) ? body.tags : [],
      description: body.description ? String(body.description) : null,
      main_image_url: mainImageUrl,
      gallery_urls: Array.isArray(body.gallery_urls) ? body.gallery_urls : [],
      game_uid_enc: null,
      login_provider_enc: null,
      username_enc: null,
      password_enc: null,
      authenticator_enc: null,
      gmail_enc: null,
      gmail_password_enc: null,
      gmail_authenticator_enc: null,
      gmail_recovery_enc: null,
      private_notes_enc: null,
      updated_at: now,
    };

    const { data: created, error: insertError } = await supabase
      .from('accounts')
      .insert(insertData)
      .select('id, code, status, price, min_down_weekly, min_down_monthly, interest_free_weeks, interest_free_months, tags, description, main_image_url, gallery_urls, created_at, updated_at')
      .single();

    if (insertError || !created) {
      return dbErrorResponse(
        'accounts.insert',
        insertError ?? new Error('บันทึกไอดีไม่สำเร็จ'),
        400
      );
    }

    revalidateTag('accounts', { expire: 0 });
    return jsonNoStore({ account: created });
  } catch (err) {
    return serverErrorResponse('accounts.post', err);
  }
}