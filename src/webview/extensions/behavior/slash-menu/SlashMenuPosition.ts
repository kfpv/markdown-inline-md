export interface PopupAnchor {
  left: number;
  top: number;
  bottom: number;
}

export interface PopupSize {
  width: number;
  height: number;
}

export interface PopupViewport {
  width: number;
  height: number;
}

export interface PopupPosition {
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
}

/**
 * Place a fixed popup next to an editor cursor while keeping its complete box
 * inside the visible webview viewport.
 */
export function computePopupPosition(
  anchor: PopupAnchor,
  popup: PopupSize,
  viewport: PopupViewport,
  margin = 8,
  gap = 6,
): PopupPosition {
  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const maxHeight = Math.max(0, viewport.height - margin * 2);
  const width = Math.min(Math.max(0, popup.width), maxWidth);
  const height = Math.min(Math.max(0, popup.height), maxHeight);

  const maxLeft = Math.max(margin, viewport.width - width - margin);
  const left = Math.min(Math.max(anchor.left, margin), maxLeft);

  let top = anchor.bottom + gap;
  if (top + height > viewport.height - margin) {
    top = anchor.top - gap - height;
  }

  const maxTop = Math.max(margin, viewport.height - height - margin);
  top = Math.min(Math.max(top, margin), maxTop);

  return { left, top, maxWidth, maxHeight };
}
