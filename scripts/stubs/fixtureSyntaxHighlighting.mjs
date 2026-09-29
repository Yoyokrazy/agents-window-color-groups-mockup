/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Build-time stand-in for vscode's
// src/vs/workbench/test/browser/componentFixtures/fixtureSyntaxHighlighting.ts.
//
// The real module loads TextMate grammars and onig.wasm from the web server root
// (`/extensions/...`, `/node_modules/...`), which a GitHub Pages project site
// (`/<repo>/`) cannot serve. The mockup renders no code, so it only needs the
// language registrations.

const fixtureLanguageIds = [
	'typescript',
	'typescriptreact',
	'javascript',
	'javascriptreact',
	'json',
	'css',
	'html',
	'jsx-tags',
];

export function registerFixtureLanguages(disposables, languageService) {
	for (const languageId of fixtureLanguageIds) {
		disposables.add(languageService.registerLanguage({ id: languageId }));
	}
}

export async function registerFixtureSyntaxHighlighting() { }
