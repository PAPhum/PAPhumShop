import { NextResponse } from 'next/server';
import { jsonNoStore } from '@/lib/auth/guard';
import { logServerError } from '@/lib/logger';

export function dbErrorResponse(
  context: string,
  error: unknown,
  status = 500
): NextResponse {
  logServerError(context, error);
  return jsonNoStore({ error: 'บันทึกข้อมูลไม่สำเร็จ' }, { status });
}

export function serverErrorResponse(
  context: string,
  error: unknown
): NextResponse {
  logServerError(context, error);
  return jsonNoStore({ error: 'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์' }, { status: 500 });
}