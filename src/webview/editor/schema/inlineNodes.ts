/**
 * Inline node specs for the InLineMd ProseMirror schema.
 */

import type { NodeSpec } from 'prosemirror-model';

const image: NodeSpec = {
  attrs: {
    src: { default: '', validate: 'string' },
    originalSrc: { default: null },  // Store original path for saving back
    alt: { default: null },
    title: { default: null },
    width: { default: null },
    height: { default: null },
  },
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  parseDOM: [
    {
      tag: 'img[src]',
      getAttrs(dom: HTMLImageElement) {
        return {
          src: dom.getAttribute('src'),
          originalSrc: dom.getAttribute('data-original-src'),
          alt: dom.getAttribute('alt'),
          title: dom.getAttribute('title'),
          width: dom.getAttribute('width') ? parseInt(dom.getAttribute('width')!, 10) : null,
          height: dom.getAttribute('height') ? parseInt(dom.getAttribute('height')!, 10) : null,
        };
      },
    },
  ],
  toDOM(node) {
    return ['img', {
      src: node.attrs.src,
      ...(node.attrs.originalSrc ? { 'data-original-src': node.attrs.originalSrc } : {}),
      alt: node.attrs.alt,
      title: node.attrs.title,
      ...(node.attrs.width ? { width: node.attrs.width } : {}),
      ...(node.attrs.height ? { height: node.attrs.height } : {}),
    }];
  },
};

// Video embed — auto-detected from image syntax by file extension
const video: NodeSpec = {
  attrs: {
    src: { default: '', validate: 'string' },
    originalSrc: { default: null },
    alt: { default: null },
    title: { default: null },
  },
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  parseDOM: [
    {
      tag: 'video[src]',
      getAttrs(dom: HTMLVideoElement) {
        return {
          src: dom.getAttribute('src'),
          originalSrc: dom.getAttribute('data-original-src'),
          alt: dom.getAttribute('title') || dom.getAttribute('data-alt'),
          title: dom.getAttribute('title'),
        };
      },
    },
  ],
  toDOM(node) {
    return ['video', {
      src: node.attrs.src,
      controls: '',
      title: node.attrs.alt || node.attrs.title || '',
      ...(node.attrs.originalSrc ? { 'data-original-src': node.attrs.originalSrc } : {}),
      ...(node.attrs.alt ? { 'data-alt': node.attrs.alt } : {}),
    }];
  },
};

// Audio embed — auto-detected from image syntax by file extension
const audio: NodeSpec = {
  attrs: {
    src: { default: '', validate: 'string' },
    originalSrc: { default: null },
    alt: { default: null },
    title: { default: null },
  },
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  parseDOM: [
    {
      tag: 'audio[src]',
      getAttrs(dom: HTMLAudioElement) {
        return {
          src: dom.getAttribute('src'),
          originalSrc: dom.getAttribute('data-original-src'),
          alt: dom.getAttribute('title') || dom.getAttribute('data-alt'),
          title: dom.getAttribute('title'),
        };
      },
    },
  ],
  toDOM(node) {
    return ['audio', {
      src: node.attrs.src,
      controls: '',
      title: node.attrs.alt || node.attrs.title || '',
      ...(node.attrs.originalSrc ? { 'data-original-src': node.attrs.originalSrc } : {}),
      ...(node.attrs.alt ? { 'data-alt': node.attrs.alt } : {}),
    }];
  },
};

// Math nodes — KaTeX-rendered math expressions
// Uses @benrbray/prosemirror-math schema specs as base
const math_inline: NodeSpec = {
  attrs: {
    // Preserve the source delimiter style when the document is serialized.
    delimiter: { default: '$', validate: 'string' },
    // Used only for newly inserted formulas. The math node view consumes this
    // once so the default expression can be replaced immediately.
    selectAllOnOpen: { default: false, validate: 'boolean' },
  },
  group: 'inline math',
  content: 'text*',
  inline: true,
  atom: true,
  parseDOM: [{
    tag: 'math-inline',
    getAttrs(dom: HTMLElement) {
      return { delimiter: dom.getAttribute('data-delimiter') === '\\(' ? '\\(' : '$' };
    },
  }],
  toDOM(node) {
    return ['math-inline', {
      class: 'math-node math-inline',
      'data-delimiter': node.attrs.delimiter,
    }, 0];
  },
};

const math_block: NodeSpec = {
  attrs: {
    // Preserve $$ versus \\[...\\] when the document is serialized.
    delimiter: { default: '$$', validate: 'string' },
    // Used only for newly inserted formulas. The math node view consumes this
    // once so the default expression can be replaced immediately.
    selectAllOnOpen: { default: false, validate: 'boolean' },
  },
  group: 'block math',
  content: 'text*',
  atom: true,
  code: true,
  parseDOM: [{
    tag: 'math-block',
    getAttrs(dom: HTMLElement) {
      return { delimiter: dom.getAttribute('data-delimiter') === '\\[' ? '\\[' : '$$' };
    },
  }, {
    tag: 'math-display',
    getAttrs(dom: HTMLElement) {
      return { delimiter: dom.getAttribute('data-delimiter') === '\\[' ? '\\[' : '$$' };
    },
  }],
  toDOM(node) {
    return ['math-block', {
      class: 'math-node',
      'data-delimiter': node.attrs.delimiter,
    }, 0];
  },
};

// HTML inline — preserves unknown inline HTML tags
const html_inline: NodeSpec = {
  attrs: {
    html: { default: '' },
  },
  inline: true,
  group: 'inline',
  atom: true,
  parseDOM: [
    {
      tag: 'span[data-type="html_inline"]',
      getAttrs(dom: HTMLElement) {
        return { html: dom.getAttribute('data-html') || '' };
      },
    },
  ],
  toDOM(node) {
    return ['span', { 'data-type': 'html_inline', 'data-html': node.attrs.html, class: 'html-inline' }, node.attrs.html];
  },
};

// Footnote reference — [^label] in text
const footnote_ref: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  attrs: {
    label: { default: '' },
  },
  parseDOM: [
    {
      tag: 'sup.footnote-ref',
      getAttrs(dom: HTMLElement) {
        return { label: dom.dataset.label || '' };
      },
    },
  ],
  toDOM(node) {
    return [
      'sup',
      { class: 'footnote-ref', 'data-label': node.attrs.label },
      `[${node.attrs.label}]`,
    ];
  },
};

const hard_break: NodeSpec = {
  inline: true,
  group: 'inline',
  selectable: false,
  parseDOM: [{ tag: 'br' }],
  toDOM() {
    return ['br'];
  },
};

const text: NodeSpec = {
  group: 'inline',
};

export const inlineNodes: Record<string, NodeSpec> = {
  image,
  video,
  audio,
  math_inline,
  math_block,
  html_inline,
  footnote_ref,
  hard_break,
  text,
};
