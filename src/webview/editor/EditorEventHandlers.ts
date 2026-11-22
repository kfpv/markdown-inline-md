/**
 * EditorEventHandlers — standalone ProseMirror event handler functions.
 *
 * Extracted from EditorCore. Each function receives the context it needs
 * as parameters (config, pasteParser, etc.) instead of closing over class state.
 */

import {
  TextSelection,
  NodeSelection,
} from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as ProsemirrorNode } from 'prosemirror-model';
import type { MarkdownParser } from 'prosemirror-markdown';

import { schema } from './EditorSchema';
import { getMarkRange } from './lib/MarkRange';
import type { EditorCoreConfig } from './EditorCore';
import { fastScrollIntoView } from '../utils/fastScroll';

interface ClipboardImagePayload {
  path?: string;
  data?: string;
  name?: string;
  type?: string;
}

function isClipboardImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(file.name);
}

function clipboardImageFiles(data: DataTransfer): File[] {
  const files = Array.from(data.files).filter(isClipboardImage);
  if (files.length > 0) return files;

  // Some Chromium clipboard providers expose pasted images through items but
  // leave DataTransfer.files empty.
  return Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && isClipboardImage(file));
}

function readClipboardImage(file: File): Promise<ClipboardImagePayload> {
  const filePath = (file as File & { path?: string }).path;
  if (filePath) {
    return Promise.resolve({ path: filePath });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result : '';
      if (data) {
        resolve({ data, name: file.name, type: file.type });
      } else {
        reject(new Error('Clipboard image did not contain readable data'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read clipboard image'));
    reader.readAsDataURL(file);
  });
}

function handleImagePaste(view: EditorView, data: DataTransfer): boolean {
  const files = clipboardImageFiles(data);
  if (files.length === 0) return false;

  // Capture the selection before the asynchronous file read/host write. This
  // makes paste replace a selected image and keeps insertion inside the cell
  // where the paste started.
  const { from, to } = view.state.selection;
  Promise.all(files.map(readClipboardImage))
    .then((images) => {
      window.dispatchEvent(new CustomEvent('inlinemd:pasteImages', {
        detail: { images, from, to },
      }));
    })
    .catch((error) => {
      console.warn('[InLineMd] Failed to read pasted image:', error);
    });

  // Prevent the browser/ProseMirror fallback from inserting an unusable
  // file:// or blob URL. The host persists the image and returns a local
  // markdown reference instead.
  return true;
}

// ── handleClickOn ──

export function handleClickOn(
  view: EditorView,
  _pos: number,
  node: ProsemirrorNode,
  nodePos: number,
  event: MouseEvent,
  direct: boolean,
  config: EditorCoreConfig
): boolean {
  // Image click -> NodeSelection (center) or TextSelection (left edge)
  if (node.type.name === 'image' && direct) {
    event.preventDefault();
    const imgDom =
      (view.nodeDOM(nodePos) as HTMLElement) ||
      (event.target as HTMLElement).closest('.image-view-wrapper');

    // Click on left edge -> place text cursor before the image
    if (imgDom) {
      const rect = imgDom.getBoundingClientRect();
      const edgeZone = Math.min(20, rect.width * 0.15);
      if (event.clientX < rect.left + edgeZone) {
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, nodePos))
        );
        return true;
      }
    }

    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos))
    );
    if (imgDom && config.onImageClick) {
      config.onImageClick(view, nodePos, node, imgDom);
    }
    return true;
  }

  // Footnote ref click -> handled in handleClick (below) for single-click navigation

  // Checkbox toggle
  if (node.type.name === 'checkbox_item') {
    const target = event.target as HTMLElement;
    if (target.classList.contains('checkbox')) {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch(
        view.state.tr.setNodeMarkup(nodePos, undefined, {
          ...node.attrs,
          // Cycle: unchecked -> checked -> inapplicable -> unchecked
          checked: node.attrs.checked === 'inapplicable' ? false : node.attrs.checked ? 'inapplicable' : true,
        })
      );
      return true;
    }
  }

  return false;
}

// ── preserveImageSelection ──

/**
 * Preserve NodeSelection on images when browser fires selectionchange.
 * Without this, selectionFromDOM() creates a TextSelection, overwriting our NodeSelection.
 */
export function preserveImageSelection(view: EditorView, $anchor: any): any {
  const { selection } = view.state;
  if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
    const imagePos = selection.from;
    if (Math.abs($anchor.pos - imagePos) <= 1) {
      return NodeSelection.create(view.state.doc, imagePos);
    }
  }
  return undefined;
}

// ── handleClick ──

