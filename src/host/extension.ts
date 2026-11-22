import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './provider';

export function activate(context: vscode.ExtensionContext) {
  // Register custom text editor provider
  context.subscriptions.push(MarkdownEditorProvider.register(context));

  // Register command to open editor
  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMd.openEditor', () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.languageId === 'markdown') {
        vscode.commands.executeCommand(
          'vscode.openWith',
          activeEditor.document.uri,
          'inlineMd.markdownEditor'
        );
      } else {
        vscode.window.showInformationMessage('Open a Markdown file first.');
      }
    })
  );
}

export function deactivate() {}
