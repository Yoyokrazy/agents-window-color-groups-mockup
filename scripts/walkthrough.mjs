/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Drives the interactive color groups mockup end to end and checks it along the way.
//
//   node scripts/walkthrough.mjs <outDir> [--base <url>] [--theme Dark|Light2026] [--video] [--no-theme-switch]
//
// --base is either the site root (ending in `/`, e.g. the GitHub Pages URL or a local
// `python3 -m http.server`), which is opened through the index.html landing page, or a
// Component Explorer page (default: the vscode dev server, http://localhost:5123/___explorer).
// Playwright is loaded from the vscode checkout (VSCODE_DIR).

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const vscodeDir = process.env['VSCODE_DIR'] ?? path.join(os.homedir(), '.copilot/repos/vscode.worktrees/agents-window-color-grouping-mockup');
const { chromium } = createRequire(path.join(vscodeDir, 'package.json'))('playwright');

const arg = (name, fallback) => {
	const index = process.argv.indexOf(name);
	return index > 0 ? process.argv[index + 1] : fallback;
};
const outDir = process.argv[2];
if (!outDir || outDir.startsWith('--')) {
	console.error('usage: node scripts/walkthrough.mjs <outDir> [--base <url>] [--theme Dark|Light2026] [--video] [--no-theme-switch]');
	process.exit(2);
}
const video = process.argv.includes('--video');
const themeSwitch = !process.argv.includes('--no-theme-switch');
const theme = arg('--theme', 'Dark');
const base = arg('--base', 'http://localhost:5123/___explorer');
fs.mkdirSync(outDir, { recursive: true });

const FIXTURE_PREFIX = 'sessions/colorGroupsMockup/Interactive/';
const isSiteRoot = base.endsWith('/');
const url = isSiteRoot
	? `${base}${theme === 'Dark' ? '' : `?theme=${theme === 'Light2026' ? 'light' : 'hc'}`}`
	: `${base}?mode=embedded&fixture=${encodeURIComponent(FIXTURE_PREFIX + theme)}`;
