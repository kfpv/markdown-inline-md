/**
 * MathExtension — KaTeX-rendered math expressions for ProseMirror.
 *
 * Uses @benrbray/prosemirror-math for NodeViews (MathView) and the math plugin.
 * Provides inline math ($...$, \(...\)) and block math ($$...$$, \[...\])
 * with live KaTeX rendering.
 *
 * Schema nodes are defined in EditorSchema.ts.
 * Parsing rules are in MarkdownParser.ts (inline/block math rules + ```math fence support).
 * Serialization is in MarkdownSerializer.ts.
 */

import { InputRule } from 'prosemirror-inputrules';
import type { NodeType, Schema } from 'prosemirror-model';
import type { Plugin, Command } from 'prosemirror-state';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  MathView,
  mathBackspaceCmd,
  insertMathCmd,
  makeInlineMathInputRule,
  makeBlockMathInputRule,
  REGEX_BLOCK_MATH_DOLLARS,
} from '@benrbray/prosemirror-math';
import { Extension, type SlashMenuItem } from '../../../editor/EditorExtension';
import { createMathPlugin } from './MathPlugin';

// ─── Regex ──────────────────────────────────────────────────────────────────

/** Matches the same single-dollar form accepted by the Markdown parser. */
const REGEX_INLINE_MATH_DOLLARS = /(?<!\\)\$(\S(?:[^$]*?\S)?)\$$/;
/** Matches TeX-style inline math typed at the end of a paragraph. */
const REGEX_INLINE_MATH_TEX = /(?<!\\)\\\((.+?)(?<!\\)\\\)$/;

function makeTrimmedTexInlineMathInputRule(nodeType: NodeType): InputRule {
  return new InputRule(REGEX_INLINE_MATH_TEX, (state, match, start, end) => {
    const content = match[1].trim();
    if (!content) return null;

    const $start = state.doc.resolve(start);
    const $end = state.doc.resolve(end);
    if (!$start.parent.canReplaceWith($start.index(), $end.index(), nodeType)) return null;

    return state.tr.replaceRangeWith(
      start,
      end,
      nodeType.create({ delimiter: '\\(' }, nodeType.schema.text(content))
    );
  });
}

// ─── MathExtension ──────────────────────────────────────────────────────────

export class MathExtension extends Extension {
  get name() {
    return 'math';
  }

  inputRules(schema: Schema): InputRule[] {
    return [
      makeInlineMathInputRule(REGEX_INLINE_MATH_DOLLARS, schema.nodes.math_inline),
      makeTrimmedTexInlineMathInputRule(schema.nodes.math_inline),
      makeBlockMathInputRule(REGEX_BLOCK_MATH_DOLLARS, schema.nodes.math_block),
    ];
  }

  keymaps(schema: Schema): Record<string, Command> {
    return {
      'Mod-Space': insertMathCmd(schema.nodes.math_inline),
      Backspace: mathBackspaceCmd,
    };
  }

  plugins(_schema: Schema): Plugin[] {
    return [createMathPlugin()];
  }

  get slashMenuItems(): SlashMenuItem[] {
    return [
      {
        label: 'Math (inline)',
        keywords: ['math', 'formula', 'equation', 'latex', 'katex', 'inline'],
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
        group: 'insert',
        action(view: EditorView) {
          const { state, dispatch } = view;
          const insertPos = state.selection.from;
          const node = state.schema.nodes.math_inline.create(
            { selectAllOnOpen: true },
            state.schema.text('E = mc^2')
          );
          const tr = state.tr.replaceSelectionWith(node);
          tr.setSelection(NodeSelection.create(tr.doc, insertPos));
          dispatch(tr.scrollIntoView());
        },
      },
      {
        label: 'Math block',
        keywords: ['math', 'formula', 'equation', 'latex', 'katex', 'block', 'display'],
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 8l3 4-3 4"/><path d="M14 8h3"/><path d="M14 16h3"/></svg>',
        group: 'insert',
        action(view: EditorView) {
          const { state, dispatch } = view;
          const insertPos = state.selection.from;
          const node = state.schema.nodes.math_block.create(
            { selectAllOnOpen: true },
            state.schema.text('\\int_0^\\infty e^{-x} dx = 1')
          );
          const tr = state.tr.replaceSelectionWith(node);
          tr.setSelection(NodeSelection.create(tr.doc, insertPos));
          dispatch(tr.scrollIntoView());
        },
      },
    ];
  }
}
