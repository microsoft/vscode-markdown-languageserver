# Contributing

Thanks for your interest in contributing to the Markdown Language Server!

Most of the language features are implemented in the upstream [Markdown Language Service](https://github.com/microsoft/vscode-markdown-languageservice), so many changes belong in that repository instead of this one.

## Building and Running

## Prerequisites

- [Node.js](https://nodejs.org/) 22 or newer
- npm (bundled with Node.js)

To get started:

```bash
npm install
```

### Building

This project is written in TypeScript. To build it, run:

```bash
npm run compile
```

To rebuild automatically as you make changes:

```bash
npm run watch
```

### Testing in VS Code

You can test your local changes against the VS Code source by using [`npm link`](https://docs.npmjs.com/cli/v10/commands/npm-link).

1. Build this project so the latest output is available:

   ```bash
   npm run compile
   ```

2. Register this package as a global link from the root of this repository:

   ```bash
   npm link
   ```

3. In your local copy of [`vscode`](https://github.com/microsoft/vscode), link the package into the Markdown extension:

   ```bash
   cd extensions/markdown-language-features
   npm link vscode-markdown-languageserver
   ```

4. Launch VS Code from your `vscode` checkout to test your changes. Run `npm run watch` here to rebuild as you edit.

### Shipping (for maintainers only)

This project is shipped using the `vscode-markdown-languageserver` pipeline. To ship a new version:

- Make sure `main` has the latest changes including the version bump.
- Run `vscode-markdown-languageserver`. You'll need an approval for this.
- Once the build is complete, approve the release.

This should automatically create tags and a release once the package is published.


## Updating the language service
This server uses the [`vscode-markdown-languageservice`](https://github.com/microsoft/vscode-markdown-languageservice) library for almost all of its functionality. To pull in the latest version:

```bash
npm install vscode-markdown-languageservice@latest
```