export function handleClick(
  view: EditorView,
  pos: number,
  event: MouseEvent,
  config: EditorCoreConfig
): boolean {
  const clickTarget = event.target as HTMLElement;

  // Footnote ref click -> scroll to matching definition
  const fnRefEl = clickTarget.closest('.footnote-ref') as HTMLElement;
  if (fnRefEl) {
    const label = fnRefEl.dataset.label;
    if (label) {
      event.preventDefault();
      let defPos: number | null = null;
      view.state.doc.descendants((n, p) => {
        if (n.type.name === 'footnote_def' && n.attrs.label === label) {
          defPos = p;
          return false;
        }
      });
      if (defPos !== null) {
        const $pos = view.state.doc.resolve(defPos + 1);
        view.dispatch(
          view.state.tr.setSelection(TextSelection.near($pos, 1))
        );
        const defDom = view.nodeDOM(defPos) as HTMLElement;
        if (defDom) {
          fastScrollIntoView(defDom, { block: 'center' });
        }
      }
      return true;
    }
  }

  // Footnote label click -> scroll back to matching ref
  if (clickTarget.classList.contains('footnote-label')) {
    const defEl = clickTarget.closest('.footnote-def') as HTMLElement;
    if (defEl?.dataset.label) {
      event.preventDefault();
      const label = defEl.dataset.label;
      let refPos: number | null = null;
      view.state.doc.descendants((n, p) => {
        if (n.type.name === 'footnote_ref' && n.attrs.label === label) {
          refPos = p;
          return false;
        }
      });
      if (refPos !== null) {
        view.dispatch(
          view.state.tr.setSelection(
            NodeSelection.create(view.state.doc, refPos)
          )
        );
        const refDom = view.nodeDOM(refPos) as HTMLElement;
        if (refDom) {
          fastScrollIntoView(refDom, { block: 'center' });
        }
      }
      return true;
    }
  }

  // Ctrl+Click -> open link or navigate to anchor
  if ((event.ctrlKey || event.metaKey) && event.button === 0) {
    const $pos = view.state.doc.resolve(pos);
    const range = getMarkRange($pos, schema.marks.link);
    if (range) {
      const href = range.mark.attrs.href;
      event.preventDefault();

      // Anchor link -- navigate within document
      if (href.startsWith('#')) {
        const targetEl = document.getElementById(href.slice(1));
        if (targetEl) {
          const headingEl =
            targetEl.closest('h1, h2, h3, h4, h5, h6') ||
            targetEl.nextElementSibling ||
            targetEl.parentElement;
          try {
            const targetPos = view.posAtDOM(targetEl, 0, 1);
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.near(view.state.doc.resolve(targetPos), 1)
              )
            );
          } catch { /* ignore position errors */ }
          fastScrollIntoView(headingEl || targetEl, { block: 'start' });
        }
        return true;
      }

      // External link
      config.onOpenLink?.(href);
      return true;
    }
  }

  // Regular click on link -- select full link text + show popup
  const target = event.target as HTMLElement;
  if (target.tagName === 'A' || target.closest('a')) {
    const $pos = view.state.doc.resolve(pos);
    const range = getMarkRange($pos, schema.marks.link);
    if (range) {
      event.preventDefault();
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.create(view.state.doc, range.from, range.to)
        )
      );
      if (config.onLinkSelect) {
        const href = range.mark.attrs.href;
        requestAnimationFrame(() => {
          config.onLinkSelect!(view, href);
        });
      }
      return true;
    }
  }

  return false;
}

// ── handlePaste ──

export function handlePaste(
  view: EditorView,
  event: ClipboardEvent,
  pasteParser: MarkdownParser
): boolean {
  if (event.clipboardData && handleImagePaste(view, event.clipboardData)) {
    return true;
  }

  const text = event.clipboardData?.getData('text/plain');
  if (!text) return false;

  const html = event.clipboardData?.getData('text/html');
  const { $from } = view.state.selection;
  const inCodeBlock = $from.parent.type.name === 'code_block';

  // Single-line markdown link: [text](url)
  if (!inCodeBlock && !text.includes('\n')) {
    const linkMatch = text.trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, linkText, linkHref] = linkMatch;
      const linkMark = schema.marks.link.create({ href: linkHref });
      const linkNode = schema.text(linkText, [linkMark]);
      view.dispatch(view.state.tr.replaceSelectionWith(linkNode, false));
      return true;
    }
  }

  // Multi-line text -> paragraphs
  if (!inCodeBlock && text.includes('\n')) {
    const lines = text.split('\n');
    if (lines.length > 1) {
      const isExternalHTML =
        html && !html.includes('ProseMirror') && !html.includes('code-block');
      if (
        isExternalHTML &&
        (html!.includes('<div') || html!.includes('<span') || html!.includes('<p'))
      ) {
        return false;
      }

      const nodes = lines.map((line) =>
        schema.nodes.paragraph.create(null, line ? schema.text(line) : null)
      );
      const fragment = schema.nodes.doc.create(null, nodes);
      view.dispatch(
        view.state.tr.replaceSelection(fragment.slice(0, fragment.content.size))
      );
      return true;
    }
  }

  // External HTML -- let ProseMirror handle it
  if (html && !html.includes('ProseMirror')) return false;

  // URL paste -> wrap selected text as link or insert link
  const isUrl = /^https?:\/\/\S+$/.test(text.trim());
  if (isUrl) {
    const { from, to, empty } = view.state.selection;
    if (!empty) {
      view.dispatch(
        view.state.tr.addMark(from, to, schema.marks.link.create({ href: text.trim() }))
      );
      return true;
    }
    const linkMark = schema.marks.link.create({ href: text.trim() });
    const linkText = schema.text(text.trim(), [linkMark]);
    view.dispatch(view.state.tr.replaceSelectionWith(linkText));
    return true;
  }

  // Markdown paste
  const looksLikeMarkdown =
    /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|---|\*\*|__|~~|==|\||\{\+|\{-)/.test(text.trim());
  if (looksLikeMarkdown) {
    const doc = pasteParser.parse(text);
    if (doc) {
      view.dispatch(
        view.state.tr.replaceSelection(doc.slice(0, doc.content.size))
      );
      return true;
    }
  }

  return false;
}

