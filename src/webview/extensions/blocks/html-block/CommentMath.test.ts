import { describe, expect, it } from 'vitest';
import { tokenizeCommentMath } from './CommentMath';

describe('comment math tokenization', () => {
  it('finds inline math while preserving surrounding text', () => {
    expect(tokenizeCommentMath('Result: $x^2$ is positive')).toEqual([
      { kind: 'text', value: 'Result: ' },
      { kind: 'math', value: 'x^2', displayMode: false },
      { kind: 'text', value: ' is positive' },
    ]);
  });

  it('supports display math in a comment', () => {
    expect(tokenizeCommentMath('Proof: $$\\frac{1}{2}$$')).toEqual([
      { kind: 'text', value: 'Proof: ' },
      { kind: 'math', value: '\\frac{1}{2}', displayMode: true },
    ]);
  });

  it('supports TeX-style inline math in a comment', () => {
    expect(tokenizeCommentMath('Result: \\( x^2 \\) is positive')).toEqual([
      { kind: 'text', value: 'Result: ' },
      { kind: 'math', value: ' x^2 ', displayMode: false },
      { kind: 'text', value: ' is positive' },
    ]);
  });

  it('does not treat whitespace-delimited dollars as math', () => {
    expect(tokenizeCommentMath('Literal $ x $ text')).toEqual([
      { kind: 'text', value: 'Literal $ x $ text' },
    ]);
  });
});
