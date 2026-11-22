import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: true,
  minify: production,
  target: 'es2022',
  logLevel: 'info',
};

const builds = [
  {
    ...shared,
    entryPoints: ['src/host/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
  },
  {
    ...shared,
    entryPoints: ['src/webview/index.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    inject: ['src/webview/polyfills.js'],
    define: {
      'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
    },
  },
];

if (watch) {
  const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('Watching host and webview bundles.');
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
