import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createPresignedAttachmentDownloadUrl } from '@/lib/r2';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: delivery, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !delivery) {
    return NextResponse.json(
      { error: 'ไม่พบไฟล์งาน หรือลิงก์ดาวน์โหลดหมดอายุแล้ว (เกิน 7 วัน)' },
      { status: 404 }
    );
  }

  const downloadUrl = await createPresignedAttachmentDownloadUrl({
    key: delivery.original_r2_key,
    downloadFilename: delivery.original_filename,
  });

  return NextResponse.redirect(downloadUrl, 302);
}