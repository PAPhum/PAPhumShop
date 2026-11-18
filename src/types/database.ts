export type AccountStatus = 'Unavailable' | 'Available' | 'Installment' | 'SoldOut';
export type AdminRole = 'owner' | 'staff';

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

export type StoreAccount = Pick<
  AccountPublic,
  | 'id'
  | 'code'
  | 'status'
  | 'price'
  | 'min_down_weekly'
  | 'min_down_monthly'
  | 'tags'
  | 'description'
  | 'main_image_url'
  | 'created_at'
>;

export interface AccountSecretDecrypted {
  cost: number;
  purchase_date?: string;
  phone_owner?: string;
  game_uid: string;
  login_provider: string;
  username: string;
  password: string;
  authenticator: string;
  gmail: string;
  gmail_password: string;
  gmail_authenticator: string;
  gmail_recovery: string;
  private_notes: string;
}

export interface BannerCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  sort_order: number;
  hide_preview?: boolean;
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
  created_at: string;
}

export interface BannerCategorySection extends BannerCategory {
  pinned_banners: BannerItem[];
  total_count: number;
}

export interface DeliveryItem {
  id: string;
  token: string;
  banner_id: string | null;
  original_r2_key: string;
  original_filename: string;
  expires_at: string;
  created_at: string;
}

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