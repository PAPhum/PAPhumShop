import { NextRequest, NextResponse } from 'next/server';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function createR2PresignedPutUrl(params: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  objectKey: string;
  expiresInSeconds?: number;
}): string {
  const {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    objectKey,
    expiresInSeconds = 900,
  } = params;

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const encodedKeyPath = objectKey
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/');
  const canonicalUri = `/${encodeRfc3986(bucketName)}/${encodedKeyPath}`;

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();
  const publicBaseUrl = (
    process.env.R2_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return NextResponse.json(
      {
        error:
          'ยังไม่ได้ตั้งค่า R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME ใน .env.local',
      },
      { status: 500 }
    );
  }

  const body = await req.json();
  const folder =
    String(body.folder ?? 'uploads')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .trim() || 'uploads';
  const rawFilename = String(body.filename ?? 'file.webp');
  const extMatch = rawFilename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'webp';

  const key = `${folder}/${Date.now()}-${randomUUID()}.${ext}`;
  const uploadUrl = createR2PresignedPutUrl({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    objectKey: key,
  });

  const publicUrl = publicBaseUrl
    ? `${publicBaseUrl}/${key}`
    : `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;

  return NextResponse.json({
    uploadUrl,
    publicUrl,
    key,
  });
}