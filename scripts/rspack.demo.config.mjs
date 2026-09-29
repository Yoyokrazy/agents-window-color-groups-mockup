/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Static, production build of the color groups mockup fixture only.
//
// Wraps microsoft/vscode's `build/rspack/rspack.serve-out.config.mts` in its static
// Component Explorer mode and narrows it to a single fixture file. Run it from the
// vscode checkout's `build/rspack` folder (see `scripts/build.sh`) so rspack and the
// Component Explorer packages resolve from there; this file imports no packages itself.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const vscodeDir = requiredPath('VSCODE_DIR');
const outDir = requiredPath('DEMO_OUT_DIR');
const pagesUrl = process.env['DEMO_PAGES_URL'] ?? '';

const FIXTURE_FILE = 'src/vs/sessions/contrib/sessions/test/browser/colorGroupsMockup/colorGroupsMockup.fixture.ts';
const FIXTURE_ID_PREFIX = 'sessions/colorGroupsMockup/Interactive/';
const THEME_VARIANTS = { dark: 'Dark', light: 'Light2026', hc: 'DarkHighContrast' };

// The base config reads this while it is evaluated.
process.env['COMPONENT_EXPLORER_STATIC_BUILD'] = '1';
const { default: base } = await import(pathToFileURL(path.join(vscodeDir, 'build', 'rspack', 'rspack.serve-out.config.mts')).href);

const ComponentExplorerPlugin = pluginClass('ComponentExplorerPlugin');
const HtmlRspackPlugin = pluginClass('HtmlRspackPlugin');
const NormalModuleReplacementPlugin = pluginClass('NormalModuleReplacementPlugin');
const explorerHtml = base.plugins.find(plugin => isHtmlPlugin(plugin, '___explorer.html'));
if (!explorerHtml) {
	throw new Error('The base config did not emit ___explorer.html; is it still in static mode?');
}

// Modules swapped for stubs in scripts/stubs/ because they fetch from paths a static
// GitHub Pages project site can't serve (see each stub for details).
const componentFixturesDir = path.join(vscodeDir, 'src', 'vs', 'workbench', 'test', 'browser', 'componentFixtures');
const stubs = [
	{ request: /[\\/]fixtureSyntaxHighlighting\.js$/, module: path.join(componentFixturesDir, 'fixtureSyntaxHighlighting.js'), stub: 'fixtureSyntaxHighlighting.mjs' },
	{ request: /^source-map-support$/, stub: 'source-map-support.mjs' },
];

const title = 'Agents window: colored groups & collections (UX mockup)';
const description = 'Interactive UX mockup for the VS Code Agents window: colored session groups and collections. Built from real VS Code components.';

// `index.html` is the explorer page itself. Without a `fixture` query it lands in the
// interactive demo (`?theme=light` or `?theme=hc` picks another theme variant). The
// demo's theme switch then rewrites `fixture` on this same page.
const landingScript = `(function () {
	var params = new URLSearchParams(location.search);
	if (params.has('fixture')) { return; }
	var variants = ${JSON.stringify(THEME_VARIANTS)};
	var variant = variants[(params.get('theme') || '').toLowerCase()] || variants.dark;
	params.delete('theme');
	params.set('mode', 'embedded');
	params.set('fixture', ${JSON.stringify(FIXTURE_ID_PREFIX)} + variant);
	history.replaceState(null, '', location.pathname + '?' + params.toString() + location.hash);
})();`;

const socialTags = [
	`<meta name="description" content="${description}">`,
	`<meta property="og:title" content="${title}">`,
	`<meta property="og:description" content="${description}">`,
	...(pagesUrl ? [
		`<meta property="og:url" content="${pagesUrl}">`,
		`<meta property="og:image" content="${pagesUrl}og.png">`,
		'<meta name="twitter:card" content="summary_large_image">',
	] : []),
].join('');

const indexTemplate = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'
	+ `<title>${title}</title>${socialTags}<link rel="icon" href="data:,">`
	+ '<style>*{margin:0;padding:0;box-sizing:border-box}html,body,#root{height:100%;width:100%}</style>'
	+ `<script>${landingScript}</script>`
	+ '</head><body><div id="root"></div></body></html>';

const plugins = [
	...base.plugins.flatMap(plugin => {
		if (plugin.constructor.name === 'ComponentExplorerPlugin') {
			return [new ComponentExplorerPlugin({ include: FIXTURE_FILE })];
		}
		if (isHtmlPlugin(plugin, 'index.html')) {
			// Drop the workbench page; the demo landing page replaces it.
			return [new HtmlRspackPlugin({ ...explorerHtml._args[0], filename: 'index.html', templateContent: indexTemplate })];
		}
		return [plugin];
	}),
	...stubs.map(({ request, module, stub }) => new NormalModuleReplacementPlugin(request, resource => {
		if (!module || path.resolve(resource.context, resource.request) === module) {
			resource.request = path.join(import.meta.dirname, 'stubs', stub);
		}
	})),
];

const { devServer: _devServer, watchOptions: _watchOptions, ...rest } = base;

export default {
	...rest,
	mode: 'production',
	devtool: false,
	entry: {},
	output: {
		...base.output,
		path: outDir,
		filename: 'bundled/[name].[contenthash:8].js',
		chunkFilename: 'bundled/[name].[contenthash:8].js',
		cssFilename: 'bundled/[name].[contenthash:8].css',
		cssChunkFilename: 'bundled/[name].[contenthash:8].css',
		assetModuleFilename: 'bundled/assets/[name].[contenthash:8][ext][query]',
		devtoolModuleFilenameTemplate: undefined,
		clean: true,
	},
	optimization: {
		minimize: true,
	},
	performance: false,
	plugins,
};

function requiredPath(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} must be set`);
	}
	return path.resolve(value);
}

function pluginClass(name) {
	const plugin = base.plugins.find(candidate => candidate.constructor.name === name);
	if (!plugin) {
		throw new Error(`The base config has no ${name}`);
	}
	return plugin.constructor;
}

function isHtmlPlugin(plugin, filename) {
	return plugin.constructor.name === 'HtmlRspackPlugin' && plugin._args?.[0]?.filename === filename;
}
