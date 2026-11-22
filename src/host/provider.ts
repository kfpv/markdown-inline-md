import * as vscode from 'vscode';
import * as path from 'path';
import { SETTINGS_COMMENT_RE, extractSettings } from './providerUtils';
import { buildImagePathMap } from './providerImageManager';
import { handleWebviewMessage, MessageHandlerContext } from './providerMessageHandler';

interface SearchRevealMatch {
  query: string;
  occurrenceIndex: number;
}

/**
 * Custom editors do not receive the range that opened them from VS Code
 * Search. The built-in copy-match command exposes that transient range, so
 * use it as a best-effort bridge and validate the copied line first.
 */
async function captureSearchRevealMatch(document: vscode.TextDocument): Promise<SearchRevealMatch | undefined> {
  let previousClipboard = '';
  try {
    previousClipboard = await vscode.env.clipboard.readText();
    await vscode.commands.executeCommand('search.action.copyMatch');
    const copied = await vscode.env.clipboard.readText();
    const match = copied.match(/^(\d+),(\d+): ?([\s\S]*)$/);
    if (!match) return undefined;

    const lineNumber = Number(match[1]);
    const columnNumber = Number(match[2]);
    if (!Number.isInteger(lineNumber) || !Number.isInteger(columnNumber) || lineNumber < 1 || columnNumber < 1) {
      return undefined;
    }

    const line = document.lineAt(lineNumber - 1).text;
    const copiedLine = match[3].replace(/\r$/, '');
    if (line !== copiedLine || columnNumber > line.length) return undefined;

    // Search reports a one-based column at the beginning of the match.
    // Recover a searchable token, preserving a one-character fallback for
    // punctuation such as '$'.
    const matchOffset = columnNumber - 1;
    const isWordCharacter = (character: string) => /[\p{L}\p{N}_-]/u.test(character);
    let start = matchOffset;
    let end = matchOffset;
    if (isWordCharacter(line[matchOffset] || '')) {
      while (start > 0 && isWordCharacter(line[start - 1])) start--;
      while (end < line.length && isWordCharacter(line[end])) end++;
    } else if (line[matchOffset]) {
      end = matchOffset + 1;
    }
    const query = line.slice(start, end);
    if (!query) return undefined;

    const rawContent = document.getText();
    const settingsMatch = rawContent.match(SETTINGS_COMMENT_RE);
    const settingsLength = settingsMatch?.[0].length ?? 0;
    const rawOffset = document.offsetAt(new vscode.Position(lineNumber - 1, matchOffset));
    const contentOffset = Math.max(0, rawOffset - settingsLength);
    const searchableContent = rawContent.slice(settingsLength);
    const prefix = searchableContent.slice(0, contentOffset).toLocaleLowerCase();
    const normalizedQuery = query.toLocaleLowerCase();
    let occurrenceIndex = 0;
    let searchOffset = 0;
    while (true) {
      const found = prefix.indexOf(normalizedQuery, searchOffset);
      if (found < 0) break;
      occurrenceIndex++;
      searchOffset = found + Math.max(1, normalizedQuery.length);
    }

    return { query, occurrenceIndex };
  } catch {
    // The command is an internal VS Code affordance and may be unavailable in
    // older versions or when Search has no active result. Opening must still
    // continue normally.
    return undefined;
  } finally {
    try {
      await vscode.env.clipboard.writeText(previousClipboard);
    } catch {
      // Clipboard restoration is best-effort and must not block the editor.
    }
  }
}

/**
 * CustomTextEditorProvider for WYSIWYG Markdown editing.
 * Uses ProseMirror in a webview to provide rich editing while
 * keeping the underlying TextDocument as the source of truth.
 */
