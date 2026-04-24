/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { globSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

const watch = process.argv.includes('--watch');

// Resolve to the top-level copy to avoid duplicate nested copies
const l10nPath = path.dirname(require.resolve('@vscode/l10n/package.json'));

/** @type {esbuild.BuildOptions} */
const baseConfig = {
    target: 'es2022',
    sourcemap: true,
};

/** @type {esbuild.BuildOptions} */
const nodeConfig = {
    ...baseConfig,
    entryPoints: globSync('src/**/*.ts', { exclude: ['src/browser/**'] }),
    outdir: 'dist',
    outbase: 'src',
    bundle: false,
    format: 'cjs',
    platform: 'node',
};

/** @type {esbuild.BuildOptions} */
const browserConfig = {
    ...baseConfig,
    entryPoints: ['src/browser/workerMain.ts'],
    outfile: 'dist/browser/workerMain.js',
    bundle: true,
    format: 'iife',
    globalName: 'serverExportVar',
    platform: 'browser',
    external: ['vscode'],
    define: {
        'process.platform': JSON.stringify('web'),
        'process.env': JSON.stringify({}),
        'process.env.BROWSER_ENV': JSON.stringify('true'),
    },
    loader: {
        '.wasm': 'binary',
    },
    alias: {
        '@vscode/l10n': l10nPath,
        'path': 'path-browserify',
    },
};

async function main() {
    if (watch) {
        const [nodeCtx, browserCtx] = await Promise.all([
            esbuild.context(nodeConfig),
            esbuild.context(browserConfig),
        ]);
        await Promise.all([
            nodeCtx.watch(),
            browserCtx.watch(),
        ]);
        console.log('Watching for changes...');
    } else {
        await Promise.all([
            esbuild.build(nodeConfig),
            esbuild.build(browserConfig),
        ]);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
