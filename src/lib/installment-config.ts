import { MONTHLY_INTEREST_RATE, WEEKLY_INTEREST_RATE } from './installment';

export interface InstallmentRateSource {
  weekly_interest_rate?: number | null;
  monthly_interest_rate?: number | null;
}

export interface ResolvedInstallmentRates {
  weeklyRate: number;
  monthlyRate: number;
}

export const DEFAULT_INSTALLMENT_RATES: ResolvedInstallmentRates = {
  weeklyRate: WEEKLY_INTEREST_RATE,
  monthlyRate: MONTHLY_INTEREST_RATE,
};

function pick(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function resolveInstallmentRates(
  settings?: InstallmentRateSource | null
): ResolvedInstallmentRates {
  return {
    weeklyRate: pick(
      settings?.weekly_interest_rate,
      DEFAULT_INSTALLMENT_RATES.weeklyRate
    ),
    monthlyRate: pick(
      settings?.monthly_interest_rate,
      DEFAULT_INSTALLMENT_RATES.monthlyRate
    ),
  };
}