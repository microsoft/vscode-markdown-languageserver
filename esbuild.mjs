/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

// Resolve to the top-level copy to avoid duplicate nested copies
const l10nPath = path.dirname(require.resolve('@vscode/l10n/package.json'));

/** @type {esbuild.BuildOptions} */
const commonConfig = {
    bundle: true,
    target: 'es2022',
    sourcemap: true,
    minify,
    external: ['vscode'],
    alias: {
        '@vscode/l10n': l10nPath,
    },
};

/** @type {esbuild.BuildOptions} */
const nodeConfig = {
    ...commonConfig,
    entryPoints: ['src/node/workerMain.ts'],
    outfile: 'dist/node/workerMain.js',
    format: 'cjs',
    platform: 'node',
};

/** @type {esbuild.BuildOptions} */
const browserConfig = {
    ...commonConfig,
    entryPoints: ['src/browser/workerMain.ts'],
    outfile: 'dist/browser/workerMain.js',
    format: 'iife',
    globalName: 'serverExportVar',
    platform: 'browser',
    define: {
        'process.platform': JSON.stringify('web'),
        'process.env': JSON.stringify({}),
        'process.env.BROWSER_ENV': JSON.stringify('true'),
    },
    loader: {
        '.wasm': 'binary',
    },
    alias: {
        ...commonConfig.alias,
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
