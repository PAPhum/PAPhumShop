const TRUSTED_R2_HOSTS = new Set([
  'pub-a4f6e5ad0c7d4b4195b80612e4e42779.r2.dev',
]);

const configuredPublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim();
if (configuredPublicUrl) {
  try {
    TRUSTED_R2_HOSTS.add(new URL(configuredPublicUrl).hostname);
  } catch {
    // ignore malformed env
  }
}

export function isOptimizableImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return true;

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' && TRUSTED_R2_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}