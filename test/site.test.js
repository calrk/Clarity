// The playground, driven for real.
//
// The eight pages this replaced didn't fail loudly - they rotted quietly, and
// by the time anyone looked, `navigator.getUserMedia` had been removed from
// every browser and the demo had been broken for years. A demo that nobody
// checks is a demo that is broken.
//
// So this loads the built site in headless Chrome and drives it: adds filters,
// reorders them, follows a shared link, and asserts that pixels actually
// changed. It skips cleanly when there is no browser to drive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'site', 'dist');

const TYPES = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml'
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
		const url = request.url.split('?')[0].split('#')[0];
		const path = join(dist, normalize(decodeURIComponent(url)));
		try {
			const body = await readFile(path.endsWith('/') || !extname(path) ? join(dist, 'index.html') : path);
			response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'text/html' });
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

if (!existsSync(join(dist, 'index.html'))) {
	test('playground', { skip: 'site/dist not built - run npm run site:build' }, () => {});
} else if (!puppeteer || !executablePath) {
	test('playground', { skip: 'no browser available to drive the page' }, () => {});
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
	page.on('console', (message) => {
		if (message.type() === 'error' && !message.text().includes('favicon')) {
			errors.push(message.text());
		}
	});

	const open = async (hash = '') => {
		await page.goto(`http://127.0.0.1:${port}/${hash}`, { waitUntil: 'networkidle0' });
		//the first source is decoded and drawn asynchronously
		await page.waitForFunction(() => document.getElementById('mSize').textContent !== '—');
	};

	/** The rendered canvas, as a hash, so "did the picture change" is answerable. */
	const canvasDigest = () =>
		page.evaluate(() => {
			const canvas = document.getElementById('canvas');
			const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
			let hash = 2166136261;
			for (let i = 0; i < data.length; i += 997) {
				hash = Math.imul(hash ^ data[i], 16777619);
			}
			return `${canvas.width}x${canvas.height}:${hash >>> 0}`;
		});

	const addFilter = (name) =>
		page.evaluate((wanted) => {
			const button = [...document.querySelectorAll('#palette button')].find(
				(el) => el.childNodes[0].textContent.trim() === wanted
			);
			if (!button) throw new Error(`no palette entry for ${wanted}`);
			button.click();
		}, name);

	await open();

	test('the page loads and renders its default source', async () => {
		assert.deepEqual(errors, []);
		const size = await page.$eval('#mSize', (el) => el.textContent);
		assert.match(size, /^\d+ × \d+$/, `expected a frame size, got "${size}"`);
	});

	test('the palette lists every filter in the library', async () => {
		const { shown, catalogued } = await page.evaluate(() => ({
			shown: document.querySelectorAll('#palette button').length,
			catalogued: Number(document.getElementById('paletteCount').textContent)
		}));
		assert.equal(shown, catalogued);
		assert.ok(shown >= 41, `only ${shown} filters in the palette`);
	});

	test('adding a filter changes the picture', async () => {
		const before = await canvasDigest();
		await addFilter('Invert');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);

		const after = await canvasDigest();
		assert.notEqual(after, before, 'Invert left the canvas untouched');
	});

	test('the chain runs as shaders', async () => {
		const badge = await page.$eval('#backendBadge', (el) => el.textContent);
		assert.equal(badge, 'GPU', 'expected the shader path under SwiftShader');
	});

	test('bypassing a filter restores the original picture', async () => {
		const filtered = await canvasDigest();
		await page.click('#chain li .icon-button[aria-pressed]');
		await page.waitForFunction(() => document.querySelector('#chain li').classList.contains('off'));

		const bypassed = await canvasDigest();
		assert.notEqual(bypassed, filtered);

		await page.click('#chain li .icon-button[aria-pressed]');
		await page.waitForFunction(() => !document.querySelector('#chain li').classList.contains('off'));
		assert.equal(await canvasDigest(), filtered, 'toggling back should restore the frame exactly');
	});

	test('order matters, and reordering says so', async () => {
		await open('#colours/Blur,radius=12/ValueThreshold,threshold=110');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 2);
		const blurThenThreshold = await canvasDigest();

		await open('#colours/ValueThreshold,threshold=110/Blur,radius=12');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 2);

		assert.notEqual(
			await canvasDigest(),
			blurThenThreshold,
			'swapping a blur and a threshold must not produce the same image'
		);
	});

	test('a shared link reproduces the chain it was made from', async () => {
		await open('#colours/Desaturate/Posteriser,colours=4/Mirror,vertical=true');

		const chain = await page.$$eval('#chain .stage-name', (els) => els.map((el) => el.textContent));
		assert.deepEqual(chain, ['Desaturate', 'Posteriser', 'Mirror']);

		//and the properties came back, not just the filters
		const colours = await page.evaluate(
			() => document.querySelectorAll('#chain li')[1].querySelector('.value').textContent
		);
		assert.equal(colours, '4');

		// The link the page now advertises should be the one that produced it -
		// and readable, not percent-escaped into soup. Only values that differ
		// from a filter's default appear, which is why `Mirror.horizontal` never
		// shows up: it defaults to true.
		const hash = await page.evaluate(() => decodeURIComponent(location.hash));
		assert.equal(hash, '#colours/Desaturate/Posteriser,colours=4/Mirror,vertical=true');
	});

	test('a link naming a filter that no longer exists still loads', async () => {
		await open('#colours/Desaturate/Nonexistent,foo=1/Invert');
		const chain = await page.$$eval('#chain .stage-name', (els) => els.map((el) => el.textContent));
		assert.deepEqual(chain, ['Desaturate', 'Invert'], 'unknown filters are dropped, not fatal');
	});

	test('the code panel matches the chain', async () => {
		const code = await page.$eval('#code', (el) => el.textContent);
		assert.match(code, /import \{ Renderer, Desaturate, Invert \} from '@calrk\/clarity';/);
		assert.match(code, /\.add\(new Desaturate\(\)\)/);
	});

	test('a size-changing filter resizes the canvas', async () => {
		await open('#colours');
		const before = await page.evaluate(() => document.getElementById('canvas').width);

		await addFilter('Rotator');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);
		//turns defaults to 0, so nothing should have moved yet
		assert.equal(await page.evaluate(() => document.getElementById('canvas').width), before);

		await page.evaluate(() => {
			const slider = document.querySelector('#chain li input[type="range"]');
			slider.value = 1;
			slider.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await page.waitForFunction(
			(was) => document.getElementById('canvas').width !== was,
			{},
			before
		);

		const { width, height } = await page.evaluate(() => {
			const canvas = document.getElementById('canvas');
			return { width: canvas.width, height: canvas.height };
		});
		assert.ok(height > width, `a quarter turn of a landscape frame should be portrait, got ${width}x${height}`);
	});

	test('a card is only draggable while its header is held', async () => {
		// A `draggable` element swallows pointer gestures anywhere inside it, so
		// leaving it on permanently made every slider in the panel click-only -
		// dragging one started a card drag instead. Easy to reintroduce, and
		// invisible to every other test here.
		await open('#colours/Blur');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);

		assert.equal(
			await page.$eval('#chain li', (el) => el.draggable),
			false,
			'a card at rest must not be draggable, or its controls stop working'
		);

		await page.$eval('#chain li .stage-head', (el) =>
			el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
		);
		assert.equal(await page.$eval('#chain li', (el) => el.draggable), true, 'the header still starts a drag');
	});

	test('a slider actually moves the value it is bound to', async () => {
		const radius = () => page.$eval('#chain li .value', (el) => el.textContent);

		assert.equal(await radius(), '10');
		await page.evaluate(() => {
			const slider = document.querySelector('#chain li input[type="range"]');
			slider.value = 25;
			slider.dispatchEvent(new Event('input', { bubbles: true }));
		});
		assert.equal(await radius(), '25');
	});

	test('a fractional value survives the round trip through a link', async () => {
		// Properties used to be dot-separated, and a dot is also a decimal point:
		// `Desaturate.amount=0.4` split into three pieces and became `amount=0`,
		// silently, for every float-valued property in the library
		await open('#colours/Desaturate,amount=0.4');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);

		assert.equal(await page.$eval('#chain li .value', (el) => el.textContent), '0.4');
		assert.equal(
			await page.evaluate(() => decodeURIComponent(location.hash)),
			'#colours/Desaturate,amount=0.4'
		);
	});

	test('a still image is timed over repeated runs, not one', async () => {
		// A single render of a still is dominated by shader compilation and says
		// nothing about what the chain costs, which made it worse than no number
		await page.waitForFunction(() => document.getElementById('mFrame').textContent !== '—');

		const { text, title } = await page.evaluate(() => {
			const el = document.getElementById('mFrame');
			return { text: el.textContent, title: el.title };
		});
		assert.match(text, /^\d+\.\d\d ms$/);
		assert.match(title, /Median of \d+ runs/);
	});

	test('the backend badge forces the chain onto the CPU and back', async () => {
		await open('#colours/Invert');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);
		assert.equal(await page.$eval('#backendBadge', (el) => el.textContent), 'GPU');

		await page.click('#backendBadge');
		await page.waitForFunction(() => document.getElementById('backendBadge').textContent === 'CPU');
		assert.equal(await page.$eval('#mBackend', (el) => el.textContent), 'CPU');

		await page.click('#backendBadge');
		await page.waitForFunction(() => document.getElementById('backendBadge').textContent === 'GPU');
	});

	test('a starter fills the blank source', async () => {
		// The starters ignore their input, so without something to hand them they
		// have nothing to run against at all
		await open('#blank/FillRGB,red=200,green=40,blue=90');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);

		const corner = await page.evaluate(() => {
			const canvas = document.getElementById('canvas');
			return [...canvas.getContext('2d').getImageData(4, 4, 1, 1).data];
		});
		assert.deepEqual(corner, [200, 40, 90, 255]);
	});

	test('a chosen file joins the source list for the session', async () => {
		await open('#colours');
		const before = await page.$$eval('#sources button', (els) => els.length);

		const input = await page.$('#fileInput');
		await input.uploadFile(join(here, 'fixtures', 'photo.png'));
		await page.waitForFunction((was) => document.querySelectorAll('#sources button').length > was, {}, before);

		// it is selected, and - the point of the whole thing - it is still there
		// afterwards, so you can go back to it without dropping the file again
		const { count, pressed, label } = await page.$$eval('#sources button', (els) => ({
			count: els.length,
			pressed: els.filter((el) => el.getAttribute('aria-pressed') === 'true').length,
			label: els.at(-1).textContent
		}));
		assert.equal(count, before + 1);
		assert.equal(pressed, 1);
		assert.match(label, /photo/);

		await page.evaluate(() => document.querySelector('#sources button').click());
		await page.waitForFunction(
			() => document.querySelector('#sources button').getAttribute('aria-pressed') === 'true'
		);
		assert.equal(
			await page.$$eval('#sources button', (els) => els.length),
			before + 1,
			'switching away must not drop the file from the list'
		);
	});

	test('a filter with a caveat wears it as a chip', async () => {
		// The chips exist for the failures that look like nothing happening -
		// MotionDetector on a still, DotRemover on a photograph. If they stop
		// rendering, the playground goes back to silently doing nothing.
		const chips = await page.evaluate(() => {
			const read = (wanted) => {
				const button = [...document.querySelectorAll('#palette button')].find(
					(el) => el.childNodes[0].textContent.trim() === wanted
				);
				return [...button.querySelectorAll('.chip')].map((chip) => ({
					text: chip.textContent,
					title: chip.title
				}));
			};
			return {
				motion: read('MotionDetector'),
				dots: read('DotRemover'),
				blend: read('Blend'),
				// the ordinary case carries nothing, or the chips mean nothing
				blur: read('Blur')
			};
		});

		assert.equal(chips.motion.length, 1);
		assert.match(chips.motion[0].text, /motion/i);
		assert.ok(chips.motion[0].title.length > 20, 'the chip explains itself on hover');
		assert.match(chips.dots[0].text, /black & white/i);
		assert.match(chips.blend[0].text, /two inputs/i);
		assert.deepEqual(chips.blur, []);
	});

	test('the second-input picker still appears, now that it comes from the traits', async () => {
		// `isDualInput` used to be a hardcoded Set in the playground and is now
		// a catalogue lookup, so a mistake there would quietly leave two-input
		// filters with no way to choose their second frame.
		await page.evaluate(() => document.getElementById('clearChain')?.click());
		await addFilter('Blend');
		const selects = await page.$$eval('#chain select', (els) => els.length);
		assert.ok(selects >= 1, 'Blend should offer somewhere to get its second frame');

		await addFilter('Blur');
		assert.equal(
			await page.$$eval('#chain select', (els) => els.length),
			selects,
			'a one-input filter must not gain a second-input picker'
		);
	});

	test('nothing threw along the way', async () => {
		assert.deepEqual(errors, []);
		await browser.close();
		server.close();
	});
}
