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
	'.svg': 'image/svg+xml',
	'.mp4': 'video/mp4'
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

		// A URL differing only in the hash is a *same-document* navigation, so
		// `goto` does not reload - it fires `hashchange`, and the previous source
		// can still be rendering when the two waits above are already satisfied by
		// the old page's readout. Waiting for the source picker to agree is what
		// makes `open('#x')` mean "the page is showing x". Without it, switching
		// from a video to a still occasionally measured the tail of the video.
		const wanted = hash.replace(/^#/, '').split('/')[0];
		await page.waitForFunction((id) => {
			const buttons = document.querySelectorAll('#sources button');
			const expected = id || buttons[0]?.dataset.id;
			return document.querySelector('#sources button[aria-pressed="true"]')?.dataset.id === expected;
		}, {}, wanted);
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

	test('a preset replaces the chain, the source and the URL', async () => {
		// Presets are one assignment to `location.hash`, which means the thing
		// being tested is really that the hashchange path handles a wholesale
		// swap - chain, source and share link together - rather than the button.
		await open('#colours/Invert');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);

		await page.click('#presets button[data-preset="crt"]');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 3);

		assert.equal(
			await page.$eval('#sources button[aria-pressed="true"]', (el) => el.dataset.id),
			'landscape',
			'a preset brings its own source, or half of them show nothing'
		);

		const hash = await page.evaluate(() => location.hash);
		assert.match(hash, /^#landscape\/FishEye/, `the URL should be the preset, got "${hash}"`);
		assert.deepEqual(
			await page.$$eval('#chain li .stage-name', (els) => els.map((el) => el.textContent)),
			['FishEye', 'HanoverBars', 'Vignette']
		);

		// Assigning to location.hash pushes history, so back is a free undo - which
		// is why replacing the user's chain needs no confirmation step.
		await page.goBack();
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);
		assert.match(await page.evaluate(() => location.hash), /^#colours\/Invert/);

		// The tests below share this page and start from an empty chain, the way
		// the `open()` above the suite left it. Hand it back in that state.
		await open();
	});

	test('a long pipeline scrolls instead of squashing its cards', async () => {
		// `.chain` is a flex column, and a flex item shrinks by default - so a
		// chain taller than the rail compressed every card rather than scrolling,
		// down to a 22px sliver with the controls clipped out of view. `overflow-y`
		// never engaged, because the content had been squashed to fit.
		//
		// The invariant is that a card is the same height however many are beside
		// it, which is what makes the container overflow and therefore scroll.
		//
		// Needs the three-column layout: below 1100px the rails go static with no
		// max-height, so there is deliberately nothing to scroll.
		const viewport = page.viewport();
		await page.setViewport({ width: 1400, height: 800 });

		await open('#colours/ChromaticAberration,xdistance=12');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);
		const alone = await page.$eval('#chain li', (el) => el.getBoundingClientRect().height);

		await open(
			'#colours/ChromaticAberration,xdistance=12/Blur,radius=8/Bleed,radius=20' +
				'/Posteriser,colours=6/Vignette/HanoverBars,mode=scanlines/Wave,amplitude=6/Noise,intensity=8'
		);
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 8);

		const crowded = await page.$eval('#chain li', (el) => el.getBoundingClientRect().height);
		assert.equal(crowded, alone, 'the first card changed height when seven more joined it');

		const { scrollHeight, clientHeight } = await page.$eval('#chain', (el) => ({
			scrollHeight: el.scrollHeight,
			clientHeight: el.clientHeight
		}));
		assert.ok(
			scrollHeight > clientHeight,
			`the chain should overflow and scroll, got ${scrollHeight} in ${clientHeight}`
		);

		if (viewport) await page.setViewport(viewport);
		await open();
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
		//`colours` is 1280x1024, so a quarter turn has to change the canvas shape.
		//Deliberately not the default source, which is square.
		await open('#colours');
		const before = await page.evaluate(() => document.getElementById('canvas').width);

		//Rotator turns once by default - it used to default to no turns at all,
		//which made adding it do nothing
		await addFilter('Rotator');
		await page.waitForFunction(
			(was) => document.getElementById('canvas').width !== was,
			{},
			before
		);

		const turned = await page.evaluate(() => {
			const canvas = document.getElementById('canvas');
			return { width: canvas.width, height: canvas.height };
		});
		assert.ok(
			turned.height > turned.width,
			`a quarter turn of a landscape frame should be portrait, got ${turned.width}x${turned.height}`
		);

		//and back: two turns is 180 degrees, so the shape returns to the original
		await page.evaluate(() => {
			const slider = document.querySelector('#chain li input[type="range"]');
			slider.value = 2;
			slider.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await page.waitForFunction((was) => document.getElementById('canvas').width === was, {}, before);
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

	test('a filter that moves keeps moving on a still image', async () => {
		// The loop used to ask only the *source* whether anything would change, so
		// every filter that animates itself was frozen on a photograph - a wave
		// that never waved, clouds that never drifted, and a colour cycle that did
		// nothing at all, which is most of the point of having one.
		//
		// This also retired a test. The timing burst used to end with another
		// `render()`, which for a filter with a random or time-varying element drew
		// a different picture and read as the image glitching. Those are exactly
		// the filters that now run a loop instead of being measured, and the ones
		// still measured are pure, so a redraw of them is invisible by definition.
		await open('#colours/Wave,amplitude=20');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);

		const before = await canvasDigest();
		let moved = false;
		const deadline = Date.now() + 4000;
		while (Date.now() < deadline && !moved) {
			await new Promise((resolve) => setTimeout(resolve, 120));
			moved = (await canvasDigest()) !== before;
		}
		assert.ok(moved, 'a varying filter on a still source never redrew');

		// and the control: an ordinary chain must not spin the loop up for nothing
		await open('#colours/Desaturate');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);
		const still = await canvasDigest();
		await new Promise((resolve) => setTimeout(resolve, 1200));
		assert.equal(await canvasDigest(), still, 'a pure chain on a still should settle and stop');

		await open();
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
		// MotionDetector on a still, NormalIntensity on a photograph. If they stop
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
				normals: read('NormalIntensity'),
				blend: read('Blend'),
				// the ordinary case carries nothing, or the chips mean nothing
				blur: read('Blur')
			};
		});

		assert.equal(chips.motion.length, 1);
		assert.match(chips.motion[0].text, /motion/i);
		assert.ok(chips.motion[0].title.length > 20, 'the chip explains itself on hover');
		assert.match(chips.normals[0].text, /normal map/i);
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

	test('the bundled videos play, and the still sources do not', async () => {
		// Until these were added the only moving source was the webcam, so every
		// temporal filter - MotionDetector, Ghoster, ScreenBurn, ShotDetector -
		// demanded a permission prompt before it would show anything at all.
		//
		// The risk is not the wiring but the browser: autoplay policy and codec
		// support, neither of which a unit test can see. The video element never
		// enters the DOM either, so the only honest observable is the canvas.
		// Polled rather than a single wait: the whole suite runs its browsers at
		// once, so a fixed sleep is a flake waiting to happen on a loaded machine.
		// The moving case returns the moment it moves; the still case has to sit
		// out the full window to prove it never does.
		// `open` resolves as soon as a frame size appears, which on a loaded
		// machine can be before the source has finished being decoded and drawn at
		// its real size. Waiting for two readings in a row to agree means the
		// still-image control is measuring a settled picture rather than the tail
		// of the page starting up - which it once read as movement.
		const settledDigest = async () => {
			let previous = await canvasDigest();
			const deadline = Date.now() + 4000;
			while (Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 100));
				const current = await canvasDigest();
				if (current === previous) return current;
				previous = current;
			}
			return previous;
		};

		// Only the still control settles first: a playing video never gives two
		// readings in a row that agree, so it would just burn the whole window.
		const movesWithin = async (id, ms, settle = false) => {
			await open('#' + id);
			const before = settle ? await settledDigest() : await canvasDigest();
			const deadline = Date.now() + ms;
			while (Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 120));
				if ((await canvasDigest()) !== before) return true;
			}
			return false;
		};

		// Enumerated from the page rather than named here, so a video added to
		// SOURCES later cannot quietly skip this check.
		const videos = await page.$$eval('#sources button[data-kind="video"]', (buttons) =>
			buttons.map((button) => button.dataset.id)
		);
		assert.ok(videos.length >= 3, 'the bundled videos should be in the source list');

		for (const id of videos) {
			assert.equal(await movesWithin(id, 6000), true, `the ${id} video should be playing`);
		}

		// and the control: a still source must not be spuriously 'moving', or the
		// assertions above would pass on a source that never decoded
		assert.equal(await movesWithin('face', 1800, true), false, 'a still image should not change');
	});
	test('nothing threw along the way', async () => {
		assert.deepEqual(errors, []);
		await browser.close();
		server.close();
	});
}
