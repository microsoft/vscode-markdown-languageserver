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
const vscodeUriEsmPath = path.join(path.dirname(require.resolve('vscode-uri')), '..', 'esm', 'index.mjs');

/** @type {esbuild.Plugin} */
const vscodeUriDefaultExportPlugin = {
    name: 'vscode-uri-default-export',
    setup(build) {
        build.onResolve({ filter: /^vscode-uri$/ }, () => ({
            path: 'vscode-uri-default-export',
            namespace: 'vscode-uri-default-export',
        }));
        build.onLoad({ filter: /.*/, namespace: 'vscode-uri-default-export' }, () => ({
            contents: [
                `import { URI, Utils } from ${JSON.stringify(vscodeUriEsmPath)};`,
                'const uri = { URI, Utils };',
                'export { URI, Utils };',
                'export default uri;',
            ].join('\n'),
            loader: 'js',
            resolveDir: '/',
        }));
    },
};

/** @type {esbuild.BuildOptions} */
const baseConfig = {
    target: 'es2024',
    sourcemap: true,
    plugins: [vscodeUriDefaultExportPlugin],
};

/** @type {esbuild.BuildOptions} */
const nodeConfig = {
    ...baseConfig,
    entryPoints: ['src/node/workerMain.ts'],
    outfile: 'dist/node/workerMain.js',
    outbase: 'src',
    bundle: true,
    format: 'esm',
    platform: 'node',
    banner: {
        js: [
            "import { createRequire as __createRequire } from 'node:module';",
            "import { fileURLToPath as __fileURLToPath } from 'node:url';",
            "import { dirname as __dirnamePath } from 'node:path';",
            'const require = __createRequire(import.meta.url);',
            'const __filename = __fileURLToPath(import.meta.url);',
            'const __dirname = __dirnamePath(__filename);',
        ].join('\n'),
    },
};

/** @type {esbuild.BuildOptions} */
const browserConfig = {
    ...baseConfig,
    entryPoints: ['src/browser/workerMain.ts'],
    outfile: 'dist/browser/workerMain.js',
    bundle: true,
    format: 'esm',
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
