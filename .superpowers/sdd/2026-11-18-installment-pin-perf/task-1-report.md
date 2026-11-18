# Task 1 Report — Tooling + ให้ `calculateInstallmentPlan` รับ rate ได้

**Status:** DONE_WITH_CONCERNS (concerns เป็นเพียง warning ของ Vite config loader และ UI ที่ยัง hardcode ค่า 140/600 — ไม่กระทบ gate)

วันที่: 18 พ.ย. 2026
โฟลเดอร์งาน: `C:\Users\phuri\OneDrive\Desktop\paphumshop` (ไม่ใช่ git repo — ปิดงานด้วย Checkpoint ตามกฎ)

---

## 1. สิ่งที่ทำ

1. **ติดตั้ง tooling** — `npm i -D vite` สำเร็จ (เพิ่ม `vite@^8.3.8` ใน `devDependencies`; `vitest@^5.1.0` มีอยู่เดิม) รวมทั้งสิ้น 13 packages
2. **สร้าง `vitest.config.ts`** ตาม brief เป๊ะ ๆ (environment `node`, include `tests/**/*.test.ts`) — ไม่ได้เพิ่ม script ใหม่ใน `package.json`
3. **เขียนเทสต์ใหม่ 2 เคส** ใน `tests/lib/installment.test.ts` ใต้ `describe('Custom Interest Rate Override')` (ไม่ duplicate import ของ vitest)
4. **แก้ `src/lib/installment.ts`**
   - `InstallmentInput` เพิ่ม `weeklyRate?: number` และ `monthlyRate?: number`
   - บรรทัดคำนวณ rate เปลี่ยนเป็น `.weeklyRate ?? WEEKLY_INTEREST_RATE` / `.monthlyRate ?? MONTHLY_INTEREST_RATE`
   - signature ของ `calculateInstallmentPlan` เดิม ไม่เปลี่ยน; เมื่อไม่ส่งฟิลด์ใหม่ พฤติกรรมเดิมทุกจุด (ค่าคงที่ 140/600 ยังเป็น fallback)
   - `ScheduleInput extends InstallmentInput` จึงรับ rate ใหม่ได้อัตโนมัติ (และ `generatePaymentSchedule` ส่งต่อทั้ง object เข้า `calculateInstallmentPlan` อยู่แล้ว)

---

## 2. TDD Evidence

### RED — ขั้นที่ 3

คำสั่ง:

```
npx vitest run tests/lib/installment.test.ts
```

ผลลัพธ์ (ตัด excerpt):

```
 ❯ tests/lib/installment.test.ts (11 tests | 1 failed) 31ms
   ❯ Custom Interest Rate Override (2)
     × ใช้ weeklyRate ที่ส่งเข้ามาแทนค่าคงที่ 6ms

 FAIL  tests/lib/installment.test.ts > Custom Interest Rate Override > ใช้ weeklyRate ที่ส่งเข้ามาแทนค่าคงที่
AssertionError: expected 140 to be 200 // Object.is equality

- Expected
+ Received

- 200
+ 140

 ❯ tests/lib/installment.test.ts:213:42
    213|     expect(result.interestRatePerPeriod).toBe(200);

 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
```

สรุป: fail ตรงตามที่ brief คาด — `weeklyRate` ยังไม่ถูกใช้ ค่าที่ได้จึงเป็น 140 (เคส fallback ผ่านอยู่แล้วตามคาด เพราะเป็น regression guard)

### GREEN — ขั้นที่ 5 (`npx vitest run` ทั้ง suite)

```
 RUN  v5.1.0 C:/Users/phuri/OneDrive/Desktop/paphumshop

 Test Files  3 passed (3)
      Tests  23 passed (23)
   Duration  469ms
```

### Checkpoint — ขั้นที่ 6

```
npx tsc --noEmit
```
→ ผ่าน ไม่มี error (ไม่มี output)

### เพิ่มเติม (ไม่บังคับตาม brief แต่ตรวจให้ตามกฎ AGENTS.md)

```
npx eslint src/lib/installment.ts tests/lib/installment.test.ts
```
→ ผ่าน ไม่มี error/warning ในไฟล์ที่แก้ (จำนวน lint error ไม่เพิ่ม)

ไม่ได้รัน `npm run build` ตามคำสั่งของ task

---

