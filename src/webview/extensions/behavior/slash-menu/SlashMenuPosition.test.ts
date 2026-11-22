import { describe, expect, it } from 'vitest';
import { computePopupPosition } from './SlashMenuPosition';

describe('computePopupPosition', () => {
  it('keeps a normal popup inside the viewport near the cursor', () => {
    const position = computePopupPosition(
      { left: 470, top: 260, bottom: 280 },
      { width: 280, height: 180 },
      { width: 500, height: 400 },
    );

    expect(position.left).toBe(212);
    expect(position.top).toBe(74);
    expect(position.left + 280).toBeLessThanOrEqual(492);
    expect(position.top + 180).toBeLessThanOrEqual(392);
  });

  it('shrinks an oversized popup before clamping it', () => {
    const position = computePopupPosition(
      { left: 390, top: 280, bottom: 300 },
      { width: 1000, height: 1000 },
      { width: 400, height: 300 },
    );

    expect(position.maxWidth).toBe(384);
    expect(position.maxHeight).toBe(284);
    expect(position.left).toBe(8);
    expect(position.top).toBe(8);
  });
});
