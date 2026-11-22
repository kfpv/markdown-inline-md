/**
 * MathPlugin — ProseMirror plugin providing MathView NodeViews for KaTeX rendering.
 *
 * Copied from Outline's extensions/Math.ts with adaptations:
 * - Uses dynamic import for KaTeX CSS (loaded once on first math view creation)
 * - Tracks active MathView instances for lifecycle management
 * - Supports custom LaTeX macros via plugin state
 */

import { MathView } from '@benrbray/prosemirror-math';
import type { PluginSpec } from 'prosemirror-state';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { EditorView, NodeViewConstructor } from 'prosemirror-view';

// ─── Plugin State ───────────────────────────────────────────────────────────

export interface MathPluginState {
  macros: Record<string, string>;
  activeNodeViews: MathView[];
  prevCursorPos: number;
}

const MATH_PLUGIN_KEY = new PluginKey<MathPluginState>('prosemirror-math');

// ─── MathView Factory ───────────────────────────────────────────────────────
// KaTeX CSS is loaded statically via @import in math.css

function createMathView(displayMode: boolean): NodeViewConstructor {
  return (node, view, getPos) => {

    const pluginState = MATH_PLUGIN_KEY.getState(view.state);
    if (!pluginState) {
      throw new Error('[MathPlugin] No math plugin state found');
    }

    const nodeViews = pluginState.activeNodeViews;

    const nodeView = new MathView(
      node,
      view,
      getPos as () => number,
      {
        katexOptions: {
          displayMode,
          output: 'html',
          macros: pluginState.macros,
          throwOnError: false,
        },
      },
      MATH_PLUGIN_KEY,
      () => {
        // Cleanup: remove from active list when destroyed
        const idx = nodeViews.indexOf(nodeView);
        if (idx >= 0) nodeViews.splice(idx, 1);
      }
    );

    // MathView owns a nested ProseMirror editor. The dependency provides
    // keymaps for arrows/Enter/Backspace, but not Mod-a, so the browser's
    // default action selects the whole webview instead of the formula text.
    // Install the handler whenever the node is opened, including existing
    // math nodes and nodes reopened after leaving edit mode.
    let configuredInnerView: EditorView | undefined;
    const originalSelectNode = nodeView.selectNode.bind(nodeView);
    nodeView.selectNode = () => {
      originalSelectNode();

      const innerView = (nodeView as any)._innerView as EditorView | undefined;
      if (!innerView || innerView === configuredInnerView) return;

      configuredInnerView = innerView;
      innerView.setProps({
        handleKeyDown(inner, event) {
          if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'a') {
            return false;
          }

          event.preventDefault();
          event.stopPropagation();
          const end = inner.state.doc.content.size;
          inner.dispatch(
            inner.state.tr.setSelection(TextSelection.create(inner.state.doc, 0, end))
          );
          return true;
        },
      });
    };

    // A newly inserted math node carries a one-time marker. MathView opens
    // its nested editor from selectNode(), so wrap that method and select the
    // initial formula after the inner editor has been created. Existing math
    // nodes do not carry the marker and retain the normal cursor behavior.
    if (node.attrs.selectAllOnOpen === true) {
      let initialContentSelected = false;
      const selectNode = nodeView.selectNode.bind(nodeView);
      nodeView.selectNode = () => {
        selectNode();
        if (initialContentSelected) return;

        const innerView = (nodeView as any)._innerView as EditorView | undefined;
        if (!innerView) return;

        initialContentSelected = true;
        const contentSize = innerView.state.doc.content.size;
        if (contentSize > 0) {
          innerView.dispatch(
            innerView.state.tr.setSelection(
              TextSelection.create(innerView.state.doc, 0, contentSize)
            )
          );
        }
      };
    }

    nodeViews.push(nodeView);
    return nodeView;
  };
}

// ─── Plugin ─────────────────────────────────────────────────────────────────

export function createMathPlugin(): Plugin {
  const spec: PluginSpec<MathPluginState> = {
    key: MATH_PLUGIN_KEY,
    state: {
      init(): MathPluginState {
        return {
          macros: {},
          activeNodeViews: [],
          prevCursorPos: 0,
        };
      },
      apply(tr, value, oldState): MathPluginState {
        return {
          activeNodeViews: value.activeNodeViews,
          macros: value.macros,
          prevCursorPos: oldState.selection.from,
        };
      },
    },
    props: {
      nodeViews: {
        math_inline: createMathView(false),
        math_block: createMathView(true),
      },
    },
  };

  return new Plugin(spec);
}
