import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// โหลดค่าจาก .env.local และ .env (รองรับ UTF-8 BOM บน Windows)
function loadEnvFiles() {
  for (const filename of ['.env.local', '.env']) {
    const envPath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(envPath)) continue;

    const raw = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.replace(/^\uFEFF/, '').trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;

      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

loadEnvFiles();

function parseCsv(content: string): Record<string, string>[] {
  const cleanContent = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleanContent.length; i++) {
    const ch = cleanContent[i];
    const next = cleanContent[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows[0] ?? [];
  return rows
    .slice(1)
    .filter((r) => r.length > 1)
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h.trim()] = (r[idx] ?? '').trim();
      });
      return obj;
    });
}

function makeSlug(name: string, fallback: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙@_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || fallback;
}

async function main() {
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_URL',
  ] as const;

  const missingVars = requiredVars.filter((key) => !process.env[key]?.trim());
  if (missingVars.length > 0) {
    throw new Error(
      `ไม่พบตัวแปรต่อไปนี้ใน .env.local: ${missingVars.join(', ')}`
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r2AccountId = process.env.R2_ACCOUNT_ID!;
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const r2Bucket = process.env.R2_BUCKET_NAME!;
  const r2PublicUrl = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });

  async function transferImageToR2(oldUrl: string, r2Key: string): Promise<string> {
    const res = await fetch(oldUrl);
    if (!res.ok) {
      throw new Error(`ดาวน์โหลดไม่สำเร็จ (${res.status}): ${oldUrl}`);
    }
    const arrayBuf = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/webp';

    await r2.send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: r2Key,
        Body: Buffer.from(arrayBuf),
        ContentType: contentType,
      })
    );

    return `${r2PublicUrl}/${r2Key}`;
  }

  const catsCsvPath = path.resolve(process.cwd(), 'categories_rows.csv');
  const worksCsvPath = path.resolve(process.cwd(), 'works_rows.csv');

  if (!fs.existsSync(catsCsvPath) || !fs.existsSync(worksCsvPath)) {
    throw new Error(
      'กรุณาวางไฟล์ categories_rows.csv และ works_rows.csv ไว้ในโฟลเดอร์หลัก paphumshop ก่อนรันสคริปต์'
    );
  }

  const rawCategories = parseCsv(fs.readFileSync(catsCsvPath, 'utf8'));
  const rawWorks = parseCsv(fs.readFileSync(worksCsvPath, 'utf8'));

  console.log(`พบหมวดหมู่เก่า ${rawCategories.length} หมวด และผลงาน ${rawWorks.length} รูป`);

  // 1. สร้างหรืออัปเดตหมวดหมู่ทั้งหมด (รองรับหมวดที่สร้างไว้ก่อนหน้าแล้ว)
  const oldToNewCategoryId = new Map<string, string>();
  const usedSlugs = new Set<string>();

  for (const cat of rawCategories) {
    let slug = makeSlug(cat.name, `cat-${cat.id.slice(0, 8)}`);
    if (usedSlugs.has(slug)) {
      slug = `${slug}-${cat.id.slice(0, 4)}`;
    }
    usedSlugs.add(slug);

    let newLogoUrl: string | null = null;
    if (cat.icon_url) {
      try {
        const ext = cat.icon_url.split('.').pop()?.split('?')[0] || 'png';
        const r2Key = `portfolio/migrated/logos/${cat.id}.${ext}`;
        newLogoUrl = await transferImageToR2(cat.icon_url, r2Key);
        console.log(`อัปโหลดโลโก้หมวด ${cat.name} เรียบร้อย`);
      } catch (err) {
        console.warn(`ข้ามโลโก้หมวด ${cat.name}:`, err);
      }
    }

    // เช็กว่ามี slug นี้ในฐานข้อมูลอยู่แล้วหรือไม่
    const { data: existingCat } = await supabase
      .from('banner_categories')
      .select('id, logo_url')
      .eq('slug', slug)
      .maybeSingle();

    if (existingCat) {
      await supabase
        .from('banner_categories')
        .update({
          name: cat.name,
          description: cat.description || null,
          logo_url: newLogoUrl ?? existingCat.logo_url,
          sort_order: Number(cat.display_order) || 99,
        })
        .eq('id', existingCat.id);

      oldToNewCategoryId.set(cat.id, existingCat.id);
      console.log(`เชื่อมหมวดหมู่เดิมที่มีอยู่แล้ว: ${cat.name}`);
    } else {
      const { data: insertedCat, error } = await supabase
        .from('banner_categories')
        .insert({
          name: cat.name,
          slug,
          description: cat.description || null,
          logo_url: newLogoUrl,
          sort_order: Number(cat.display_order) || 99,
        })
        .select('id')
        .single();

      if (error || !insertedCat) {
        throw new Error(`สร้างหมวดหมู่ ${cat.name} ไม่สำเร็จ: ${error?.message}`);
      }

      oldToNewCategoryId.set(cat.id, insertedCat.id);
    }
  }

  // หมวดพิเศษ "ยังไม่จัดหมวด" สำหรับ 198 รูปที่ไม่มีหมวดหมู่
  let uncategorizedId: string;
  const { data: existingUncat } = await supabase
    .from('banner_categories')
    .select('id')
    .eq('slug', 'uncategorized')
    .maybeSingle();

  if (existingUncat) {
    uncategorizedId = existingUncat.id;
  } else {
    const { data: uncatRow, error: uncatErr } = await supabase
      .from('banner_categories')
      .insert({
        name: 'ยังไม่จัดหมวด',
        slug: 'uncategorized',
        description: 'ผลงานที่ย้ายมาจากคลังเก่า รอจัดหมวดหมู่',
        logo_url: null,
        sort_order: 99,
      })
      .select('id')
      .single();

    if (uncatErr || !uncatRow) {
      throw new Error(`สร้างหมวดยังไม่จัดหมวดไม่สำเร็จ: ${uncatErr?.message}`);
    }
    uncategorizedId = uncatRow.id;
  }

  console.log('เตรียมหมวดหมู่ครบ 16 หมวดเรียบร้อย เริ่มย้ายรูปผลงานขึ้น Cloudflare R2...');

  // ดึงรายการ URL ที่เคยย้ายไปแล้ว (ป้องกันรูปซ้ำหากรันสคริปต์ซ้ำ)
  const { data: existingBanners } = await supabase
    .from('banners')
    .select('watermarked_url')
    .like('watermarked_url', '%/portfolio/migrated/works/%');

  const alreadyMigratedUrls = new Set(
    (existingBanners ?? []).map((b) => b.watermarked_url)
  );

  // 2. ย้ายรูปผลงานทั้ง 1,230 รูป (รันทีละ 10 รูปพร้อมกัน)
  const CONCURRENCY = 10;
  let successCount = 0;
  let skippedCount = 0;
  let failCount = 0;

  for (let i = 0; i < rawWorks.length; i += CONCURRENCY) {
    const batch = rawWorks.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (work) => {
        try {
          const ext = work.image_url.split('.').pop()?.split('?')[0] || 'webp';
          const r2Key = `portfolio/migrated/works/${work.id}.${ext}`;
          const targetPublicUrl = `${r2PublicUrl}/${r2Key}`;

          if (alreadyMigratedUrls.has(targetPublicUrl)) {
            skippedCount++;
            return;
          }

          const newImageUrl = await transferImageToR2(work.image_url, r2Key);

          const mappedCatId = work.category_id
            ? oldToNewCategoryId.get(work.category_id) ?? uncategorizedId
            : uncategorizedId;

          const { error: insertErr } = await supabase.from('banners').insert({
            category_id: mappedCatId,
            category_ids: [mappedCatId],
            code: work.title || null,
            watermarked_url: newImageUrl,
            is_public: true,
            is_pinned: false,
            pin_order: 0,
            created_at: work.created_at || new Date().toISOString(),
          });

          if (insertErr) throw insertErr;
          alreadyMigratedUrls.add(newImageUrl);
          successCount++;
        } catch (err) {
          failCount++;
          console.error(`ย้ายรูป ${work.id} ไม่สำเร็จ:`, err);
        }
      })
    );

    console.log(
      `ความคืบหน้า: ${Math.min(i + CONCURRENCY, rawWorks.length)} / ${rawWorks.length} รูป (ย้ายใหม่ ${successCount}, ข้ามที่มีแล้ว ${skippedCount}, พลาด ${failCount})`
    );
  }

  console.log(
    `\nเสร็จสมบูรณ์! ย้ายรูปขึ้น Cloudflare R2 และบันทึกเข้าฐานข้อมูลใหม่ ${successCount} รูป (ข้าม ${skippedCount}, พลาด ${failCount})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});