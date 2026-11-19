export type AdminRole = 'owner' | 'staff';

export type AccountStatus = 'Available' | 'Installment' | 'SoldOut';

export interface AccountPublic {
  id: string;
  code: string;
  status: AccountStatus;
  price: number;
  min_down_weekly: number;
  min_down_monthly: number;
  interest_free_weeks: number;
  interest_free_months: number;
  tags: string[];
  description: string | null;
  main_image_url: string | null;
  gallery_urls: string[];
  created_at: string;
  updated_at: string;
}

export type StoreAccount = AccountPublic;

export interface BannerCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  sort_order: number;
  hide_preview?: boolean;
  created_at: string;
}

export interface BannerItem {
  id: string;
  category_id: string | null;
  category_ids: string[];
  code: string | null;
  watermarked_url: string;
  is_public: boolean;
  is_pinned: boolean;
  pin_order: number;
  pinned_category_ids?: string[];
  pin_orders?: Record<string, number>;
  created_at: string;
}

export interface BannerCategorySection extends BannerCategory {
  pinned_banners: BannerItem[];
  total_count: number;
}

export interface DeliveryRecord {
  id: string;
  token: string;
  banner_id: string | null;
  original_r2_key: string;
  original_filename: string;
  expires_at: string;
  created_at: string;
}

export type DeliveryItem = DeliveryRecord;

export interface InstallmentSettings {
  id: number;
  weekly_interest_rate: number;
  monthly_interest_rate: number;
  default_min_down_weekly: number;
  default_min_down_monthly: number;
  default_free_weeks: number;
  default_free_months: number;
  updated_at: string;
}