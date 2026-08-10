/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import MarkdownIt from 'markdown-it';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node.js';
import { Emitter } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as lsp from 'vscode-languageserver-types';
import { createConnection, TextDocuments } from 'vscode-languageserver/node.js';
import * as md from 'vscode-markdown-languageservice';
import type { URI } from 'vscode-uri';
import { ConfigurationManager } from '../configuration.js';
import { LogFunctionLogger } from '../logging.js';
import * as protocol from '../protocol.js';
import { startServer } from '../server.js';

/**
 * Minimal in-memory {@link md.IWorkspace} implementation. Only the members the
 * paste-link-rewriting feature actually touches need real behavior; everything
 * else is a harmless no-op.
 */
class TestWorkspace implements md.IWorkspaceWithWatching {
	readonly #documents = new Map<string, md.ITextDocument>();

	readonly onDidChangeMarkdownDocument = new Emitter<md.ITextDocument>().event;
	readonly onDidCreateMarkdownDocument = new Emitter<md.ITextDocument>().event;
	readonly onDidDeleteMarkdownDocument = new Emitter<URI>().event;

	get workspaceFolders() { return []; }

	addDocument(doc: md.ITextDocument) {
		this.#documents.set(doc.uri, doc);
	}

	async getAllMarkdownDocuments() { return this.#documents.values(); }

	hasMarkdownDocument(resource: { toString(): string }) { return this.#documents.has(resource.toString()); }

	async openMarkdownDocument(resource: { toString(): string }) { return this.#documents.get(resource.toString()); }

	async stat(resource: { toString(): string }) {
		return this.#documents.has(resource.toString()) ? { isDirectory: false } : undefined;
	}

	async readDirectory() { return []; }

	watchFile(): md.IFileSystemWatcher {
		return {
			dispose() { },
			onDidCreate: new Emitter<URI>().event,
			onDidChange: new Emitter<URI>().event,
			onDidDelete: new Emitter<URI>().event,
		};
	}
}

function createTestParser(): md.IMdParser {
	const engine = MarkdownIt({ html: true });
	const validateLink = engine.validateLink.bind(engine);
	engine.validateLink = (link: string) => validateLink(link) || link.startsWith('file://');
	return {
		slugifier: md.githubSlugifier,
		async tokenize(document) {
			return engine.parse(document.getText(), {}) as unknown as md.Token[];
		},
	};
}

/**
 * Wires up a real {@link startServer} instance connected, over actual in-memory
 * duplex streams (so all params go through a genuine JSON serialize/deserialize
 * round-trip, exactly like the real client/server IPC channel), to a raw JSON-RPC
 * client connection that a test can drive directly.
 */
async function startTestServerAndClient() {
	const clientToServer = new PassThrough();
	const serverToClient = new PassThrough();

	const serverConnection = createConnection(clientToServer, serverToClient);
	const clientConnection = createMessageConnection(
		new StreamMessageReader(serverToClient),
		new StreamMessageWriter(clientToServer));
	clientConnection.listen();

	const workspace = new TestWorkspace();
	const documents = new TextDocuments(TextDocument);
	const configurationManager = new ConfigurationManager(serverConnection);

	await startServer(serverConnection, {
		documents,
		configurationManager,
		logger: new LogFunctionLogger(() => { }, configurationManager),
		parser: createTestParser(),
		workspaceFactory: () => workspace,
	});

	await clientConnection.sendRequest('initialize', {
		processId: null,
		rootUri: null,
		capabilities: {},
	});

	function openDocument(uri: string, text: string) {
		const doc = TextDocument.create(uri, 'markdown', 1, text);
		workspace.addDocument(doc);
		return clientConnection.sendNotification('textDocument/didOpen', {
			textDocument: { uri, languageId: 'markdown', version: 1, text },
		});
	}

	return { clientConnection, openDocument, dispose: () => { serverConnection.dispose(); clientConnection.dispose(); } };
}

test('getUpdatePastedLinksEdit should not throw for a normal link paste', async () => {
	const { clientConnection, openDocument, dispose } = await startTestServerAndClient();
	try {
		const copyFromUri = 'file:///workspace/sub/other.md';
		const pasteToUri = 'file:///workspace/doc.md';

		await openDocument(copyFromUri, '');
		await openDocument(pasteToUri, '');

		const metadata = await clientConnection.sendRequest(protocol.prepareUpdatePastedLinks.method, {
			uri: copyFromUri,
			ranges: [],
		});
		assert.equal(typeof metadata, 'string');

		// This is exactly what the real client (client.ts#getUpdatePastedLinksEdit) sends:
		// a standard, well-formed LSP TextEdit — `{ range: { start, end }, newText }`.
		const pasteEdit: lsp.TextEdit = lsp.TextEdit.replace(lsp.Range.create(0, 0, 0, 0), '![](img.png "title")');

		const result = await clientConnection.sendRequest(protocol.getUpdatePastedLinksEdit.method, {
			pasteIntoDoc: pasteToUri,
			metadata,
			edits: [pasteEdit],
		});

		// Before the fix, the server handler crashed with:
		// "Cannot read properties of undefined (reading 'line')" because it read
		// `edit.range[0].line` / `edit.range[1].line`, treating the LSP Range's
		// `{start, end}` object as if it were a `[start, end]` array.
		assert.deepEqual(result, [
			{
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				newText: '![](sub/img.png "title")',
			},
		]);
	} finally {
		dispose();
	}
});
