// Builds a single self-contained HTML page showing every filter's input and
// output side by side, so the whole library can be eyeballed at once.
//
// Run with `npm run test:sheet`. Reads the committed goldens, so it reflects
// exactly what the test suite is asserting - regenerate the goldens first if
// you have changed a filter.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { cases, caseName } from './cases.js';
import { descriptions, categories, CATEGORY_ORDER } from './descriptions.js';
import { GOLDEN, inputFrame } from './run.js';
import { readPNG, encodePNG } from './image.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'contact-sheet');

const dataURI = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
const fileURI = (path) => dataURI(readFileSync(path));

/**
 * How much the filter actually changed, as a percentage of pixels touched and
 * the mean absolute channel delta. A filter reporting 0% did nothing, which is
 * the single most useful signal on this page.
 */
function changeStats(before, after) {
	if (before.width !== after.width || before.height !== after.height) {
		return { changed: 100, meanDelta: null, resized: true };
	}
	let changed = 0;
	let total = 0;
	const count = before.width * before.height;

	for (let i = 0; i < before.data.length; i += 4) {
		let delta = 0;
		for (let c = 0; c < 4; c++) {
			delta += Math.abs(before.data[i + c] - after.data[i + c]);
		}
		if (delta > 0) changed++;
		total += delta / 4;
	}

	return {
		changed: (changed / count) * 100,
		meanDelta: total / count,
		resized: false
	};
}

const escape = (s) =>
	String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function formatOptions(options) {
	const entries = Object.entries(options ?? {});
	if (!entries.length) return 'defaults';
	return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
}

// group cases by category, preserving the order filters appear in cases.js
const grouped = new Map(CATEGORY_ORDER.map((c) => [c, []]));
for (const entry of cases) {
	const category = categories[entry.filter] ?? 'Misc';
	if (!grouped.has(category)) grouped.set(category, []);
	grouped.get(category).push(entry);
}

let cards = 0;
let suspicious = 0;
const sections = [];