## 3. ไฟล์ที่เปลี่ยน (4 ไฟล์ + lockfile)

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `C:\Users\phuri\OneDrive\Desktop\paphumshop\package.json` | เพิ่ม `"vite": "^8.3.8"` ใน `devDependencies` (ไม่มี script ใหม่) |
| `C:\Users\phuri\OneDrive\Desktop\paphumshop\vitest.config.ts` | สร้างใหม่ ตามที่ brief กำหนด |
| `C:\Users\phuri\OneDrive\Desktop\paphumshop\src\lib\installment.ts` | เพิ่ม 2 ฟิลด์ optional + ใช้ rate ที่ส่งเข้ามาแบบ fallback |
| `C:\Users\phuri\OneDrive\Desktop\paphumshop\tests\lib\installment.test.ts` | เพิ่ม `describe('Custom Interest Rate Override')` 2 เทสต์ |
| `C:\Users\phuri\OneDrive\Desktop\paphumshop\package-lock.json` | ปรับจาก `npm i -D vite` (ให้ผลจาก installer) |

---

## 4. Self-review

- **ค่า fallback ถูกต้อง:** เมื่อไม่ส่ง rate, `interestRatePerPeriod` = 140 (weekly) / 600 (monthly) เหมือนเดิม — เทสต์เดิม 21 เคสยังผ่านทั้งหมด (ยอดต่องวดของ 3,290 และ 10,000 ตรงกับตัวเลขเดิม)
- **ไม่มีการเปลี่ยน signature:** `calculateInstallmentPlan(input: InstallmentInput): InstallmentResult`
- **`??` ไม่ใช่ `||`:** ส่ง `0` เข้ามาจะได้ rate 0 ตามที่ผู้เรียกระบุ (ไม่ถูกแทนด้วยค่าคงที่) — เป็นพฤติกรรมที่พึงประสงค์สำหรับ "ปลอดดอก" ในงานถัดไป
- **`ScheduleInput` / `generatePaymentSchedule`:** ส่ง `input` ทั้งก้อนเข้า `calculateInstallmentPlan` อยู่แล้ว จึงรับ rate ใหม่ได้ทันทีโดยไม่ต้องแก้ไฟล์นี้
- **ไม่แตะ `.opencode/`**, ไม่แตะ DB/policy/migration, ไม่มี secret ในโค้ดหรือ log, ไม่มี Emoji, ไม่มีไอคอนใหม่
- **ตรวจ `supabase/migrations/DB.md`:** งานนี้ไม่แตะ DB เลย จึงไม่มี migration ใหม่และไม่ทับของเดิม

## 5. Concerns

1. **Vite config loader warning (ไม่ fatal):** ทุกครั้งที่รัน vitest จะมี stderr แบบนี้
   `(!) Your Vite config uses features that are unsupported by 'configLoader: "native"' ... ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)`
   สาเหตุ: `package.json` ไม่มี `"type": "module"` แต่ `vitest.config.ts` ใช้ ESM syntax. เทสต์ยังรันผ่านปกติ (23/23) และ brief กำหนดเนื้อหา config ไว้ตายตัว จึงไม่แก้เองในงานนี้. ถ้าต้องการให้เงียบ ทำได้ 2 ทางในงานถัดไป: เปลี่ยนชื่อเป็น `vitest.config.mts` หรือเพิ่ม `"type": "module"` (อย่างหลังมีความเสี่ยงกับไฟล์ `.js` เดิมของโปรเจกต์ แนะนำทางแรก)
2. **UI ยัง hardcode ค่า 140/600:** `src/components/InstallmentCalculator.tsx:128-129` และ `src/components/admin/ScheduleGeneratorModal.tsx:130,139` พิมพ์ค่าจาก `WEEKLY_INTEREST_RATE` / `MONTHLY_INTEREST_RATE` ตรง ๆ ข้อความจึงยังไม่สะท้อน rate ที่ส่งเข้าไป — อยู่นอกขอบเขต Task 1 (Task ถัดไปที่ต่อ settings ต้องอัปเดตข้อความเหล่านี้ด้วย ไม่งั้นข้อความกับตัวเลขที่คำนวณจะไม่ตรงกัน)
3. **`vite` เป็น top-level devDependency เวอร์ชันใหม่กว่า vitest อาจคาด:** ติดตั้งได้ `vite@8.3.8` คู่กับ `vitest@5.1.0` และ suite ผ่านทั้งหมด ไม่พบปัญหา resolution; `npm` รายงาน 15 high severity vulnerabilities ซึ่งเป็นของเดิมของ dependency tree ไม่ได้เกิดจากงานนี้ (ไม่ได้รัน `npm audit fix` เพราะจะเปลี่ยน dependency อื่นนอกขอบเขต)