// ── handlePastePlainText ──

/**
 * Paste from clipboard with markdown parsing (for context menu Paste).
 * Replicates Ctrl+V behavior but reads from Clipboard API.
 */
export function handlePasteFromClipboard(view: EditorView, pasteParser: MarkdownParser): void {
  navigator.clipboard.readText().then((text) => {
    if (!text) return;

    const { $from } = view.state.selection;
    const inCodeBlock = $from.parent.type.name === 'code_block';

    if (inCodeBlock) {
      const { from, to } = view.state.selection;
      view.dispatch(view.state.tr.insertText(text, from, to));
      return;
    }

    // Single-line markdown link: [text](url)
    if (!text.includes('\n')) {
      const linkMatch = text.trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, linkText, linkHref] = linkMatch;
        const linkMark = schema.marks.link.create({ href: linkHref });
        const linkNode = schema.text(linkText, [linkMark]);
        view.dispatch(view.state.tr.replaceSelectionWith(linkNode, false));
        return;
      }
    }

    // URL paste -> wrap selected text as link or insert link
    const isUrl = /^https?:\/\/\S+$/.test(text.trim());
    if (isUrl) {
      const { from, to, empty } = view.state.selection;
      if (!empty) {
        view.dispatch(
          view.state.tr.addMark(from, to, schema.marks.link.create({ href: text.trim() }))
        );
        return;
      }
      const linkMark = schema.marks.link.create({ href: text.trim() });
      const linkText = schema.text(text.trim(), [linkMark]);
      view.dispatch(view.state.tr.replaceSelectionWith(linkText));
      return;
    }

    // Try markdown parsing
    const doc = pasteParser.parse(text);
    if (doc && doc.content.size > 2) {
      view.dispatch(
        view.state.tr.replaceSelection(doc.slice(0, doc.content.size))
      );
      return;
    }

    // Fallback: plain text
    const { from, to } = view.state.selection;
    view.dispatch(view.state.tr.insertText(text, from, to));
  }).catch(() => {});
}

/** Strip markdown syntax from text, keeping only visible content */
function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')    // ![alt](url) → alt
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')      // [text](url) → text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')           // ***bold italic***
    .replace(/\*\*(.+?)\*\*/g, '$1')               // **bold**
    .replace(/\*(.+?)\*/g, '$1')                    // *italic*
    .replace(/~~(.+?)~~/g, '$1')                    // ~~strikethrough~~
    .replace(/==(.+?)==/g, '$1')                    // ==highlighted==
    .replace(/(?<!\w)__(.+?)__(?!\w)/g, '$1')       // __underline__
    .replace(/`([^`]+)`/g, '$1')                    // `code`
    .replace(/\{\+(.+?)\+\}/g, '$1')               // {+added+}
    .replace(/\{-(.+?)-\}/g, '$1')                 // {-removed-}
    .replace(/\[\^([^\]]+)\]/g, '')                 // [^footnote] → remove
    .replace(/^#{1,6}\s+/gm, '')                    // # heading → heading
    .replace(/^>\s?/gm, '')                         // > quote → quote
    .replace(/^[-*+]\s/gm, '')                      // - list → list
    .replace(/^\d+\.\s/gm, '');                     // 1. list → list
}

/**
 * Paste clipboard content as plain text without any formatting.
 * Strips markdown syntax so [link](url) becomes just "link".
 * Used by Ctrl+Shift+V and "Paste as Text" context menu.
 */
export function handlePastePlainText(view: EditorView): boolean {
  navigator.clipboard.readText().then((text) => {
    if (!text) return;
    const stripped = stripMarkdownSyntax(text);
    const { from, to } = view.state.selection;
    view.dispatch(
      view.state.tr.insertText(stripped, from, to)
    );
  }).catch(() => {
    // Clipboard API may fail in some contexts
  });
  return true;
}
