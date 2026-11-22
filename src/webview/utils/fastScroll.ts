import scrollIntoView from 'scroll-into-view-if-needed';
import type { Options as ScrollOptions, ScrollAction } from 'compute-scroll-into-view';

// Native smooth scrolling has a browser-defined duration. That makes long
// editor jumps feel surprisingly slow and prevents us from cancelling one
// jump cleanly when another navigation request arrives.
const MIN_DURATION_MS = 90;
const MAX_DURATION_MS = 220;
const DISTANCE_FACTOR = 0.08;

let cancelActiveScroll: (() => void) | null = null;

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

/**
 * Custom scroll behavior for editor navigation (find results, headings,
 * footnotes, and inline TOCs). Wheel/trackpad scrolling is unaffected.
 */
export function fastSmoothScroll(actions: ScrollAction[]): void {
  cancelActiveScroll?.();

  const frames = actions.map((action) => ({
    action,
    startTop: action.el.scrollTop,
    startLeft: action.el.scrollLeft,
    deltaTop: action.top - action.el.scrollTop,
    deltaLeft: action.left - action.el.scrollLeft,
  }));

  const maxDistance = frames.reduce(
    (distance, frame) => Math.max(distance, Math.abs(frame.deltaTop), Math.abs(frame.deltaLeft)),
    0,
  );

  if (maxDistance < 1) return;

  const duration = Math.min(
    MAX_DURATION_MS,
    Math.max(MIN_DURATION_MS, maxDistance * DISTANCE_FACTOR),
  );

  let animationFrame = 0;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(animationFrame);
    document.removeEventListener('wheel', cancelFromUserInput, true);
    document.removeEventListener('touchstart', cancelFromUserInput, true);
    document.removeEventListener('pointerdown', cancelFromUserInput, true);
    document.removeEventListener('keydown', cancelFromUserInput, true);
    if (cancelActiveScroll === cancel) cancelActiveScroll = null;
  };

  const cancel = () => {
    finish();
  };

  const cancelFromUserInput = () => {
    cancel();
  };

  const startedAt = performance.now();
  const animate = (now: number) => {
    if (finished) return;

    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = easeOutCubic(progress);
    for (const frame of frames) {
      frame.action.el.scrollTop = frame.startTop + frame.deltaTop * eased;
      frame.action.el.scrollLeft = frame.startLeft + frame.deltaLeft * eased;
    }

    if (progress >= 1) {
      finish();
      return;
    }

    animationFrame = requestAnimationFrame(animate);
  };

  cancelActiveScroll = cancel;
  document.addEventListener('wheel', cancelFromUserInput, true);
  document.addEventListener('touchstart', cancelFromUserInput, true);
  document.addEventListener('pointerdown', cancelFromUserInput, true);
  document.addEventListener('keydown', cancelFromUserInput, true);
  animationFrame = requestAnimationFrame(animate);
}

/** Scroll an element into view using the fast, cancellable animation. */
export function fastScrollIntoView(
  target: Element,
  options: ScrollOptions = {},
): void {
  scrollIntoView(target, {
    ...options,
    behavior: fastSmoothScroll,
  });
}
