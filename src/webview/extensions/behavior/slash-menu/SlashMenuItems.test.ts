import { describe, expect, it } from 'vitest';
import { NodeSelection, EditorState } from 'prosemirror-state';
import { schema } from '../../../editor/EditorSchema';
import { defaultSlashItems } from './SlashMenuItems';

function runSlashCommand(id: string) {
  const paragraph = schema.nodes.paragraph.create(null, schema.text('/math'));
  const state = EditorState.create({
    schema,
    doc: schema.nodes.doc.create(null, paragraph),
  });
  let dispatched: any = null;
  const view = {
    state,
    dispatch(transaction: any) { dispatched = transaction; },
    focus() {},
  } as any;

  const item = defaultSlashItems.find(candidate => candidate.id === id);
  expect(item).toBeDefined();
  item!.command(view, 0, paragraph.nodeSize);
    expect(dispatched).not.toBeNull();
    expect(dispatched.selection).toBeInstanceOf(NodeSelection);
    expect(dispatched.doc.nodeAt(dispatched.selection.from)?.attrs.selectAllOnOpen).toBe(true);
    return dispatched;
}

describe('math slash-menu insertion', () => {
  it('selects the inserted inline math node so its editor opens', () => {
    const transaction = runSlashCommand('math-inline');

    expect(transaction.doc.nodeAt(transaction.selection.from)?.type.name).toBe('math_inline');
  });

  it('selects the inserted math block so its editor opens', () => {
    const transaction = runSlashCommand('math-block');

    expect(transaction.doc.nodeAt(transaction.selection.from)?.type.name).toBe('math_block');
  });
});
