/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test, TestContext } from 'node:test';
import { CancellationToken, createConnection, createProtocolConnection, DidChangeTextDocumentNotification, DidCloseTextDocumentNotification, DidOpenTextDocumentNotification, NotebookDocuments, StreamMessageReader, StreamMessageWriter, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as md from 'vscode-markdown-languageservice';
import { URI } from 'vscode-uri';
import { getLsConfiguration } from '../config';
import * as protocol from '../protocol';
import { VsCodeClientWorkspace } from '../workspace';

function createWorkspace(t: TestContext) {
	const input = new PassThrough();
	const output = new PassThrough();
	const server = createConnection(new StreamMessageReader(input), new StreamMessageWriter(output));
	const client = createProtocolConnection(output, input);
	t.after(() => {
		client.dispose();
		server.dispose();
		input.destroy();
		output.destroy();
	});

	const documents = new TextDocuments(TextDocument);
	const notebooks = new NotebookDocuments(documents);
	const logger: md.ILogger = { level: md.LogLevel.Off, log: () => { } };
	const workspace = new VsCodeClientWorkspace(server, getLsConfiguration({}), documents, notebooks, logger);
	const documentSubscription = documents.listen(server);
	const notebookSubscription = notebooks.listen(server);
	t.after(() => {
		documentSubscription.dispose();
		notebookSubscription.dispose();
	});

	const languageService = md.createLanguageService({
		workspace,
		logger,
		parser: {
			slugifier: md.githubSlugifier,
			// These tests use inline links without code or HTML regions to exclude.
			tokenize: async () => [],
		},
	});
	t.after(() => languageService.dispose());

	client.onRequest(protocol.findMarkdownFilesInWorkspace, () => []);
	server.onRequest('test/synchronize', () => null);
	server.listen();
	client.listen();

	return {
		client,
		documents,
		workspace,
		languageService,
		synchronize: () => client.sendRequest('test/synchronize'),
	};
}

for (const languageId of ['markdown', 'prompt', 'instructions', 'chatagent', 'skill', 'custom-markdown']) {
	test(`Updates link ranges after unsaved edits in ${languageId} documents`, async t => {
		const { client, documents, languageService, synchronize } = createWorkspace(t);
		const uri = 'file:///workspace/test.md';
		await client.sendNotification(DidOpenTextDocumentNotification.type, {
			textDocument: { uri, languageId, version: 1, text: '\n\n[link](https://example.com)' },
		});
		await synchronize();

		const document = documents.get(uri)!;
		const originalLinks = await languageService.getDocumentLinks(document, CancellationToken.None);
		assert.deepStrictEqual(originalLinks.map(link => ({
			line: link.range.start.line,
			text: document.getText(link.range),
		})), [{ line: 2, text: 'https://example.com' }]);

		await client.sendNotification(DidChangeTextDocumentNotification.type, {
			textDocument: { uri, version: 2 },
			contentChanges: [{ text: '[link](https://example.org)' }],
		});
		await synchronize();

		const updatedDocument = documents.get(uri)!;
		const updatedLinks = await languageService.getDocumentLinks(updatedDocument, CancellationToken.None);
		assert.deepStrictEqual(updatedLinks.map(link => ({
			line: link.range.start.line,
			text: updatedDocument.getText(link.range),
		})), [{ line: 0, text: 'https://example.org' }]);
	});
}

test('Enumerates, closes, and reopens synchronized Markdown variants without relying on file extensions', async t => {
	const { client, workspace, synchronize } = createWorkspace(t);
	const uri = 'untitled:test';
	const deleted: string[] = [];
	const subscription = workspace.onDidDeleteMarkdownDocument(resource => deleted.push(resource.toString()));
	t.after(() => subscription.dispose());

	await client.sendNotification(DidOpenTextDocumentNotification.type, {
		textDocument: { uri, languageId: 'chatagent', version: 1, text: 'original' },
	});
	await synchronize();

	assert.deepStrictEqual(
		Array.from(await workspace.getAllMarkdownDocuments(), doc => ({ uri: doc.uri, text: doc.getText() })),
		[{ uri, text: 'original' }],
	);

	await client.sendNotification(DidCloseTextDocumentNotification.type, { textDocument: { uri } });
	await synchronize();
	assert.deepStrictEqual({
		deleted,
		documents: Array.from(await workspace.getAllMarkdownDocuments()),
	}, { deleted: [uri], documents: [] });

	await client.sendNotification(DidOpenTextDocumentNotification.type, {
		textDocument: { uri, languageId: 'chatagent', version: 1, text: 'reopened' },
	});
	await synchronize();
	assert.deepStrictEqual({
		text: (await workspace.openMarkdownDocument(URI.parse(uri)))?.getText(),
		documents: Array.from(await workspace.getAllMarkdownDocuments(), doc => doc.uri),
	}, { text: 'reopened', documents: [uri] });
});

test('Keeps bulk-edit preview documents out of workspace events and enumeration', async t => {
	const { client, workspace, synchronize } = createWorkspace(t);
	const events: string[] = [];
	const subscriptions = [
		workspace.onDidCreateMarkdownDocument(() => events.push('create')),
		workspace.onDidChangeMarkdownDocument(() => events.push('change')),
		workspace.onDidDeleteMarkdownDocument(() => events.push('delete')),
	];
	t.after(() => subscriptions.forEach(subscription => subscription.dispose()));

	const uri = 'vscode-bulkeditpreview:/test.md';
	await client.sendNotification(DidOpenTextDocumentNotification.type, {
		textDocument: { uri, languageId: 'chatagent', version: 1, text: 'original' },
	});
	await client.sendNotification(DidChangeTextDocumentNotification.type, {
		textDocument: { uri, version: 2 },
		contentChanges: [{ text: 'edited' }],
	});
	await synchronize();
	const allDocuments = Array.from(await workspace.getAllMarkdownDocuments());
	await client.sendNotification(DidCloseTextDocumentNotification.type, { textDocument: { uri } });
	await synchronize();

	assert.deepStrictEqual({ events, documents: allDocuments }, { events: [], documents: [] });
});
