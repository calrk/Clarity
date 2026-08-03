// The `<img>` action, driven in a real browser.
//
// It is the one part of the library that touches the DOM, so it is the one
// part that cannot be tested against an ImageData in Node. The interesting
// assertions are not "does it filter" - that is covered forty times over
// elsewhere - but the lifecycle: that the original survives, that reverting
// works, that a second call re-runs from the original rather than compounding,
// and that a failure leaves the element showing something.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const TYPES = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.png': 'image/png',
	'.map': 'application/json'
};

function findChrome() {
	return [
		process.env.CHROME_PATH,
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
	]
		.filter(Boolean)
		.find((path) => existsSync(path));
}

async function serve() {
	const server = createServer(async (request, response) => {
		const path = join(root, normalize(decodeURIComponent(request.url.split('?')[0])));
		try {
			const body = await readFile(path);
			response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'text/plain' });
			response.end(body);
		} catch {
			response.writeHead(404).end();
		}
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	return { server, port: server.address().port };
}

const executablePath = findChrome();
let puppeteer;
try {
	puppeteer = (await import('puppeteer-core')).default;
} catch {
	puppeteer = null;
}

if (!existsSync(join(root, 'dist', 'svelte.js'))) {
	test('img action', { skip: 'dist/svelte.js not built - run npm run build' }, () => {});
} else if (!puppeteer || !executablePath) {
	test('img action', { skip: 'no browser available to drive the page' }, () => {});
} else {
	const { server, port } = await serve();
	const browser = await puppeteer.launch({
		executablePath,
		headless: true,
		args: [
			'--use-gl=angle',
			'--use-angle=swiftshader',
			'--enable-unsafe-swiftshader',
			'--no-sandbox',
			'--disable-dev-shm-usage'
		]
	});

	const errors = [];
	const page = await browser.newPage();
	page.on('pageerror', (error) => errors.push(String(error)));

	const open = async () => {
		await page.goto(`http://127.0.0.1:${port}/test/action/index.html`, { waitUntil: 'networkidle0' });
		await page.waitForFunction(() => document.body.dataset.ready === 'true');
	};

	const call = (method, ...args) =>
		page.evaluate((name, rest) => window.harness[name](...rest), method, args);

	await open();
	const untouched = await call('original');

	test('the action filters the image and keeps the original', async () => {
		const after = await call('apply', 'Invert');

		assert.match(after.src, /^blob:/, 'a blob URL, not a data URL bloating the DOM');
		assert.match(after.source, /photo\.png$/, 'the original path is kept on the element');
		assert.notDeepEqual(after.pixels, untouched);

		//Invert is checkable by eye: every channel should be 255 minus the input
		for (let i = 0; i < 12; i++) {
			if ((i + 1) % 4 === 0) continue;	//alpha
			assert.equal(after.pixels[i], 255 - untouched[i], `channel ${i} was not inverted`);
		}
	});

	test('updating re-runs from the original, not from the last result', async () => {
		// the trap: filtering the *filtered* image would double-invert back to
		// where it started, and would look like nothing had happened
		const after = await call('update', 'Invert');
		for (let i = 0; i < 12; i++) {
			if ((i + 1) % 4 === 0) continue;
			assert.equal(after.pixels[i], 255 - untouched[i], 'a second Invert compounded');
		}
	});

	test('a chain with properties comes through the attribute format', async () => {
		const after = await call('update', 'Desaturate,amount=1');
		const [r, g, b] = after.pixels;
		assert.equal(r, g, 'desaturated pixels have equal channels');
		assert.equal(g, b);
	});

	test('an empty chain restores the original', async () => {
		const after = await call('update', '');
		assert.deepEqual(after.pixels, untouched);
		assert.match(after.src, /photo\.png$/, 'back to the real path, not a blob');
	});

	test('destroy puts the element back exactly as it was', async () => {
		await call('update', 'Invert');
		const after = await call('destroy');

		assert.deepEqual(after.pixels, untouched);
		assert.match(after.src, /photo\.png$/);
		assert.equal(after.source, undefined, 'the bookkeeping attribute is cleaned up too');
	});

	test('an unknown filter is skipped rather than fatal', async () => {
		// the text usually comes from a template or a URL written against some
		// other version of the library
		const after = await call('apply', 'Nonexistent/Invert');
		for (let i = 0; i < 12; i++) {
			if ((i + 1) % 4 === 0) continue;
			assert.equal(after.pixels[i], 255 - untouched[i], 'the rest of the chain should still run');
		}
		await call('destroy');
	});

	test('a broken image reports rather than throws', async () => {
		await page.evaluate(() => {
			document.getElementById('subject').dataset.claritySource = '/nope/missing.png';
		});
		const { reported } = await call('applyExpectingFailure', { chain: 'Invert' });

		assert.match(reported, /could not load/);
		assert.deepEqual(errors, [], 'a failure must not become an unhandled rejection');
	});

	test('nothing threw along the way', async () => {
		assert.deepEqual(errors, []);
		await call('dispose');
		await browser.close();
		server.close();
	});
}
