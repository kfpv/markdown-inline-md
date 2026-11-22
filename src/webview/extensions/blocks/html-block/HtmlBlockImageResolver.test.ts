import { describe, expect, it } from 'vitest';
import { resolveHtmlImageSource } from './HtmlBlockImageResolver';

describe('resolveHtmlImageSource', () => {
  const imagePathMap = {
    'images/diagram.png': 'vscode-webview://resource/diagram.png',
    'images/space name.png': 'vscode-webview://resource/space-name.png',
  };

  it('resolves local HTML image paths from the host map', () => {
    expect(resolveHtmlImageSource('images/diagram.png', imagePathMap))
      .toBe('vscode-webview://resource/diagram.png');
  });

  it('resolves URL-encoded paths using the decoded map key', () => {
    expect(resolveHtmlImageSource('images/space%20name.png', imagePathMap))
      .toBe('vscode-webview://resource/space-name.png');
  });

  it('leaves external and data URLs alone', () => {
    expect(resolveHtmlImageSource('https://example.com/image.png', imagePathMap)).toBeNull();
    expect(resolveHtmlImageSource('data:image/png;base64,abc', imagePathMap)).toBeNull();
  });
});
