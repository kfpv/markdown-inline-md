# Markdown Inline MD

Personal fork of the recovered Markdown Inline MD VS Code extension. Provides a ProseMirror Markdown editor with source mode, tables, code blocks, and export tools.

## Development

Requires Bun. Run `bun install`, then `bun run build` to build the extension and webview. Run `bun run typecheck` and `bun run test:unit` for checks.

The recovered CSS and fonts in `dist/` are tracked because their original sources were not included. Generated JavaScript bundles and VSIX packages are ignored. The recovered source currently has TypeScript errors; builds and unit tests pass.

## Install

Download the VSIX from this repository's releases, then run `code --install-extension path/to/markdown-inline-md-0.27.4.vsix --force`. Reload the VS Code window to load the update.

## Source provenance

The source was recovered from the source maps shipped with version 0.27.3. The original license is preserved in [LICENSE.txt](LICENSE.txt).
