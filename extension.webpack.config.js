/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require('path');

module.exports = /**@type {WebpackConfig} */({
	target: 'node', // extensions run in a node context
	node: {
		__dirname: false // leave the __dirname-behaviour intact
	},
	entry: {
		extension: './src/node/workerMain.ts',
	},
	output: {
		filename: 'workerMain.js',
		path: path.join(__dirname, 'dist', 'node'),
		libraryTarget: 'commonjs',
	},
	devtool: 'source-map',
	resolve: {
		mainFields: ['module', 'main'],
		extensions: ['.ts', '.js'], // support ts-files and js-files
	},
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: /node_modules/,
			use: [
				{
					loader: 'ts-loader',
				},
			]
		}]
	},
	externals: {
		'vscode': 'commonjs vscode',
	}
});
