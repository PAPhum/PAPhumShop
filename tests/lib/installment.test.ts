import { describe, it, expect } from 'vitest';
import {
  getDefaultInstallmentMode,
  calculateInstallmentPlan,
  generatePaymentSchedule,
  formatCustomerQuoteText,
  formatAdminScheduleText,
} from '../../src/lib/installment';

describe('Default Installment Mode Threshold (6,000 THB)', () => {
  it('selects weekly when price is below 6,000 THB and monthly when 6,000 THB or above', () => {
    expect(getDefaultInstallmentMode(3290)).toBe('weekly');
    expect(getDefaultInstallmentMode(5999)).toBe('weekly');
    expect(getDefaultInstallmentMode(6000)).toBe('monthly');
    expect(getDefaultInstallmentMode(10000)).toBe('monthly');
  });
});

describe('Installment Calculation Formulas', () => {
  it('matches weekly plan numbers (3,290 price, 1,000 down, 2 free weeks)', () => {
    const expectedPerPeriod: Record<number, number> = {
      2: 1145,
      3: 810,
      4: 643,
      5: 542,
      6: 475,
      7: 428,
      8: 392,
    };

    for (const [periodsStr, expectedAmount] of Object.entries(expectedPerPeriod)) {
      const periods = Number(periodsStr);
      const result = calculateInstallmentPlan({
        price: 3290,
        downPayment: 1000,
        minDownPayment: 1000,
        mode: 'weekly',
        periods,
        interestFreePeriods: 2,
      });
      expect(result.amountPerPeriod).toBe(expectedAmount);
    }
  });

  it('matches monthly plan numbers (10,000 price, 3,000 down, 1 free month)', () => {
    const expectedPerPeriod: Record<number, number> = {
      1: 7000,
      2: 3800,
      3: 2734,
      4: 2200,
      5: 1880,
      6: 1667,
      7: 1515,
      8: 1400,
    };

    for (const [periodsStr, expectedAmount] of Object.entries(expectedPerPeriod)) {
      const periods = Number(periodsStr);
      const result = calculateInstallmentPlan({
        price: 10000,
        downPayment: 3000,
        minDownPayment: 2000,
        mode: 'monthly',
        periods,
        interestFreePeriods: 1,
      });
      expect(result.amountPerPeriod).toBe(expectedAmount);
    }
  });

  it('charges zero interest when periods are within or below interest-free limit', () => {
    const result = calculateInstallmentPlan({
      price: 4000,
      downPayment: 1000,
      minDownPayment: 1000,
      mode: 'weekly',
      periods: 1,
      interestFreePeriods: 2,
    });
    expect(result.totalInterest).toBe(0);
    expect(result.amountPerPeriod).toBe(3000);
  });

  it('rejects down payment below minimum down payment', () => {
    expect(() =>
      calculateInstallmentPlan({
        price: 5500,
        downPayment: 999,
        minDownPayment: 1000,
        mode: 'weekly',
        periods: 4,
        interestFreePeriods: 2,
      })
    ).toThrow('เงินดาวน์ต้องไม่ต่ำกว่าขั้นต่ำ (1,000 บาท)');
  });
});

describe('Payment Schedule & Month-End Date Clamping', () => {
  it('generates exact weekly dates (+7 days per period)', () => {
    const schedule = generatePaymentSchedule({
      code: 'PM0000',
      price: 3290,
      downPayment: 1000,
      minDownPayment: 1000,
      mode: 'weekly',
      periods: 4,
      interestFreePeriods: 2,
      startDateISO: '2026-11-16',
    });

    expect(schedule.totalInterest).toBe(280);
    expect(schedule.totalAmountWithDown).toBe(3570);
    expect(schedule.schedule.map((s) => s.dateLabel)).toEqual([
      '23/11',
      '30/11',
      '07/12',
      '14/12',
    ]);
  });

  it('clamps month-end dates like Jan 31 -> Feb 28 (or Feb 29 leap year) -> Mar 31', () => {
    const nonLeap = generatePaymentSchedule({
      code: 'PM0001',
      price: 8000,
      downPayment: 2000,
      minDownPayment: 2000,
      mode: 'monthly',
      periods: 4,
      interestFreePeriods: 1,
      startDateISO: '2026-01-31',
    });

    expect(nonLeap.schedule.map((s) => s.dateLabel)).toEqual([
      '28/02',
      '31/03',
      '30/04',
      '31/05',
    ]);

    const leapYear = generatePaymentSchedule({
      code: 'PM0002',
      price: 8000,
      downPayment: 2000,
      minDownPayment: 2000,
      mode: 'monthly',
      periods: 2,
      interestFreePeriods: 1,
      startDateISO: '2028-01-31',
    });

    expect(leapYear.schedule.map((s) => s.dateLabel)).toEqual(['29/02', '31/03']);
  });
});

describe('Copy-Paste Message Templates', () => {
  it('formats customer quote text matching the store template', () => {
    const quote = formatCustomerQuoteText({
      price: 3290,
      downPayment: 1000,
      minDownPayment: 1000,
      mode: 'weekly',
      interestFreePeriods: 2,
      maxPeriods: 4,
    });

    expect(quote).toBe(
      [
        '--- ตัวเลือกการผ่อน PAPHUM ---',
        'ราคาไอดี: 3,290฿ | ดาวน์: 1,000฿ (รายสัปดาห์)',
        '',
        '• ผ่อน 2 สัปดาห์ → งวดละ 1,145฿',
        '• ผ่อน 3 สัปดาห์ → งวดละ 810฿',
        '• ผ่อน 4 สัปดาห์ → งวดละ 643฿',
      ].join('\n')
    );
  });

  it('formats admin payment schedule text matching the store template', () => {
    const schedule = generatePaymentSchedule({
      code: 'PM0000',
      price: 10000,
      downPayment: 3000,
      minDownPayment: 2000,
      mode: 'monthly',
      periods: 4,
      interestFreePeriods: 1,
      startDateISO: '2026-11-16',
    });

    expect(formatAdminScheduleText(schedule)).toBe(
      [
        '--- ตารางผ่อนไอดี: PM0000 ---',
        '• ราคาไอดี: 10,000฿ (ฟรีดอก 1 เดือน)',
        '• จำนวน: 4 งวด (รวม 4 เดือน)',
        '• ดอก: 1,800฿ | ยอดรวม: 11,800฿',
        '',
        '[ดาวน์] 16/11 → 3,000฿',
        '[งวดที่ 1] 16/12 → 2,200฿',
        '[งวดที่ 2] 16/01 → 2,200฿',
        '[งวดที่ 3] 16/02 → 2,200฿',
        '[งวดที่ 4] 16/03 → 2,200฿',
      ].join('\n')
    );
  });
});