const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

export function mimeForImagePath(filePath: string): string | null {
  const cleanPath = filePath.split(/[?#]/, 1)[0].toLowerCase();
  const dot = cleanPath.lastIndexOf('.');
  return dot >= 0 ? MIME_BY_EXTENSION[cleanPath.slice(dot)] || null : null;
}

/** Detect common image formats from their file signatures, not their names. */
export function detectImageMime(data: Uint8Array): string | null {
  const startsWith = (...bytes: number[]) => bytes.every((byte, index) => data[index] === byte);
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...data.slice(start, start + length));

  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(0, 2) === 'BM') return 'image/bmp';
  if (startsWith(0x00, 0x00, 0x01, 0x00)) return 'image/x-icon';

  const header = new TextDecoder().decode(data.slice(0, 512)).trimStart();
  if (header.startsWith('<svg') || (header.startsWith('<?xml') && header.includes('<svg'))) {
    return 'image/svg+xml';
  }

  return null;
}