const viewport = { width: 1440, height: 900 };
const browser = await chromium.launch();
const context = await browser.newContext({
	viewport,
	deviceScaleFactor: video ? 1 : 2,
	recordVideo: video ? { dir: outDir, size: viewport } : undefined,
});
const page = await context.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') { errors.push(m.text().slice(0, 400)); } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', r => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ''}`));
page.on('response', r => { if (r.status() >= 400) { errors.push(`[${r.status()}] ${r.url()}`); } });

// Visible cursor and captions for the recording (Playwright videos have no pointer).
if (video) {
	await context.addInitScript(() => {
		window.addEventListener('DOMContentLoaded', () => {
			const cursor = document.createElement('div');
			cursor.id = 'pw-cursor';
			cursor.style.cssText = 'position:fixed;z-index:999999;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,255,255,0.35);border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 0 1px rgba(0,0,0,0.5);pointer-events:none;transition:transform 90ms ease-out;';
			document.body.appendChild(cursor);
			const caption = document.createElement('div');
			caption.id = 'pw-caption';
			caption.style.cssText = 'position:fixed;z-index:999998;left:50%;bottom:28px;transform:translateX(-50%);max-width:70%;padding:10px 18px;border-radius:10px;background:rgba(10,10,12,0.88);color:#fff;font:600 16px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.45);pointer-events:none;opacity:0;transition:opacity 200ms;text-align:center;';
			document.body.appendChild(caption);
			const position = (x, y) => { cursor.style.left = `${x}px`; cursor.style.top = `${y}px`; };
			try {
				const saved = JSON.parse(sessionStorage.getItem('pw-cursor') ?? 'null');
				if (saved) {
					position(saved.x, saved.y);
				}
			} catch { }
			document.addEventListener('mousemove', e => { position(e.clientX, e.clientY); sessionStorage.setItem('pw-cursor', JSON.stringify({ x: e.clientX, y: e.clientY })); }, true);
			document.addEventListener('mousedown', () => cursor.style.transform = 'scale(0.7)', true);
			document.addEventListener('mouseup', () => cursor.style.transform = '', true);
			document.addEventListener('dragover', e => position(e.clientX, e.clientY), true);
		});
	});
}

const pause = ms => page.waitForTimeout(video ? ms : Math.min(ms, 250));
const caption = async text => {
	if (video) {
		await page.evaluate(t => { const c = document.getElementById('pw-caption'); c.textContent = t; c.style.opacity = t ? '1' : '0'; }, text);
		await pause(900);
	}
};
let shot = 0;
const snap = async name => {
	if (!video) {
		await page.screenshot({ path: path.join(outDir, `${String(++shot).padStart(2, '0')}-${name}.png`) });
	}
};
const check = (condition, message) => {
	if (!condition) {
		throw new Error(`Check failed: ${message}`);
	}
	console.log(`ok - ${message}`);
};
const move = async locator => {
	const box = await locator.boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: video ? 18 : 2 });
};
const click = async locator => {
	await move(locator);
	await pause(250);
	await locator.click();
};
const row = text => page.locator('.monaco-list-row', { hasText: text }).first();
const menuItem = name => page.locator('.monaco-menu .action-menu-item').filter({ has: page.locator('.action-label', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).first();
const headerTitle = () => page.locator('.cg-header-title-label').textContent();
const crumbTitle = () => page.locator('.cg-crumb-title').textContent();
const currentFixture = () => new URL(page.url()).searchParams.get('fixture');
const styleRadio = { Rail: 'Browser-style pill with a colored rail', Outline: 'Solid header, colored outline around the sessions', Tint: 'Pill inside a softly tinted card', Dot: 'Quiet: colored dot and thin rail' };
const isChecked = async name => (await page.getByRole('radio', { name, exact: true }).getAttribute('aria-checked')) === 'true';

/** Relative luminance of the themed sidebar background, 0 (black) to 1 (white). */
const themeLuminance = () => page.locator('.cg-window').evaluate(el => {
	const probe = el.ownerDocument.createElement('div');
	probe.style.color = getComputedStyle(el).getPropertyValue('--vscode-sideBar-background').trim();
	el.appendChild(probe);
	const [r, g, b] = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number).map(c => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	probe.remove();
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
});

const waitForDemo = async () => {
	await page.locator('.cg-window').waitFor();
	await page.locator('.cg-transcript').waitFor();
	await page.evaluate(() => document.fonts.ready);
};

await page.goto(url, { waitUntil: 'networkidle' });
await waitForDemo();
await pause(1200);

// 0. Loads from a static host
check(currentFixture() === FIXTURE_PREFIX + theme, `opens the ${FIXTURE_PREFIX + theme} fixture${isSiteRoot ? ' from the landing page' : ''}`);
const codicon = await page.evaluate(() => [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'codicon').map(f => f.status));
check(codicon.includes('loaded'), `the codicon font loads (${codicon.join(', ') || 'no codicon font face'})`);
const luminance = await themeLuminance();
check(theme.startsWith('Light') ? luminance > 0.5 : luminance < 0.1, `the ${theme} theme colors apply (sidebar luminance ${luminance.toFixed(2)})`);

// 1. Starting point
await caption('Sessions grouped into colored groups, like browser tab groups');
check(await headerTitle() === 'Engineering', 'starts in the Engineering collection');
check(await isChecked(styleRadio.Rail), 'Rail is the default group style');
check(await page.locator('.cg-bubble-agent').count() > 0, 'selected session shows a lorem ipsum transcript');
await snap('start');
await pause(1500);

// 2. Collapse and expand a group
await caption('Collapsed groups are compact color pills with a count and status');
const iteration = page.locator('.cg-group-row', { hasText: 'Iteration Plan' }).locator('.cg-group-header');
await click(iteration);
await pause(900);
check(await page.locator('.cg-group-row:not(.collapsed)', { hasText: 'Iteration Plan' }).count() === 1, 'clicking a collapsed pill expands the group');
await click(iteration);
await pause(600);

// 3. Switch collections
await caption('Collections: switch between Engineering, Personal, and Misc, like browser workspaces');
await click(page.locator('.cg-strip-button[data-collection-id="personal"]'));
await pause(1200);
check(await headerTitle() === 'Personal', 'title bar switcher opens Personal');
check(await row('after hackathon').count() === 1, 'Personal shows its own groups');
await snap('personal');

// 4. New session with workspace and group
await caption('New session: pick the workspace and group, then describe the task');
await click(page.locator('.cg-new-button'));
await pause(600);
check(await page.locator('.cg-new-session').count() === 1, 'New opens the composer');
await click(page.locator('.cg-target-chip').nth(0));
await pause(500);
await click(menuItem('netmon'));
await pause(400);
await click(page.locator('.cg-target-chip').nth(1));
await pause(500);
await click(menuItem('after hackathon'));
await pause(400);
check((await page.locator('.cg-target-chip').nth(1).textContent()).includes('after hackathon'), 'group picker shows the chosen group');
const input = page.locator('.cg-chat-input textarea');
await input.click();
await input.pressSequentially('Add a latency heatmap to the device page', { delay: video ? 45 : 0 });
await snap('composer');
await pause(400);
await input.press('Enter');
await pause(300);
check(await row('Add a latency heatmap to the device page').count() === 1, 'the new session appears in the list');
const newRow = page.locator('.cg-group-row', { hasText: 'after hackathon' });
check(await newRow.count() === 1, 'the after hackathon group is still expanded');
check(await page.locator('.cg-bubble-progress').count() === 1, 'the new session shows agent progress');
await caption('Sessions stay inside their colored group');
await snap('new-session-working');
await page.locator('.cg-bubble-agent').first().waitFor({ timeout: 5000 });
await pause(800);
check(await page.locator('.cg-bubble-progress').count() === 0, 'the pretend agent replies with lorem ipsum');

// 5. Follow-up
await input.click();
await input.pressSequentially('Also add a legend', { delay: video ? 45 : 0 });
await input.press('Enter');
await pause(400);
check(await page.locator('.cg-bubble-user').count() === 2, 'follow-ups append to the transcript');
await page.waitForFunction(() => document.querySelectorAll('.cg-bubble-agent').length === 2, undefined, { timeout: 5000 });
await snap('follow-up');
await pause(600);

// 6. Switch back: the collection remembers its session
await caption('Each collection remembers what you had open');
await page.keyboard.press('Control+1');
await pause(1000);
check(await headerTitle() === 'Engineering', 'Ctrl+1 switches to Engineering');
check((await crumbTitle()).includes('1.140.0 Endgame'), 'Engineering restores its open session');

// 7. Edit a group: color, custom color, auto text contrast
await caption('Edit a group: rename, pick a color, or a custom color. Text stays readable.');
const endgame = page.locator('.cg-group-row', { hasText: 'endgame' });
await move(endgame.locator('.cg-group-header'));
await pause(400);
await click(endgame.locator('.cg-group-toolbar .action-label[aria-label="Edit Group…"]'));
await page.locator('.cg-header-editor').waitFor();
await pause(700);
await click(page.locator('.cg-header-editor .cg-swatch[aria-label="Blue"]'));
await pause(700);
check(await page.locator('.cg-header-editor .cg-editor-custom.visible').count() === 0, 'the custom picker is collapsed by default');
await click(page.locator('.cg-header-editor .cg-swatch-custom'));
await pause(500);
check(await page.locator('.cg-header-editor .cg-editor-custom.visible').count() === 1, 'the custom color swatch expands the custom picker');
const saturation = page.locator('.cg-header-editor .saturation-box');
const box = await saturation.boundingBox();
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3, { steps: video ? 12 : 2 });
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.72, { steps: video ? 30 : 4 });
await page.mouse.up();
await pause(600);
const fill = await endgame.evaluate(el => getComputedStyle(el).getPropertyValue('--cg-fill').trim());
check(/^#[0-9a-f]{6}$/i.test(fill), `dragging in the picker sets a custom group color (${fill})`);
const text = await endgame.evaluate(el => getComputedStyle(el).getPropertyValue('--cg-text').trim());
check(text === '#ffffff', 'a dark custom color switches the group text to light');
await snap('custom-color');
await pause(1000);
await page.keyboard.press('Escape');
await pause(500);
check(await page.locator('.cg-header-editor:visible').count() === 0, 'Escape closes the editor');

// 8. Drag a session onto another collection
await caption('Drag a session onto a collection to move it there');
const dragSource = row('VS Code team label');
const draggedTitle = 'VS Code team label';
await dragSource.scrollIntoViewIfNeeded();
await move(dragSource);
await dragSource.dragTo(page.locator('.cg-strip-button[data-collection-id="misc"]'), { steps: video ? 24 : 6 });
await pause(800);
check(await row(draggedTitle).count() === 0, `"${draggedTitle}" left Engineering`);
check((await page.locator('.cg-toast-message').textContent()).startsWith('Moved'), 'an undo toast confirms the move');

// 9. Undo
await caption('Every change can be undone');
await click(page.locator('.cg-toast .cg-toast-undo'));
await pause(700);
check(await row(draggedTitle).count() === 1, 'Undo brings the session back');

// 10. Group sessions from the context menu
await caption('Right-click to group sessions, move them, or mark them done');
const target = row('release branch builds');
await target.scrollIntoViewIfNeeded();
await move(target);
await target.click({ button: 'right' });
await pause(600);
await menuItem('Add to Group').hover();
await pause(600);
await click(menuItem('New Group'));
await page.locator('.cg-header-editor').waitFor();
await pause(500);
await page.keyboard.press('ControlOrMeta+A');
await page.keyboard.type('pipeline health', { delay: video ? 55 : 0 });
await pause(300);
await click(page.locator('.cg-header-editor .cg-swatch[aria-label="Red"]'));
await pause(700);
await page.keyboard.press('Escape');
await pause(500);
check(await page.locator('.cg-group-row', { hasText: 'pipeline health' }).count() === 1, 'a new group is created around the session');
await snap('new-group');

// 11. Style treatments
await caption('Try other treatments: Outline, Tint, Dot, and compact density');
for (const style of ['Outline', 'Tint', 'Dot', 'Rail']) {
	await click(page.getByRole('radio', { name: styleRadio[style], exact: true }));
	await pause(900);
}
await click(page.getByRole('radio', { name: 'Single-line session rows' }));
await pause(1200);
await snap('compact');
await click(page.getByRole('radio', { name: 'Two-line session rows' }));
await pause(800);

// 12. Theme switch reloads the other theme variant and keeps the demo state
if (themeSwitch && theme !== 'DarkHighContrast') {
	await caption('Switch themes: the demo keeps its state');
	await click(page.getByRole('radio', { name: styleRadio.Outline, exact: true }));
	await pause(600);
	const before = { header: await headerTitle(), crumb: await crumbTitle(), fill };
	const other = theme === 'Dark' ? 'Light2026' : 'Dark';
	const tooltip = name => name === 'Dark' ? 'Dark 2026 theme' : 'Light 2026 theme';
	for (const name of [other, theme]) {
		await click(page.getByRole('radio', { name: tooltip(name), exact: true }));
		await page.waitForURL(u => new URL(u).searchParams.get('fixture') === FIXTURE_PREFIX + name);
		await waitForDemo();
		await pause(1500);
		check(currentFixture() === FIXTURE_PREFIX + name, `the theme switch loads ${name}`);
		const lum = await themeLuminance();
		check(name.startsWith('Light') ? lum > 0.5 : lum < 0.1, `${name} colors apply (sidebar luminance ${lum.toFixed(2)})`);
		check(await isChecked(tooltip(name)), `the ${name} theme radio is selected`);
		check(await headerTitle() === before.header && await crumbTitle() === before.crumb, `${name} keeps the collection and open session`);
		check(await isChecked(styleRadio.Outline), `${name} keeps the Outline group style`);
		check(await page.locator('.cg-group-row', { hasText: 'pipeline health' }).count() === 1, `${name} keeps the new group`);
		check(await endgame.evaluate(el => getComputedStyle(el).getPropertyValue('--cg-fill').trim()) === before.fill, `${name} keeps the custom group color`);
		await snap(`theme-${name}`);
	}
	await click(page.locator('.cg-strip-button[data-collection-id="personal"]'));
	await pause(800);
	check(await row('Add a latency heatmap to the device page').count() === 1, 'the new Personal session survives the theme switches');
	await click(page.locator('.cg-strip-button[data-collection-id="engineering"]'));
	await pause(600);
	await click(page.getByRole('radio', { name: styleRadio.Rail, exact: true }));
	await pause(800);
}
await caption('');
await pause(800);

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors or failed requests');
await context.close();
await browser.close();
if (errors.length) {
	process.exitCode = 1;
}
