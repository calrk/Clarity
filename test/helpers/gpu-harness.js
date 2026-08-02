// Runs the GPU parity comparison in a real browser.
//
// Node has no WebGL2, and headless-gl only implements WebGL 1 - so the choice
// was between writing the shaders against a decade-old GLSL dialect or driving
// a real browser. Chrome with SwiftShader gives a genuine WebGL2 implementation
// on the CPU, so this runs anywhere without a GPU, CI included.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { readPNG } from './image.js';
import { FIXTURES } from './run.js';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const TYPES = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.png': 'image/png',
	'.map': 'application/json'
};

/** Static server over the repo, so the page can fetch dist/ and the fixtures. */
async function serve() {
	const server = createServer(async (request, response) => {
		try {
			//the browser asks for this unprompted, and a 404 would show up as a
			//console error the test then reports as a failure
			if (request.url === '/favicon.ico') {
				response.writeHead(204).end();
				return;
			}
			const path = join(root, normalize(decodeURIComponent(request.url.split('?')[0])));
			if (!path.startsWith(root)) {
				response.writeHead(403).end();
				return;
			}
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

function findChrome() {
	const candidates = [
		process.env.CHROME_PATH,
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
	].filter(Boolean);

	return candidates.find((path) => existsSync(path));
}

/**
 * Opens the harness page and hands back a `run(entry)` plus a `close()`.
 * Returns null when there is no browser to drive, so callers skip rather than
 * fail - the CPU path is the one that must always work.
 */
export async function openHarness() {
	let puppeteer;
	try {
		puppeteer = await import('puppeteer-core');
	} catch {
		return null;
	}

	const executablePath = findChrome();
	if (!executablePath) {
		return null;
	}

	const { server, port } = await serve();

	let browser;
	try {
		browser = await puppeteer.default.launch({
			executablePath,
			headless: true,
			args: [
				//SwiftShader is a software WebGL2 implementation, so this works on a
				//machine with no GPU and inside CI
				'--use-gl=angle',
				'--use-angle=swiftshader',
				'--enable-unsafe-swiftshader',
				'--no-sandbox',
				'--disable-dev-shm-usage'
			]
		});
	} catch (error) {
		server.close();
		throw error;
	}

	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		//the browser asks for a favicon nobody serves; not interesting
		if (message.type() === 'error' && !message.text().includes('favicon')) {
			errors.push(message.text());
		}
	});

	await page.goto(`http://127.0.0.1:${port}/test/gpu/index.html`, { waitUntil: 'networkidle0' });

	//Fixtures go in as raw RGBA rather than being fetched and decoded in the
	//page, so both sides of the comparison start from byte-identical input. See
	//the note on installFixtures for why a canvas cannot be in that path.
	const raw = {};
	for (const file of readdirSync(FIXTURES)) {
		if (!file.endsWith('.png')) continue;
		const frame = readPNG(join(FIXTURES, file));
		raw[file.replace(/\.png$/, '')] = {
			width: frame.width,
			height: frame.height,
			data: Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.length).toString('base64')
		};
	}
	await page.evaluate((data) => window.installFixtures(data), raw);

	const available = await page.evaluate(() => window.gpuAvailable?.() ?? false);

	return {
		available,
		errors,
		page,
		run: (entry) => page.evaluate((e) => window.runCase(e), entry),
		renderGPU: (entry) => page.evaluate((e) => window.renderGPU(e), entry),
		historyResets: () => page.evaluate(() => window.historyResets()),
		async close() {
			await browser.close();
			server.close();
		}
	};
}
