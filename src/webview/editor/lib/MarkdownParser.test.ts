import { describe, expect, it } from 'vitest';
import { createParser, parseMarkdown } from './MarkdownParser';
import { docToMarkdown } from './MarkdownSerializer';

function parse(markdown: string): any {
  return createParser().parse(markdown).toJSON();
}

function nodesOfType(node: any, type: string, result: any[] = []): any[] {
  if (node?.type === type) result.push(node);
  for (const child of node?.content ?? []) nodesOfType(child, type, result);
  return result;
}

describe('Markdown math parsing', () => {
  it('parses numeric inline expressions', () => {
    expect(nodesOfType(parse('$1$'), 'math_inline')).toHaveLength(1);
    expect(nodesOfType(parse('$0$'), 'math_inline')).toHaveLength(1);
  });

  it('parses numeric expressions inside table cells', () => {
    const document = parse([
      '| expression | value |',
      '| --- | --- |',
      '| $1$ | $x$ |',
    ].join('\n'));

    expect(nodesOfType(document, 'math_inline')).toHaveLength(2);
  });

  it('parses TeX-style inline expressions and trims delimiter padding', () => {
    const document = parse('Calculate the shaft torque, \\( T_{s} \\) .');
    const math = nodesOfType(document, 'math_inline');

    expect(math).toHaveLength(1);
    expect(math[0].attrs?.delimiter).toBe('\\(');
    expect(math[0].content?.[0]?.text).toBe('T_{s}');
  });

  it('parses TeX-style display expressions', () => {
    const document = parse('\\[\\frac{1}{2}\\]');
    const math = nodesOfType(document, 'math_block');

    expect(math).toHaveLength(1);
    expect(math[0].attrs?.delimiter).toBe('\\[');
    expect(math[0].content?.[0]?.text).toBe('\\frac{1}{2}');
  });

  it('parses multiline TeX-style display expressions', () => {
    const document = parse(['\\[', '\\begin{aligned}', 'x &= 1', '\\end{aligned}', '\\]'].join('\n'));
    const math = nodesOfType(document, 'math_block');

    expect(math).toHaveLength(1);
    expect(math[0].content?.[0]?.text).toContain('x &= 1');
  });

  it('preserves TeX delimiters when serializing an edited document', () => {
    const document = parseMarkdown([
      'Inline \\(x^2\\).',
      '',
      '\\[',
      '\\frac{1}{2}',
      '\\]',
    ].join('\n'), createParser());

    expect(docToMarkdown(document!)).toContain('\\(x^2\\)');
    expect(docToMarkdown(document!)).toContain('\\[\n\\frac{1}{2}\n\\]');
  });

  it('keeps whitespace-delimited dollar text out of math', () => {
    expect(nodesOfType(parse('$ x $'), 'math_inline')).toHaveLength(0);
  });

  it('preserves image dimensions inside pipe tables', () => {
    const document = parseMarkdown([
      '| image |',
      '| --- |',
      '| ![diagram](diagram.png){width=240} |',
    ].join('\n'), createParser());

    const images = nodesOfType(document?.toJSON(), 'image');
    expect(images[0]?.attrs.width).toBe('240');
    expect(docToMarkdown(document!)).toContain('![diagram](diagram.png){width=240}');
  });
});