export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'inlineMd.markdownEditor';

  /** The most recently focused webview panel (for command-triggered actions). */
  private activePanel: vscode.WebviewPanel | undefined;

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownEditorProvider(context);

    const editorDisposable = vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: true,
      }
    );

    const exportHtmlLightCommand = vscode.commands.registerCommand('inlineMd.exportHtmlLight', () => {
      if (provider.activePanel) {
        provider.activePanel.webview.postMessage({ type: 'requestExportHtml', theme: 'light' });
      } else {
        vscode.window.showInformationMessage('Open a Markdown file in InLineMd first.');
      }
    });

    const exportHtmlDarkCommand = vscode.commands.registerCommand('inlineMd.exportHtmlDark', () => {
      if (provider.activePanel) {
        provider.activePanel.webview.postMessage({ type: 'requestExportHtml', theme: 'dark' });
      } else {
        vscode.window.showInformationMessage('Open a Markdown file in InLineMd first.');
      }
    });

    const exportPdfLightCommand = vscode.commands.registerCommand('inlineMd.exportPdfLight', () => {
      if (provider.activePanel) {
        provider.activePanel.webview.postMessage({ type: 'requestExportPdf', theme: 'light' });
      } else {
        vscode.window.showInformationMessage('Open a Markdown file in InLineMd first.');
      }
    });

    const exportPdfDarkCommand = vscode.commands.registerCommand('inlineMd.exportPdfDark', () => {
      if (provider.activePanel) {
        provider.activePanel.webview.postMessage({ type: 'requestExportPdf', theme: 'dark' });
      } else {
        vscode.window.showInformationMessage('Open a Markdown file in InLineMd first.');
      }
    });

    const toggleHighlightCommand = vscode.commands.registerCommand('inlineMd.toggleHighlight', () => {
      if (provider.activePanel) {
        provider.activePanel.webview.postMessage({ type: 'toggleHighlight' });
      }
    });

    // Override VS Code's undo/redo for our custom editor — prevents VS Code's
    // TextDocument undo from conflicting with ProseMirror's internal undo.
    // The webview handles Ctrl+Z/Y keyboard events directly via ProseMirror keymap,
    // so these commands are intentionally no-ops.
    const undoCommand = vscode.commands.registerCommand('inlineMd.undo', () => {});
    const redoCommand = vscode.commands.registerCommand('inlineMd.redo', () => {});

    return vscode.Disposable.from(editorDisposable, exportHtmlLightCommand, exportHtmlDarkCommand, exportPdfLightCommand, exportPdfDarkCommand, toggleHighlightCommand, undoCommand, redoCommand);
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const t0 = performance.now();
    console.log(`[InLineMd perf] resolveCustomTextEditor START`);

    // Get document directory and workspace folder for image access
    const documentDir = vscode.Uri.joinPath(document.uri, '..');
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

    const localResourceRoots = [
      vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
      vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      documentDir, // Allow images relative to document
    ];

    // Add workspace folder root if available
    if (workspaceFolder) {
      localResourceRoots.push(workspaceFolder.uri);
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots,
    };

    // Track active panel for command-triggered actions
    this.activePanel = webviewPanel;
    let refreshSearchReveal: (() => Promise<void>) | undefined;
    let startSearchRevealPolling: (() => void) | undefined;
    let stopSearchRevealPolling: (() => void) | undefined;
    webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        this.activePanel = webviewPanel;
        void refreshSearchReveal?.();
      }
    });

    // Track whether we are currently pushing an update to avoid loops
    let isUpdatingWebview = false;
    let isUpdatingDocument = false;
    let lastKnownContent = document.getText();

    // Sequential operation queue — prevents edit/save interleaving via await
    let operationQueue: Promise<void> = Promise.resolve();

    // Helper: get filename without extension
    const getFilename = () => {
      const basename = path.basename(document.uri.fsPath);
      return basename.replace(/\.(md|markdown|mdx)$/i, '');
    };

    // Build message handler context — bridges closure state to the extracted handler
    const messageCtx: MessageHandlerContext = {
      webviewPanel,
      document,
      getFilename,
      getLastKnownContent: () => lastKnownContent,
      setLastKnownContent: (content: string) => { lastKnownContent = content; },
      getIsUpdatingWebview: () => isUpdatingWebview,
      setIsUpdatingWebview: (value: boolean) => { isUpdatingWebview = value; },
      getIsUpdatingDocument: () => isUpdatingDocument,
      setIsUpdatingDocument: (value: boolean) => { isUpdatingDocument = value; },
      getOperationQueue: () => operationQueue,
      setOperationQueue: (queue: Promise<void>) => { operationQueue = queue; },
    };

    // Extension -> Webview: sync on external document changes
    const changeSubscription = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (isUpdatingDocument) return;

      const newContent = document.getText();
      if (newContent === lastKnownContent) return;

      lastKnownContent = newContent;

      // Remove settings comment and normalize to LF before sending to webview
      const contentWithoutComment = newContent.replace(SETTINGS_COMMENT_RE, '').replace(/\r\n/g, '\n');

      // Build image path mapping
      const imagePathMap = await buildImagePathMap(contentWithoutComment, webviewPanel.webview, document.uri);

      const isUndoRedo = e.reason === vscode.TextDocumentChangeReason.Undo ||
                          e.reason === vscode.TextDocumentChangeReason.Redo;

      isUpdatingWebview = true;
      webviewPanel.webview.postMessage({
        type: 'documentChanged',
        content: contentWithoutComment,
        imagePathMap: imagePathMap,
        isUndoRedo,
      });
      setTimeout(() => { isUpdatingWebview = false; }, 100);
    });

    // Webview -> Extension: handle messages from ProseMirror
    const messageSubscription = webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'startSearchRevealPolling') {
        startSearchRevealPolling?.();
        return;
      }
      if (message.type === 'stopSearchRevealPolling') {
        stopSearchRevealPolling?.();
        await refreshSearchReveal?.();
        return;
      }
      if (message.type === 'requestSearchReveal') {
        await refreshSearchReveal?.();
        return;
      }
      await handleWebviewMessage(messageCtx, message);
    });

    // Some VS Code versions expose Search result clicks as a transient
    // selection/active-editor change even when the custom editor panel is
    // already open. Listen for both events so a later result in the same file
    // can be propagated without reopening the provider.
    const searchSelectionSubscription = vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor.document.uri.toString() === document.uri.toString()) {
        void refreshSearchReveal?.();
      }
    });
    const activeEditorSubscription = vscode.window.onDidChangeActiveTextEditor(() => {
      if (webviewPanel.active) {
        void refreshSearchReveal?.();
      }
    });

    // Prepare initial data to embed directly in HTML (avoids postMessage race condition)
    const t1 = performance.now();
    const rawContent = document.getText();
    console.log(`[InLineMd perf] getText: ${(performance.now() - t1).toFixed(1)}ms`);

    const t2 = performance.now();
    const settings = extractSettings(rawContent);
    const contentWithoutComment = rawContent.replace(SETTINGS_COMMENT_RE, '').replace(/\r\n/g, '\n');
    console.log(`[InLineMd perf] extractSettings+strip: ${(performance.now() - t2).toFixed(1)}ms`);

    const t3 = performance.now();
    const imagePathMap = await buildImagePathMap(contentWithoutComment, webviewPanel.webview, document.uri);
    console.log(`[InLineMd perf] buildImagePathMap: ${(performance.now() - t3).toFixed(1)}ms`);

    const revealSearchMatch = await captureSearchRevealMatch(document);
    let lastSearchReveal = revealSearchMatch;

    // Search result clicks do not re-resolve an already-open custom editor.
    // Refresh on focus/view-state transitions and only notify the webview when
    // the copied Search match actually changed.
    let searchRevealRefreshInFlight: Promise<void> | undefined;
    refreshSearchReveal = () => {
      if (searchRevealRefreshInFlight) return searchRevealRefreshInFlight;

      searchRevealRefreshInFlight = (async () => {
        // Let VS Code finish moving the Search selection before asking the
        // internal copy-match command for its current result.
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const latest = await captureSearchRevealMatch(document);
        if (!latest) return;
        if (lastSearchReveal?.query === latest.query &&
            lastSearchReveal.occurrenceIndex === latest.occurrenceIndex) {
          return;
        }

        lastSearchReveal = latest;
        webviewPanel.webview.postMessage({
          type: 'revealSearchMatch',
          query: latest.query,
          occurrenceIndex: latest.occurrenceIndex,
        });
      })().finally(() => {
        searchRevealRefreshInFlight = undefined;
      });

      return searchRevealRefreshInFlight;
    };

    // Search result clicks do not emit a public VS Code event when the
    // custom editor is already open. The webview tells us when it loses focus
    // to Search, so sample the transient Search match only during that span.
    let searchRevealPoll: ReturnType<typeof setInterval> | undefined;
    let searchRevealPollStopTimer: ReturnType<typeof setTimeout> | undefined;
    startSearchRevealPolling = () => {
      if (searchRevealPoll) return;

      void refreshSearchReveal?.();
      searchRevealPoll = setInterval(() => {
        void refreshSearchReveal?.();
      }, 250);
      searchRevealPollStopTimer = setTimeout(() => {
        stopSearchRevealPolling?.();
      }, 30_000);
    };
    stopSearchRevealPolling = () => {
      if (searchRevealPoll) {
        clearInterval(searchRevealPoll);
        searchRevealPoll = undefined;
      }
      if (searchRevealPollStopTimer) {
        clearTimeout(searchRevealPollStopTimer);
        searchRevealPollStopTimer = undefined;
      }
    };

    const initialData = {
      type: 'init',
      content: contentWithoutComment,
      filename: getFilename(),
      fullWidth: settings.fullWidth,
      tocVisible: settings.tocVisible,
      imagePathMap,
      ...(revealSearchMatch ? { revealSearchMatch } : {}),
    };

    // Set HTML with embedded initial data — no postMessage needed for first load
    const t4 = performance.now();
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, initialData);
    console.log(`[InLineMd perf] getHtmlForWebview+assign: ${(performance.now() - t4).toFixed(1)}ms`);
    console.log(`[InLineMd perf] resolveCustomTextEditor TOTAL: ${(performance.now() - t0).toFixed(1)}ms`);

    // Cleanup
    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      messageSubscription.dispose();
      searchSelectionSubscription.dispose();
      activeEditorSubscription.dispose();
      stopSearchRevealPolling?.();
      if (this.activePanel === webviewPanel) {
        this.activePanel = undefined;
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, initialData?: any): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css')
    );
    const nonce = getNonce();

    // Get CSV delimiter setting from configuration
    const config = vscode.workspace.getConfiguration('inlineMd');
    const csvDelimiter = config.get<string>('csvDelimiter', 'auto');

    // Get system locale from Node.js Intl API (Windows locale, not VS Code locale)
    // Note: This often doesn't work in VS Code and returns 'en-US' even on non-English systems
    let systemLocale = 'en-US';
    try {
      systemLocale = new Intl.DateTimeFormat().resolvedOptions().locale;
    } catch (e) {
      // Fallback to VS Code locale if Intl fails
      systemLocale = vscode.env.language;
    }

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}';
        img-src ${webview.cspSource} https: http: data:;
        font-src ${webview.cspSource};
        connect-src https: http:;
        worker-src 'none';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>InLineMd</title>
    <script nonce="${nonce}">
      // CRITICAL: Prevent Service Worker registration BEFORE any other code runs
      // VS Code webview does not support Service Workers
      (function() {
        try {
          // Completely remove serviceWorker from navigator
          if ('serviceWorker' in navigator) {
            Object.defineProperty(navigator, 'serviceWorker', {
              get: function() { return undefined; },
              configurable: false,
              enumerable: false
            });
          }

          // Also prevent registration through other means
          if (window.ServiceWorkerContainer) {
            window.ServiceWorkerContainer.prototype.register = function() {
              return Promise.reject(new Error('Service Workers are not supported in VS Code webview'));
            };
          }
        } catch (e) {
          console.warn('Could not disable Service Worker:', e);
        }
      })();

      // Set system locale and CSV delimiter preference for webview
      window.systemLocale = '${systemLocale}';
      window.csvDelimiterSetting = '${csvDelimiter}';
      ${initialData ? `window.__INITIAL_DATA__ = ${JSON.stringify(initialData)};` : ''}
    </script>
</head>
<body>
    <div id="title-bar"></div>
    <div id="editor-body">
      <div id="editor-scroll-area">
        <div id="editor"></div>
      </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}


function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
