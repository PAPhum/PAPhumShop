import { describe, it, expect } from 'vitest';
import {
  buildR2ObjectKey,
  createPresignedUploadUrl,
  createPresignedAttachmentDownloadUrl,
  isAllowedImageMimeType,
  R2Config,
} from '../../src/lib/r2';

const MOCK_R2_CONFIG: R2Config = {
  accountId: 'test-account-id',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  bucketName: 'paphum-storage',
  publicBaseUrl: 'https://cdn.paphum.shop',
};

describe('Cloudflare R2 Storage Helpers', () => {
  it('isolates object keys by folder prefix and UTC year/month', () => {
    const fixedDate = new Date('2026-11-17T03:00:00Z');

    const portfolioKey = buildR2ObjectKey('portfolio', 'banner_1229.webp', fixedDate);
    const tempKey = buildR2ObjectKey('temp-deliveries', '1229Final.png', fixedDate);
    const accountKey = buildR2ObjectKey('accounts', 'skin_list.webp', fixedDate);

    expect(portfolioKey).toMatch(/^portfolio\/2026\/11\/[0-9a-f]{16}\.webp$/);
    expect(tempKey).toMatch(/^temp-deliveries\/2026\/11\/[0-9a-f]{16}\.png$/);
    expect(accountKey).toMatch(/^accounts\/2026\/11\/[0-9a-f]{16}\.webp$/);
  });

  it('validates allowed image MIME types strictly', () => {
    expect(isAllowedImageMimeType('image/webp')).toBe(true);
    expect(isAllowedImageMimeType('image/png')).toBe(true);
    expect(isAllowedImageMimeType('image/jpeg')).toBe(true);
    expect(isAllowedImageMimeType('application/x-msdownload')).toBe(false);
    expect(isAllowedImageMimeType('text/html')).toBe(false);
  });

  it('generates presigned upload URL and clean public CDN URL', async () => {
    const res = await createPresignedUploadUrl(
      {
        folder: 'portfolio',
        filename: 'test.webp',
        contentType: 'image/webp',
      },
      MOCK_R2_CONFIG
    );

    expect(res.key.startsWith('portfolio/')).toBe(true);
    expect(res.publicUrl).toBe(`https://cdn.paphum.shop/${res.key}`);
    expect(res.uploadUrl).toContain('test-account-id.r2.cloudflarestorage.com');
    expect(res.uploadUrl).toContain('X-Amz-Signature=');
  });

  it('rejects unsupported file types during presigned URL generation', async () => {
    await expect(
      createPresignedUploadUrl(
        {
          folder: 'temp-deliveries',
          filename: 'malware.exe',
          contentType: 'application/octet-stream',
        },
        MOCK_R2_CONFIG
      )
    ).rejects.toThrow('Unsupported file type');
  });

  it('generates attachment download URL with forced filename header', async () => {
    const url = await createPresignedAttachmentDownloadUrl(
      {
        key: 'temp-deliveries/2026/11/abcdef1234567890.png',
        downloadFilename: 'PAPhum_1229Final.png',
      },
      MOCK_R2_CONFIG
    );

    expect(url).toContain('response-content-disposition=attachment');
    expect(url).toContain('PAPhum_1229Final.png');
  });
});