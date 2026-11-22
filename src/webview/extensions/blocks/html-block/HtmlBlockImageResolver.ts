/** Resolve local image references inside rendered raw HTML blocks. */

function decodeImageSource(src: string): string {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}

export function resolveHtmlImageSource(
  src: string,
  imagePathMap: Record<string, string>,
): string | null {
  if (!src || /^(?:data:|https?:|blob:|file:|\/\/|vscode-webview:)/i.test(src)) {
    return null;
  }

  const decoded = decodeImageSource(src);
  return imagePathMap[src] || imagePathMap[decoded] || null;
}

/**
 * Rewrite only the rendered DOM. The original HTML attribute remains in the
 * ProseMirror node and is therefore serialized back to its original path.
 */
export function rewriteHtmlImageSources(
  container: HTMLElement,
  imagePathMap: Record<string, string>,
): void {
  container.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
    const originalSrc = image.getAttribute('src') || '';
    const resolvedSrc = resolveHtmlImageSource(originalSrc, imagePathMap);
    if (resolvedSrc) image.setAttribute('src', resolvedSrc);
  });
}