for (const [category, entries] of grouped) {
	if (!entries.length) continue;

	const items = entries.map((entry) => {
		const name = caseName(entry);
		const inputs = Array.isArray(entry.input) ? entry.input : [entry.input];
		const goldenPath = join(GOLDEN, `${name}.png`);

		// the before image is the frame the filter actually saw, `pre` chain and
		// all - otherwise a case like NormalIntensity would show a height map next
		// to a normal map and the pair would be unreadable
		const before = inputs.map((n) => inputFrame(entry, n));

		// for a sequence the last frame is what produced the output; for the
		// dual-input form both are inputs
		const primary = entry.sequence ? before[before.length - 1] : before[0];
		const stats = changeStats(primary, readPNG(goldenPath));

		const doc = descriptions[entry.filter] ?? {};
		const didNothing = stats.changed < 0.01;
		if (didNothing) suspicious++;
		cards++;

		const preLabel = (entry.pre ?? []).map((step) => step.filter).join(' &rarr; ');
		const beforeImgs = before
			.map((frame, index) => {
				const caption = preLabel
					? `${escape(inputs[index])} &rarr; ${preLabel}`
					: escape(inputs[index]);
				return `<figure><img src="${dataURI(encodePNG(frame))}" alt="${escape(inputs[index])}"><figcaption>${caption}</figcaption></figure>`;
			})
			.join('');

		const badge = stats.resized
			? `<span class="stat warn">output resized</span>`
			: didNothing
				? `<span class="stat bad">no pixels changed</span>`
				: `<span class="stat">${stats.changed.toFixed(1)}% of pixels changed &middot; mean &Delta;${stats.meanDelta.toFixed(1)}</span>`;

		return `
	<article class="card${didNothing ? ' flagged' : ''}">
		<header>
			<h3>${escape(entry.filter)}${entry.name ? `<span class="variant">${escape(entry.name)}</span>` : ''}</h3>
			${badge}
		</header>
		${doc.summary ? `<p class="summary">${escape(doc.summary)}</p>` : ''}
		${doc.look ? `<p class="look"><strong>Look for:</strong> ${escape(doc.look)}</p>` : ''}
		${doc.note ? `<p class="note">${escape(doc.note)}</p>` : ''}
		<div class="images">
			<div class="side">${beforeImgs}</div>
			<div class="arrow">&rarr;</div>
			<div class="side"><figure><img src="${fileURI(goldenPath)}" alt="${escape(name)} output"><figcaption>output</figcaption></figure></div>
		</div>
		<p class="options"><code>${escape(formatOptions(entry.options))}</code>${entry.sequence ? ' <em>(fed as a frame sequence)</em>' : ''}</p>
	</article>`;
	});

	sections.push(`<section>
	<h2>${escape(category)}</h2>
	<div class="grid">${items.join('')}</div>
</section>`);
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clarity - filter contact sheet</title>
<style>
	:root { color-scheme: light dark; }
	body {
		font: 15px/1.5 system-ui, sans-serif;
		margin: 0;
		padding: 2rem clamp(1rem, 4vw, 3rem) 4rem;
		background: Canvas;
		color: CanvasText;
	}
	h1 { margin: 0 0 .25rem; font-size: 1.6rem; }
	.lede { margin: 0 0 2rem; opacity: .75; max-width: 60ch; }
	h2 {
		font-size: 1.1rem; text-transform: uppercase; letter-spacing: .08em;
		opacity: .6; margin: 2.5rem 0 1rem; padding-bottom: .4rem;
		border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
	}
	.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
	.card {
		border: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
		border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; gap: .5rem;
	}
	.card.flagged { border-color: #c2410c; background: color-mix(in srgb, #c2410c 6%, transparent); }
	.card header { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; flex-wrap: wrap; }
	h3 { margin: 0; font-size: 1rem; }
	.variant { font-weight: 400; opacity: .6; margin-left: .4rem; }
	.variant::before { content: '('; } .variant::after { content: ')'; }
	.stat { font-size: .75rem; opacity: .7; white-space: nowrap; }
	.stat.bad { color: #c2410c; opacity: 1; font-weight: 600; }
	.stat.warn { color: #a16207; opacity: 1; }
	.summary { margin: 0; }
	.look { margin: 0; font-size: .9rem; opacity: .8; }
	.note {
		margin: 0; font-size: .85rem; padding: .5rem .6rem; border-radius: 6px;
		background: color-mix(in srgb, #a16207 12%, transparent);
		border-left: 3px solid #a16207;
	}
	.images { display: flex; align-items: center; gap: .5rem; margin-top: auto; padding-top: .5rem; }
	.side { display: flex; gap: .4rem; flex-wrap: wrap; }
	.arrow { opacity: .4; font-size: 1.2rem; }
	figure { margin: 0; display: flex; flex-direction: column; gap: .2rem; }
	figcaption { font-size: .7rem; opacity: .55; text-align: center; }
	img {
		image-rendering: pixelated;
		width: 128px; height: auto;
		border-radius: 4px;
		/* checkerboard, so transparency is visible rather than guessed at */
		background-image:
			linear-gradient(45deg, #8884 25%, transparent 25%, transparent 75%, #8884 75%),
			linear-gradient(45deg, #8884 25%, transparent 25%, transparent 75%, #8884 75%);
		background-size: 12px 12px;
		background-position: 0 0, 6px 6px;
	}
	.options { margin: 0; font-size: .75rem; opacity: .65; }
	code { font-family: ui-monospace, monospace; }
	.summary-bar {
		padding: .75rem 1rem; border-radius: 8px; margin-bottom: 1.5rem;
		background: color-mix(in srgb, CanvasText 6%, transparent); font-size: .9rem;
	}
</style>
</head>
<body>
<h1>Clarity &mdash; filter contact sheet</h1>
<p class="lede">
	Every filter applied to a fixed input, rendered from the committed golden
	images. Use it to check each filter is doing what it is meant to, not just
	that it is doing <em>something</em>.
</p>
<div class="summary-bar">
	<strong>${cards}</strong> cases across <strong>${new Set(cases.map((c) => c.filter)).size}</strong> filters.
	${suspicious ? `<strong style="color:#c2410c">${suspicious} changed no pixels</strong> and are highlighted below.` : 'Every filter changed at least some pixels.'}
</div>
${sections.join('\n')}
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'index.html');
writeFileSync(outPath, html);

console.log(`${cards} cases written to ${outPath}`);
console.log(`${(html.length / 1024).toFixed(0)} KB, self-contained`);
if (suspicious) {
	console.log(`\n${suspicious} case(s) changed no pixels - highlighted in the sheet`);
}
