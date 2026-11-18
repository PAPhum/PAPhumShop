# Task Brief

> Extracted from docs/superpowers/plans/2026-11-18-installment-pin-perf.md. This brief is the single source of requirements for this task.

## Global Constraints (binding for every task)

- ทุกข้อความ UI เป็นภาษาไทยสั้น ๆ ห้าม Emoji, ไอคอนใช้ `lucide-react` เท่านั้น
- `AccountStatus` เป็น PascalCase: `'Unavailable' | 'Available' | 'Installment' | 'SoldOut'`
- ห้าม import `src/lib/crypto.ts` หรือใช้ `SUPABASE_SERVICE_ROLE_KEY` ใน client component
- ห้าม `drop`/`create` ตารางหรือ view ที่มีอยู่; migration ใหม่ใช้ `create ... if not exists` เท่านั้น
- ห้ามแตะ policy/RLS ของ production ในงานนี้
- ค่าคงที่จากสเปก: `MONTHLY_DEFAULT_PRICE_THRESHOLD = 6000`, ค่าเริ่มต้นดอกเบี้ย `140 / 600`, `PIN_SESSION_SECONDS = 2592000` — **ปลอดดอกและดาวน์ขั้นต่ำเป็นค่าของไอดี ไม่มีค่ากลางของร้าน**
- แคชแท็กที่ใช้: `accounts`, `settings`, `banners`, `categories`
- **ไม่เพิ่ม script ใหม่ใน `package.json`** (กฎ `AGENTS.md` §6) — ใช้ `npx tsc --noEmit`, `npm run build`, `npx vitest run`, `npm run lint`
- **โปรเจกต์ยังไม่เป็น git repo** → ทุก task ปิดด้วย "Checkpoint" (`npx tsc --noEmit` + gate ที่ระบุ) แทน `git commit`
- ห้าม log secret/plaintext/token; logger ต้อง redact ก่อนเขียน

---

## Task 13: รูปภาพด้วย `next/image` + fallback

**Files:**
- Modify: `next.config.ts`
- Modify: `package.json` (ย้าย `sharp` จาก devDependencies ไป dependencies)
- Create: `src/lib/image-host.ts`
- Create: `src/components/SmartImage.tsx`
- Modify: `src/components/AccountCatalogClient.tsx:223-235`
- Modify: `src/components/BannerPortfolioClient.tsx`, `src/components/BannerCoverflowCarousel.tsx` (จุดที่ใช้ `<img>`)
- Modify: `src/components/AccountDetailClient.tsx` (แกลเลอรี)
- Test: `tests/lib/image-host.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function shouldOptimizeImage(src: string, base: string | undefined): boolean;
  ```
- Produces:
  ```tsx
  export interface SmartImageProps {
    src: string; alt: string; sizes?: string; className?: string;
    priority?: boolean; fill?: boolean; width?: number; height?: number;
  }
  export default function SmartImage(props: SmartImageProps): React.ReactElement;
  ```
- พฤติกรรม: ใช้ `next/image` เมื่อ `shouldOptimizeImage(src, process.env.NEXT_PUBLIC_R2_PUBLIC_URL)` เป็นจริง ไม่งั้นใช้ `<img loading="lazy" decoding="async">`

- [ ] **Step 1: เขียนเทสต์ host ที่ยังไม่ผ่าน**

```ts
import { shouldOptimizeImage } from '../../src/lib/image-host';

it('optimize เฉพาะ host เดียวกับ R2_PUBLIC_URL', () => {
  const base = 'https://pub-abc.r2.dev';
  expect(shouldOptimizeImage('https://pub-abc.r2.dev/a.webp', base)).toBe(true);
  expect(shouldOptimizeImage('https://other.example.com/a.webp', base)).toBe(false);
  expect(shouldOptimizeImage('', base)).toBe(false);
  expect(shouldOptimizeImage('https://pub-abc.r2.dev/a.webp', undefined)).toBe(false);
});
```

รัน: `npx vitest run tests/lib/image-host.test.ts` → FAIL (module not found)

- [ ] **Step 2: ตั้งค่า `next.config.ts`**

```ts
const r2Url = process.env.R2_PUBLIC_URL;
const r2Host = r2Url ? new URL(r2Url).hostname : undefined;

const nextConfig: NextConfig = {
  // ...ของเดิม
  env: { NEXT_PUBLIC_R2_PUBLIC_URL: r2Url ?? '' },
  images: r2Host
    ? { remotePatterns: [{ protocol: 'https' as const, hostname: r2Host, pathname: '/**' }] }
    : undefined,
};
```

- [ ] **Step 3: สร้าง `src/lib/image-host.ts` และรันเทสต์ให้ผ่าน**

`shouldOptimizeImage` แปลง `base` เป็น `URL` แล้วเทียบ `origin` กับ `URL(src).origin` (คืน `false` เมื่อ parse ไม่ได้); รัน `npx vitest run tests/lib/image-host.test.ts` → PASS

- [ ] **Step 4: สร้าง `SmartImage`**

ถ้า `!src` หรือ host ไม่ตรง → `<img>`; ไม่งั้น `<Image fill sizes priority>` (หรือ `width/height` เมื่อไม่ได้ใช้ `fill`)

- [ ] **Step 5: เปลี่ยนจุดที่แสดงรูป**

- การ์ด `/store` (aspect 4/5 → `fill` + `sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"`)
- กริด/แครอเซล `/banners` (รูปแรกของแต่ละ section ใช้ `priority`)
- แกลเลอรีใน `AccountDetailClient` (ไม่ใช้ `priority`)

- [ ] **Step 6: ตรวจด้วยมือ**

เปิด `/store` และ `/banners` → DevTools Network
Expected: เห็น `/_next/image?url=...` และรูปนอกจอไม่ถูกโหลดจนเลื่อนถึง; รูปที่ URL host แปลกยังแสดงได้ผ่าน `<img>`

- [ ] **Step 7: Checkpoint**

Run: `npm run build`
Expected: ผ่าน; ถ้า `R2_PUBLIC_URL` ไม่มีตอน build ให้บันทึกว่าเป็น env ที่ขาดและหยุดตรวจข้อนี้
