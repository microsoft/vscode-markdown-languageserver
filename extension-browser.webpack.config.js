/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require('path');

module.exports = /**@type {WebpackConfig} */({
	context: __dirname,
	target: 'webworker',
	entry: {
		extension: './src/browser/workerMain.ts',
	},
	output: {
		filename: 'workerMain.js',
		path: path.join(__dirname, 'dist', 'browser'),
		libraryTarget: 'var',
		library: 'serverExportVar'
	},
	resolve: {
		mainFields: ['browser', 'module', 'main'],
		extensions: ['.ts', '.js'], // support ts-files and js-files
		fallback: {
			'path': require.resolve('path-browserify'),
			'util': require.resolve('util')
		}
	},
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: /node_modules/,
			use: [
				{
					// configure TypeScript loader:
					// * enable sources maps for end-to-end source maps
					loader: 'ts-loader',
					
				},
			]
		}, {
			test: /\.wasm$/,
			type: 'asset/inline'
		}]
	},
	externals: {
		'vscode': 'commonjs vscode',
	}
});
