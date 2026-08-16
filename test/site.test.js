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

import { SNIPPETS } from '../site/src/snippets.js';

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
		//`@640x480` on the source segment is a size, not part of the id - the same
		//split `readHash` does, and the reason this needs it is that the wait below
		//compares against `data-id`
		const wanted = hash.replace(/^#/, '').split('/')[0].split('@')[0];
		await page.waitForFunction((id) => {
			const buttons = document.querySelectorAll('#sources button.source');
			const expected = id || buttons[0]?.dataset.id;
			return document.querySelector('#sources button[aria-pressed="true"]')?.dataset.id === expected;
		}, {}, wanted);

		// And back to the Build tab. A hash-only change is a same-document
		// navigation - the reason for the wait above - so nothing reloads and the
		// panel mode survives `open` too. Every test below this line assumes the
		// built chain is the one on screen, and leaving that to depend on whatever
		// ran before is how one of them ended up capturing a snippet's output as
		// its reference for the built chain.
		if ((await page.$eval('body', (el) => el.dataset.mode)) !== 'build') {
			await page.click('#modeBuild');
			await page.waitForFunction(() => document.body.dataset.mode === 'build');
		}
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

	test('reshuffling writes the seed into the link', async () => {
		// A filter with no seed set picks one when it is built, which is what stops
		// a cloud flickering - but it also means a shared link builds its own
		// filters and opens on a *different* cloud. Rolling writes the number down.
		await open('#blank/Cloud');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);

		assert.equal(await page.$eval('#rerollButton', (el) => el.hidden), false);
		assert.equal(await page.evaluate(() => decodeURIComponent(location.hash)), '#blank/Cloud');

		const before = await canvasDigest();
		await page.click('#rerollButton');
		await page.waitForFunction(() => location.hash.includes('seed='));

		assert.notEqual(await canvasDigest(), before, 'reshuffling drew the same cloud');

		// and the point of writing it down: reopening that exact link reproduces it
		const link = await page.evaluate(() => decodeURIComponent(location.hash));
		const rolled = await canvasDigest();
		await open('#colours');
		await open(link);
		assert.equal(await canvasDigest(), rolled, 'the seeded link did not reproduce');

		await open();
	});

	test('the reshuffle button hides when there is nothing to roll', async () => {
		await open('#colours/Blur');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);
		assert.equal(await page.$eval('#rerollButton', (el) => el.hidden), true);
		assert.equal(await page.$$eval('#chain [data-roll]', (els) => els.length), 0);

		await open('#colours/Noise');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);
		assert.equal(await page.$eval('#rerollButton', (el) => el.hidden), false);
		assert.equal(await page.$$eval('#chain [data-roll]', (els) => els.length), 1, 'no per-card roll');

		await open();
	});

	test('the preset row folds, and unfolds', async () => {
		const chips = () => page.$$eval('#presets button.preset:not(.preset-more)', (els) => els.length);

		const folded = await chips();
		assert.ok(folded < 9, `the whole list is showing: ${folded} chips`);

		await page.click('#presetsMore');
		const opened = await chips();
		assert.ok(opened > folded, `expanding showed nothing new: ${folded} then ${opened}`);

		await page.click('#presetsMore');
		assert.equal(await chips(), folded, 'it did not fold back up');
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
		await open('#blank/Fill,colour=c8285a');
		await page.waitForFunction(() => document.querySelectorAll('#chain li').length === 1);

		const corner = await page.evaluate(() => {
			const canvas = document.getElementById('canvas');
			return [...canvas.getContext('2d').getImageData(4, 4, 1, 1).data];
		});
		assert.deepEqual(corner, [200, 40, 90, 255]);	// c8285a
	});

	test('a chosen file joins the source list for the session', async () => {
		// `button.source` rather than every button in the list: each tile also
		// carries an insert control in code mode, so a bare `#sources button`
		// counts two per still and the count means nothing.
		const tiles = () => page.$$eval('#sources button.source', (els) => els.length);

		await open('#colours');
		const before = await tiles();

		const input = await page.$('#fileInput');
		await input.uploadFile(join(here, 'fixtures', 'photo.png'));
		await page.waitForFunction(
			(was) => document.querySelectorAll('#sources button.source').length > was,
			{},
			before
		);

		// it is selected, and - the point of the whole thing - it is still there
		// afterwards, so you can go back to it without dropping the file again
		const { count, pressed, label } = await page.$$eval('#sources button.source', (els) => ({
			count: els.length,
			pressed: els.filter((el) => el.getAttribute('aria-pressed') === 'true').length,
			label: els.at(-1).textContent
		}));
		assert.equal(count, before + 1);
		assert.equal(pressed, 1);
		assert.match(label, /photo/);

		await page.evaluate(() => document.querySelector('#sources button.source').click());
		await page.waitForFunction(
			() => document.querySelector('#sources button.source').getAttribute('aria-pressed') === 'true'
		);
		assert.equal(await tiles(), before + 1, 'switching away must not drop the file from the list');
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
	// ---------------------------------------------------------------- code mode

	/** Types a snippet into the editor and runs it. */
	const setSnippet = (source) =>
		page.evaluate((code) => {
			document.getElementById('snippet').value = code;
			document.getElementById('runSnippet').click();
		}, source);

	const snippetError = () => page.$eval('#snippetError', (el) => (el.hidden ? '' : el.textContent));

	/** Whether an element takes up space, hidden by itself or by an ancestor. */
	const isVisible = (selector) => page.$eval(selector, (el) => el.getClientRects().length > 0);

	/** Types a size into the two boxes and commits it. */
	const setResolution = async (width, height) => {
		await page.evaluate((w, h) => {
			const set = (id, value) => {
				const input = document.getElementById(id);
				input.value = value === '' ? '' : String(value);
			};
			set('resWidth', w);
			set('resHeight', h);
			document.getElementById('resWidth').dispatchEvent(new Event('change', { bubbles: true }));
		}, width, height);
		await new Promise((resolve) => setTimeout(resolve, 120));
	};

	/** Switches source in the page, without the reload that `open` does. */
	const chooseSource = async (id) => {
		await page.click(`#sources button[data-id="${id}"]`);
		await page.waitForFunction(
			(wanted) => document.querySelector('#sources button[aria-pressed="true"]')?.dataset.id === wanted,
			{},
			id
		);
	};

	const enterCodeMode = async (hash = '') => {
		await open(hash);
		await page.click('#modeCode');
		await page.waitForFunction(() => document.body.dataset.mode === 'code');
	};

	test('Code mode runs a snippet and renders what it returns', async () => {
		await open();
		const unfiltered = await canvasDigest();

		await enterCodeMode();
		assert.equal(await snippetError(), '', 'the default snippet did not run');
		assert.notEqual(await canvasDigest(), unfiltered, 'the snippet rendered nothing');

		// The palette and the chain list are for assembling a chain, which is the
		// one thing this mode does not do.
		//
		// Asked as "does this occupy space" rather than by reading `display`,
		// because an element inside a hidden parent still computes its own display
		// - so the property answers yes for a panel nobody can see.
		assert.equal(await isVisible('#palettePanel'), false, 'the palette is still showing');
		assert.equal(await isVisible('#chainPanel'), false, 'the chain list is still showing');
		assert.equal(await isVisible('#codePanel'), true, 'the editor is not showing');
	});

	test('Code mode is two halves, with the sources above the editor', async () => {
		// The layout is the feature here, so it is worth pinning: a snippet and the
		// picture it produces are read together, and neither belongs in a 274px
		// rail. Needs a wide viewport - the page stacks to one column below 1100px,
		// and the tests otherwise run at the default 800.
		const original = page.viewport();
		await page.setViewport({ width: 1600, height: 1000 });
		try {
			await enterCodeMode();

			const box = (selector) =>
				page.$eval(selector, (el) => {
					const { x, right, width, y } = el.getBoundingClientRect();
					return { x, right, width, y };
				});

			const code = await box('#codePanel');
			const stage = await box('.stage');
			const sources = await box('.rail-left');

			assert.ok(code.right <= stage.x + 1, 'the snippet should be left of the picture');
			assert.ok(sources.right <= stage.x + 1, 'the sources belong in the left half too');
			assert.ok(sources.y + 1 < code.y, 'the sources should sit above the editor');
			assert.ok(
				Math.abs(code.width - stage.width) < 40,
				`the halves should be even, got ${Math.round(code.width)} and ${Math.round(stage.width)}`
			);
		} finally {
			await page.setViewport(original ?? { width: 800, height: 600 });
		}
	});

	test('the snippet picker is legible in both themes', async () => {
		// The list a <select> opens is drawn by the browser out of the select's own
		// computed colours, so `.ghost` - transparent, muted text - rendered it as
		// pale grey on whatever was behind it, readable only under the hover bar.
		// The popup is OS chrome and cannot be screenshotted, but the two colours
		// it is built from can be read, and they are the whole bug.
		await enterCodeMode();

		/** WCAG contrast of an element's own text against its own background. */
		const contrastOf = (selector) =>
			page.$eval(selector, (el) => {
				const parse = (value) => (value.match(/[\d.]+/g) ?? []).map(Number);
				const luminance = ([r, g, b]) => {
					const channel = (c) => {
						const v = c / 255;
						return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
					};
					return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
				};

				const style = getComputedStyle(el);
				const background = parse(style.backgroundColor);
				const text = parse(style.color);
				//alpha defaults to 1 when rgb() omits it; a transparent background is
				//the original bug, so it is reported rather than treated as opaque
				const alpha = background[3] ?? 1;
				const a = luminance(background);
				const b = luminance(text);
				const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
				return { alpha, ratio, scheme: getComputedStyle(document.documentElement).colorScheme };
			});

		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => {
				document.documentElement.dataset.theme = value;
			}, theme);

			const { alpha, ratio, scheme } = await contrastOf('#snippetPicker');

			assert.equal(alpha, 1, `the ${theme} picker has no background of its own to draw on`);
			assert.ok(ratio >= 4.5, `the ${theme} picker reads at ${ratio.toFixed(2)}:1, needs 4.5`);
			// and the browser has to be told which way the page went, or it draws
			// the popup's own chrome for the system theme instead of the chosen one
			assert.equal(scheme, theme, `the ${theme} theme did not reach the native controls`);
		}

		await page.evaluate(() => delete document.documentElement.dataset.theme);
	});

	test('every shipped snippet compiles and changes the picture', async () => {
		// The examples/ folder rotted for years because nothing ran it. These are
		// documentation, so they get what the generated docs get: an example that
		// cannot compile fails the build.
		await enterCodeMode();

		await setSnippet('return new Pipeline();');
		assert.equal(await snippetError(), '', 'an empty pipeline should be legal');
		const untouched = await canvasDigest();

		for (const snippet of SNIPPETS) {
			await setSnippet(snippet.source);
			assert.equal(await snippetError(), '', `the ${snippet.id} snippet did not run`);
			assert.notEqual(await canvasDigest(), untouched, `the ${snippet.id} snippet changed nothing`);
		}
	});

	test('a snippet declares its own Renderer, and re-running starts clean', async () => {
		// The form the README opens with, and the one the Build tab's Code panel
		// prints - which the panel would not previously accept.
		await enterCodeMode();

		const stageCount = () => page.$eval('#mStages', (el) => Number(el.textContent.split(' ')[0]));
		const declared = [
			'const renderer = new Renderer(canvas)',
			'  .source(image)',
			'  .add(new Invert())',
			'  .add(new Desaturate());',
			'return renderer;'
		].join('\n');

		await setSnippet(declared);
		assert.equal(await snippetError(), '', 'the canonical form did not run');
		assert.equal(await stageCount(), 2);

		// `new Renderer` hands back the page's renderer rather than a second one,
		// so a fresh pipeline per construction is the only thing stopping the chain
		// growing every time Run is pressed.
		await setSnippet(declared);
		assert.equal(await stageCount(), 2, 'the chain grew when the snippet was re-run');

		// and it really is the page's renderer, not a detached one drawing nowhere
		assert.equal(
			await page.evaluate(() => document.getElementById('canvas').width > 0),
			true
		);
	});

	test('a snippet whose only moving part is in a branch still animates', async () => {
		// Two things had to be true for this and neither was. The frame loop is
		// started by asking whether anything in the chain is animated, and the
		// cache is skipped by asking whether anything is impure - both were asked
		// of the top-level filters only. The fog's Multiply stages are pure and
		// still by their own reckoning; everything that moves is in the branches.
		//
		// The failure is silent in both directions: the loop runs and every frame
		// is identical, or the loop never starts at all.
		await enterCodeMode();
		await page.evaluate(() => {
			const picker = document.getElementById('snippetPicker');
			picker.value = 'fog';
			picker.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await page.waitForFunction(() => document.getElementById('snippet').value.includes('drift'));
		assert.equal(await snippetError(), '', 'the fog snippet did not run');

		// Settle first. Taking the reference immediately catches the difference
		// between the one-off render and the loop's first frame, which happens
		// whether or not anything is animating - so without this wait the test
		// passes with the cache fix reverted.
		await new Promise((resolve) => setTimeout(resolve, 700));
		const before = await canvasDigest();
		let moved = false;
		const deadline = Date.now() + 4000;
		while (Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 150));
			if ((await canvasDigest()) !== before) {
				moved = true;
				break;
			}
		}

		assert.equal(moved, true, 'the fog never drifted');
	});

	test('a snippet can drive a property every frame, and the loop runs for it', async () => {
		// The third kind of motion. The source can be the moving part, and so can
		// the chain - this is neither: every filter here is still and pure, and the
		// thing that changes is a number set from the callback.
		//
		// Which is exactly why the loop has to be told. `pipeline.animated` is a
		// confident no for this chain, and a callback that fires once is not an
		// animation.
		await enterCodeMode();
		await setSnippet(
			[
				'const cut = new ValueThreshold({ threshold: 128 });',
				'everyFrame(() => {',
				'  cut.setProperty("threshold", 128 + Math.round(100 * Math.sin(performance.now() / 400)));',
				'});',
				'return new Renderer(canvas).source(image).add(new Desaturate()).add(cut);'
			].join('\n')
		);
		assert.equal(await snippetError(), '', 'the everyFrame snippet did not run');

		const before = await canvasDigest();
		let moved = false;
		const deadline = Date.now() + 4000;
		while (Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 120));
			if ((await canvasDigest()) !== before) {
				moved = true;
				break;
			}
		}
		assert.equal(moved, true, 'the property never moved, so the loop never ran');

		// A callback belongs to the run that registered it. Leaving it attached
		// would keep the loop running over a still picture for the rest of the
		// session, driving filters that are no longer in the chain.
		//
		// Asserted on the loop rather than on the canvas, which cannot see this:
		// the orphaned callback drives a filter that has left the chain, so the
		// picture sits still either way while the page renders it sixty times a
		// second forever. The frame-time tooltip is the one thing on the page that
		// distinguishes a looping chain from one that rendered once.
		await setSnippet('return new Renderer(canvas).source(image).add(new Invert());');
		assert.equal(await snippetError(), '');
		await new Promise((resolve) => setTimeout(resolve, 700));

		assert.match(
			await page.$eval('#mFrame', (el) => el.title),
			/Median of/,
			'the loop is still running after the snippet that wanted it was replaced'
		);
	});

	test('an everyFrame callback that throws stops rather than throwing forever', async () => {
		// Sixty identical errors a second, and a picture that carries on moving,
		// is not a diagnosis. Dropping the callback makes it one message about a
		// loop that has stopped - which is what happened.
		await enterCodeMode();
		await setSnippet(
			[
				'let n = 0;',
				'everyFrame(() => { if (++n > 2) { throw new Error("deliberate"); } });',
				'return new Renderer(canvas).source(image).add(new Invert());'
			].join('\n')
		);
		await new Promise((resolve) => setTimeout(resolve, 600));

		assert.match(await snippetError(), /everyFrame.*deliberate/);

		// and it really has stopped, rather than being reported once per frame
		const count = await page.evaluate(() => {
			const panel = document.getElementById('snippetError');
			return panel.textContent;
		});
		await new Promise((resolve) => setTimeout(resolve, 500));
		assert.equal(await snippetError(), count, 'the callback is still running and still throwing');
	});

	test('a second input is counted as the transfer it is', async () => {
		// `transfers` is the number this project consults before deciding whether a
		// GPU change is worth making, and it ignored second inputs entirely - so it
		// undercounted precisely the case it was being consulted about, since a
		// composed chain is mostly second inputs.
		//
		// A one-stage chain is two crossings: the frame up, the result back. Give
		// the stage a second frame and it is three.
		await enterCodeMode();

		// Read off the pipeline rather than the backend badge. The badge reports
		// whatever the page last rendered, which depends on the test before this
		// one; `gpu: true` here says what this chain needs and `stats.backend`
		// confirms it got it, so the count below cannot be a CPU run's zero.
		const statsFor = async (stage) => {
			await setSnippet(
				[
					'const chain = new Pipeline([], { gpu: true })' + stage + ';',
					'chain.run(frameOf(image));',
					'window.__stats = { transfers: chain.stats.transfers, backend: chain.stats.backend };',
					'return chain;'
				].join('\n')
			);
			assert.equal(await snippetError(), '', `the ${stage} chain did not run`);
			return page.evaluate(() => window.__stats);
		};

		const plain = await statsFor('.add(new Invert())');
		assert.equal(plain.backend, 'gpu', 'nothing crosses anything on the CPU path');
		assert.equal(plain.transfers, 2, 'one frame up, one back');

		const composed = await statsFor('.add(new Multiply(), { second: samples.rorschach })');
		assert.equal(composed.backend, 'gpu', 'the two-input stage fell back to the CPU');
		assert.equal(
			composed.transfers,
			3,
			'the second frame crossed the bus without being counted'
		);
	});

	test('a broken snippet reports and leaves the picture alone', async () => {
		// Half-finished is a snippet's normal state, so a failure has to be a
		// message rather than a blank canvas - otherwise the error text is the only
		// feedback there is, and you lose the thing you were comparing against.
		await enterCodeMode();
		await setSnippet('return new Pipeline([new Invert()]);');
		const working = await canvasDigest();

		await setSnippet('return new NoSuchFilter();');
		assert.match(await snippetError(), /ReferenceError/);
		assert.equal(await canvasDigest(), working, 'a failed run threw the picture away');

		// The harder half: `new Renderer(...)` points the page at a fresh chain as
		// it is constructed, so a snippet that gets part way and then throws has
		// already replaced the chain by the time it fails. Failing above only
		// works because nothing was built before the throw.
		await setSnippet(
			'new Renderer(canvas).source(image).add(new Blur({ radius: 6 }));\nthrow new Error("half way");'
		);
		assert.match(await snippetError(), /half way/);

		// Comparing the canvas here would prove nothing: a failed run does not
		// repaint, so a half-built chain sitting in the renderer looks identical
		// until something asks for a frame. The bug is met on the *next* render -
		// type something broken, click a different picture, and find a chain you
		// never asked for. So force one.
		await chooseSource('face');
		await chooseSource('landscape');
		assert.equal(await canvasDigest(), working, 'a half-built chain survived into the next render');

		// the two half-written states that are not exceptions
		await setSnippet('new Invert();');
		assert.match(await snippetError(), /Nothing was returned/);
		// returning the last filter is the likeliest of these, because `add` looks
		// like it ought to hand one back
		await setSnippet('return new Invert();');
		assert.match(await snippetError(), /Expected a Renderer or a Pipeline, got an Invert filter/);

		// and it recovers
		await setSnippet('return new Pipeline([new Invert()]);');
		assert.equal(await snippetError(), '');
		assert.equal(await canvasDigest(), working);
	});

	test('samples are in scope, so a snippet can compose two pictures', async () => {
		// The capability the drag list cannot reach. `second` has always taken an
		// ImageData; what was missing was any way to name a picture other than the
		// one selected.
		await enterCodeMode();

		await setSnippet(
			[
				'const renderer = new Renderer(canvas)',
				'  .source(image)',
				'  .add(new Multiply(), { second: samples.rorschach });',
				'return renderer;'
			].join('\n')
		);
		assert.equal(await snippetError(), '', 'samples.rorschach was not reachable');

		const composed = await canvasDigest();

		// Against the same chain with the *source* as its second input: if both
		// gave the same picture, `samples` would not be doing anything.
		await setSnippet(
			[
				'const renderer = new Renderer(canvas)',
				'  .source(image)',
				'  .add(new Multiply(), { second: frameOf(image) });',
				'return renderer;'
			].join('\n')
		);
		assert.equal(await snippetError(), '', 'frameOf(image) was not reachable');
		assert.notEqual(await canvasDigest(), composed, 'the second input made no difference');
	});

	test('a first input replaces the frame on the GPU as well as the CPU', async () => {
		// The run boundary, which only exists on this backend. A shader run shares
		// one uploaded frame ping-ponged between two targets, so a stage that
		// throws that frame away for another one cannot live inside it - it has to
		// begin a run of its own.
		//
		// Get that wrong and `first` is silently ignored on the GPU while the CPU
		// honours it, which is the worst shape a bug can have: the picture is only
		// wrong on machines with a working WebGL2, and the Node tests all pass.
		//
		// So the assertion is that the stage in front makes *no difference*. It is
		// an Invert, which is about as visible as a filter gets - if `first` were
		// being skipped, these two would not be close, let alone identical.
		await enterCodeMode();
		assert.equal(
			await page.$eval('#backendBadge', (el) => el.textContent),
			'GPU',
			'this test says nothing unless the shaders are actually running'
		);

		const chain = (lead) =>
			[
				'const stamp = new Pipeline([new Cloud({ seed: 4 }), new GradientMap({ ramp: "ice" })]);',
				'return new Renderer(canvas)',
				'  .source(image)',
				lead,
				'  .add(new Blur({ radius: 2 }), { first: stamp });'
			]
				.filter(Boolean)
				.join('\n');

		await setSnippet(chain('  .add(new Invert())'));
		assert.equal(await snippetError(), '', 'the chain with a lead-in did not run');
		const withLead = await canvasDigest();

		await setSnippet(chain(null));
		assert.equal(await snippetError(), '', 'the chain without a lead-in did not run');

		assert.equal(await canvasDigest(), withLead, 'the discarded stage reached the picture');

		// The control, or the above would pass just as well on a `first` that was
		// never read at all: without it the Invert is the whole picture.
		await setSnippet(
			'return new Renderer(canvas).source(image).add(new Invert()).add(new Blur({ radius: 2 }));'
		);
		assert.equal(await snippetError(), '');
		assert.notEqual(await canvasDigest(), withLead, 'first drew the source anyway');
	});

	test('a sample of a different size composes rather than tearing', async () => {
		// `colours` is 1280x1024 against `landscape`'s 1024x1024, so this is the
		// case that used to read the second frame a row at a time out of alignment
		// on the CPU while the shader stretched it. Both stretch now.
		//
		// Multiplying a picture by *itself* is the reference: the same chain with a
		// differently-sized second frame must still produce a full frame of pixels
		// rather than a black band where the reads ran out.
		await enterCodeMode();
		await setSnippet(
			[
				'const renderer = new Renderer(canvas)',
				'  .source(image)',
				'  .add(new Multiply(), { second: samples.colours });',
				'return renderer;'
			].join('\n')
		);
		assert.equal(await snippetError(), '');

		const black = await page.evaluate(() => {
			const canvas = document.getElementById('canvas');
			const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
			let count = 0;
			for (let i = 0; i < data.length; i += 4) {
				if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) count++;
			}
			return count / (data.length / 4);
		});

		assert.ok(black < 0.25, `${(black * 100).toFixed(1)}% of the frame came out black`);
	});

	test('the insert control declares a sample as a variable', async () => {
		await enterCodeMode();
		await setSnippet('return new Pipeline();');

		await page.click('#sources button[data-insert="rorschach"]');
		let text = await page.$eval('#snippet', (el) => el.value);
		assert.match(text, /const rorschach = samples\.rorschach;/, 'nothing was inserted');

		// Inserting it twice would be a redeclaration, which is a syntax error
		// rather than a convenience - so the second press selects the first one.
		await page.click('#sources button[data-insert="rorschach"]');
		text = await page.$eval('#snippet', (el) => el.value);
		assert.equal(
			text.match(/const rorschach =/g).length,
			1,
			'a second press declared it again'
		);
		assert.equal(
			await page.$eval('#snippet', (el) => el.value.slice(el.selectionStart, el.selectionEnd)),
			'const rorschach =',
			'the second press should point at the declaration that already exists'
		);

		// and what it wrote actually runs
		await setSnippet(
			[
				'const rorschach = samples.rorschach;',
				'return new Renderer(canvas)',
				'  .source(image)',
				'  .add(new Multiply(), { second: rorschach });'
			].join('\n')
		);
		assert.equal(await snippetError(), '', 'the inserted variable did not resolve');
	});

	test('only stills offer an insert control', async () => {
		// A video that is not the current source has no frame to hand out - the
		// page holds one video element at a time - so `samples` is stills only and
		// offering a `+` on a video would write a line that resolves to undefined.
		await enterCodeMode();
		assert.equal(
			await page.$$eval('#sources .tile', (tiles) =>
				tiles
					.filter((tile) => tile.querySelector('.tile-insert'))
					.every((tile) => tile.querySelector('.source').dataset.kind === 'image')
			),
			true,
			'something other than a still offered an insert control'
		);
		// counted rather than bounded, so it stays true as sources are added
		const counts = await page.evaluate(() => ({
			inserts: document.querySelectorAll('#sources .tile-insert').length,
			stills: [...document.querySelectorAll('#sources button.source')].filter(
				(button) => button.dataset.kind === 'image'
			).length
		}));
		assert.ok(counts.stills >= 6, `only ${counts.stills} still sources - has the list shrunk?`);
		assert.equal(counts.inserts, counts.stills, 'every still should offer exactly one');
	});

	test('Code mode leaves the built chain and the URL alone', async () => {
		await open('#colours/Invert');
		const inverted = await canvasDigest();
		const hash = await page.evaluate(() => location.hash);

		await page.click('#modeCode');
		await page.waitForFunction(() => document.body.dataset.mode === 'code');
		await setSnippet('return new Pipeline([new Desaturate()]);');
		assert.notEqual(await canvasDigest(), inverted, 'the snippet did not take over the canvas');

		// A snippet cannot be shared - there is no safe way to run one that arrived
		// in a link - so the URL has to keep describing the built chain.
		assert.equal(await page.evaluate(() => location.hash), hash, 'code mode rewrote the URL');

		await page.click('#modeBuild');
		await page.waitForFunction(() => document.body.dataset.mode === 'build');
		assert.equal(await canvasDigest(), inverted, 'the built chain did not come back');
		assert.deepEqual(
			await page.$$eval('#chain li .stage-name', (els) => els.map((el) => el.textContent)),
			['Invert']
		);
	});

	test('the snippet buffer survives a reload', async () => {
		await enterCodeMode();
		await setSnippet('//a-marker-that-survives\nreturn new Pipeline([new Desaturate()]);');

		await open();
		assert.match(
			await page.$eval('#snippet', (el) => el.value),
			/a-marker-that-survives/,
			'the editor came back empty'
		);
	});

	test('the source can be read at a size of your choosing', async () => {
		await open('#landscape');
		assert.equal(await page.$eval('#mSize', (el) => el.textContent), '1024 × 1024');

		// the boxes start empty, showing the source's own size as the placeholder
		assert.deepEqual(
			await page.evaluate(() => [
				document.getElementById('resWidth').value,
				document.getElementById('resWidth').placeholder
			]),
			['', '1024']
		);

		await setResolution(320, 240);
		assert.equal(await page.$eval('#mSize', (el) => el.textContent), '320 × 240');

		// and it travels in the link, because a resized picture is a different
		// picture and a chain tuned for one is not tuned for the other
		assert.match(await page.evaluate(() => location.hash), /^#landscape@320x240/);

		await page.click('#resReset');
		await page.waitForFunction(() => document.getElementById('mSize').textContent === '1024 × 1024');
		assert.equal(
			await page.evaluate(() => location.hash),
			'#landscape',
			'the size should leave the URL when it is back to the natural one'
		);
	});

	test('one dimension is enough, and the other follows the shape', async () => {
		// Typing a width and getting a squashed picture would be a strange way to
		// answer "how wide".
		await open('#books');
		const natural = await page.$eval('#mSize', (el) => el.textContent);
		assert.equal(natural, '1536 × 1024', 'books is the non-square sample this needs');

		await setResolution(768, '');
		assert.equal(await page.$eval('#mSize', (el) => el.textContent), '768 × 512');
	});

	test('a resized link reproduces the picture it was copied from', async () => {
		// The whole point of the hash. A size that only lived in the boxes would
		// make every shared link of a resized chain wrong.
		await open('#landscape@256x256/Pixelate,size=8');
		assert.equal(await page.$eval('#mSize', (el) => el.textContent), '256 × 256');
		const resized = await canvasDigest();

		await open('#landscape/Pixelate,size=8');
		assert.notEqual(await canvasDigest(), resized, 'the size in the link did nothing');

		await open('#landscape@256x256/Pixelate,size=8');
		assert.equal(await canvasDigest(), resized, 'the same link gave a different picture');
	});

	test('the insert control writes under the comment block, not at the cursor', async () => {
		// The cursor is wherever you last were, which is usually the middle of the
		// chain - and a `const` dropped into an expression is a syntax error.
		await enterCodeMode();
		await setSnippet(['// a note about this', '//', '// and more', '', 'return new Pipeline();'].join('\n'));

		// park the cursor somewhere unhelpful, which is the state this replaces
		await page.evaluate(() => {
			const editor = document.getElementById('snippet');
			editor.focus();
			const at = editor.value.indexOf('new Pipeline');
			editor.setSelectionRange(at, at);
		});

		await page.click('#sources button[data-insert="books"]');

		assert.equal(
			await page.$eval('#snippet', (el) => el.value),
			[
				'// a note about this',
				'//',
				'// and more',
				'',
				'const books = samples.books;',
				'return new Pipeline();'
			].join('\n'),
			'the declaration did not land under the preamble'
		);
	});

	test('nothing threw along the way', async () => {
		assert.deepEqual(errors, []);
		await browser.close();
		server.close();
	});
}
