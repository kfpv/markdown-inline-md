# Known issues

## Verification notes

- Command picker: Enter successfully selects a heading command in Chromium. The previous Enter failure was not reproduced.
- Command picker positioning: viewport-clamping tests pass. Intermittent positioning problems have not been confirmed fixed across all VS Code layouts.
- Math: `$x^2$`, inline expressions within text, and `$$` blocks render. `$ x^2 $` remains literal because the single-dollar parser requires content without adjacent delimiter whitespace.
- TypeScript checking currently reports errors in the recovered source. Production builds and the 21 unit tests pass.
