import katex from 'katex';

export type CommentMathToken =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; displayMode: boolean };

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 1;
}

function findClosingDelimiter(text: string, start: number, delimiter: string): number {
  for (let i = start; i <= text.length - delimiter.length; i++) {
    if (text.startsWith(delimiter, i) && !isEscaped(text, i)) return i;
  }
  return -1;
}

/**
 * Split comment text into ordinary text and the same math forms supported by
 * the editor Markdown parser: dollar delimiters and TeX delimiters.
 */
export function tokenizeCommentMath(text: string): CommentMathToken[] {
  const tokens: CommentMathToken[] = [];
  let textStart = 0;
  let index = 0;

  while (index < text.length) {
    const isTexInline = text.startsWith('\\(', index) && !isEscaped(text, index);
    const isDollar = text[index] === '$' && !isEscaped(text, index);
    if (!isTexInline && !isDollar) {
      index++;
      continue;
    }

    const isBlock = isDollar && text[index + 1] === '$' && !isEscaped(text, index + 1);
    const openingDelimiter = isTexInline ? '\\(' : (isBlock ? '$$' : '$');
    const closingDelimiter = isTexInline ? '\\)' : openingDelimiter;
    const contentStart = index + openingDelimiter.length;

    if (!isBlock && !isTexInline) {
      const firstContentChar = text[contentStart];
      if (!firstContentChar || /\s/.test(firstContentChar)) {
        index++;
        continue;
      }
    }

    const closingIndex = findClosingDelimiter(text, contentStart, closingDelimiter);
    if (closingIndex < 0) {
      index++;
      continue;
    }

    const value = text.slice(contentStart, closingIndex);
    if (!value.trim() || (!isBlock && !isTexInline && /\s/.test(value[value.length - 1]))) {
      index++;
      continue;
    }

    if (textStart < index) {
      tokens.push({ kind: 'text', value: text.slice(textStart, index) });
    }
    tokens.push({ kind: 'math', value, displayMode: isBlock });
    index = closingIndex + closingDelimiter.length;
    textStart = index;
  }

  if (textStart < text.length) {
    tokens.push({ kind: 'text', value: text.slice(textStart) });
  }

  return tokens.length > 0 ? tokens : [{ kind: 'text', value: text }];
}

/** Render comment text into a tooltip without treating ordinary text as HTML. */
export function renderCommentMath(container: HTMLElement, text: string): void {
  container.replaceChildren();

  for (const token of tokenizeCommentMath(text)) {
    if (token.kind === 'text') {
      container.appendChild(document.createTextNode(token.value));
      continue;
    }

    const math = document.createElement(token.displayMode ? 'div' : 'span');
    math.className = token.displayMode ? 'html-comment-math html-comment-math-block' : 'html-comment-math';
    math.style.display = token.displayMode ? 'block' : 'inline-block';
    math.style.verticalAlign = 'middle';
    if (token.displayMode) math.style.textAlign = 'center';

    try {
      math.innerHTML = katex.renderToString(token.value.trim(), {
        displayMode: token.displayMode,
        throwOnError: false,
      });
    } catch {
      // Keep an invalid expression readable instead of losing the comment.
      math.textContent = token.value;
    }
    container.appendChild(math);
  }
}
