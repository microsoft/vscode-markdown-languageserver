/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// `vscode-markdown-languageservice` imports `vscode-uri` as a default export
// (`import uri from 'vscode-uri'`), which only exists once esbuild's
// `vscodeUriDefaultExportPlugin` (see esbuild.mjs) synthesizes it at bundle
// time. Running the source directly under plain Node ESM (as tests do) needs
// the same shim, so this loader hook adds it back for the test run only.
export async function load(url, context, nextLoad) {
	const result = await nextLoad(url, context);
	if (result.format === 'module' && /\/vscode-uri\/lib\/esm\/index\.mjs$/.test(url)) {
		const source = result.source.toString();
		if (!/export default/.test(source)) {
			return { ...result, source: `${source}\nexport default { URI, Utils };\n` };
		}
	}
	return result;
}
