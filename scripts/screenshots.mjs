/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Regenerates the README screenshots in media/ from a served build of docs/.
//
//   node scripts/screenshots.mjs [--base <site root>]
//
// --base defaults to a local `python3 -m http.server 8765` run from a folder that
// contains docs/ as `agents-window-color-groups-mockup/`. Playwright is loaded from
// the vscode checkout (VSCODE_DIR).

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const vscodeDir = process.env['VSCODE_DIR'] ?? path.join(os.homedir(), '.copilot/repos/vscode.worktrees/agents-window-color-grouping-mockup');
const { chromium } = createRequire(path.join(vscodeDir, 'package.json'))('playwright');

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex > 0 ? process.argv[baseIndex + 1] : 'http://127.0.0.1:8765/agents-window-color-groups-mockup/';
const mediaDir = path.join(import.meta.dirname, '..', 'media');
fs.mkdirSync(mediaDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); } });

const fixtureUrl = id => `${base}___explorer.html?mode=embedded&fixture=${encodeURIComponent(`sessions/colorGroupsMockup/${id}`)}`;
const open = async url => {
	await page.goto(url, { waitUntil: 'networkidle' });
	await page.locator('.cg-window').waitFor();
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(800);
};
const capture = async (fixtureId, selector) => {
	await open(fixtureUrl(fixtureId));
	return (await page.locator(selector).first().screenshot()).toString('base64');
};
const save = async (name, buffer) => {
	fs.writeFileSync(path.join(mediaDir, name), buffer);
	console.log(`wrote media/${name}`);
};

// Full interactive demo, through the landing page.
const heroes = {};
for (const [theme, query] of [['dark', ''], ['light', '?theme=light']]) {
	await open(`${base}${query}`);
	heroes[theme] = await page.screenshot();
	await save(`demo-${theme}.png`, heroes[theme]);
}

// Montages of cropped fixture states, laid out in the browser.
const montage = async (name, rows) => {
	const figures = rows.map(row => `<div class="row">${row.map(({ label, image }) => `<figure><img src="data:image/png;base64,${image}"><figcaption>${label}</figcaption></figure>`).join('')}</div>`).join('');
	await page.setViewportSize({ width: 2400, height: 900 });
	await page.setContent(`<!DOCTYPE html><html><head><style>
		body { margin: 0; background: #0d0d0f; font: 600 15px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #d6d6dd; }
		#montage { display: inline-flex; flex-direction: column; gap: 24px; padding: 24px; background: #0d0d0f; }
		.row { display: flex; gap: 24px; align-items: flex-start; }
		figure { margin: 0; display: flex; flex-direction: column; gap: 10px; }
		img { border-radius: 10px; }
		figcaption { text-align: center; }
	</style></head><body><div id="montage">${figures}</div></body></html>`);
	await page.evaluate(() => Promise.all([...document.images].map(async img => {
		await img.decode();
		img.style.width = `${img.naturalWidth / 2}px`;
	})));
	await save(name, await page.locator('#montage').screenshot());
	await page.setViewportSize({ width: 1440, height: 900 });
};

const styles = ['Rail', 'Outline', 'Tint', 'Dot'];
const styleRows = [];
for (const theme of ['Dark', 'Light2026']) {
	const row = [];
	for (const style of styles) {
		row.push({ label: theme === 'Dark' ? style : '', image: await capture(`${style}/${theme}`, '.cg-sidebar') });
	}
	styleRows.push(row);
}
await montage('group-styles.png', styleRows);

await montage('editors.png', [[
	{ label: 'Edit group: palette colors', image: await capture('GroupEditor/Dark', '.cg-header-editor') },
	{ label: 'Custom color with automatic text contrast', image: await capture('GroupEditor_CustomColor/Dark', '.cg-header-editor') },
	{ label: 'Edit collection', image: await capture('CollectionEditor/Dark', '.cg-collection-editor') },
]]);

// Link preview image (1200x630), cropped from the top of the dark demo.
const og = await context.newPage();
await og.setViewportSize({ width: 1200, height: 630 });
await og.setContent(`<!DOCTYPE html><html><body style="margin:0"><img src="data:image/png;base64,${heroes.dark.toString('base64')}" style="display:block;width:1200px;height:630px;object-fit:cover;object-position:top left"></body></html>`);
await og.evaluate(() => document.images[0].decode());
await save('og.png', await og.screenshot({ scale: 'css' }));

await browser.close();
if (errors.length) {
	console.error(`errors:\n${errors.join('\n')}`);
	process.exitCode = 1;
}
