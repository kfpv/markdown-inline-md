import { describe, expect, it } from 'vitest';
import { detectImageMime, mimeForImagePath } from './imageMime';

describe('image MIME detection', () => {
  it('detects JPEG bytes even when the path says PNG', () => {
    expect(mimeForImagePath('images/diagram.png')).toBe('image/png');
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });

  it('detects common image signatures', () => {
    expect(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectImageMime(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(detectImageMime(new TextEncoder().encode('RIFFxxxxWEBP'))).toBe('image/webp');
  });
});
