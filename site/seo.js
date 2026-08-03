// The half of the playground that has to exist before JavaScript runs.
//
// The page builds itself from `CATALOGUE` at load, which is right for the app
// and wrong for a crawler: the shipped markup says "Clarity", "Source",
// "Filters" and nothing else, so a search engine sees a page about nothing and
// a link preview shows an empty shell. The fix is not to hand-write the
// missing text - that is how the three filter lists `CATALOGUE` replaced went
// stale - it is to bake it in at build time from the same metadata the palette
// reads.
//
// So this emits, into the static HTML:
//
//   - schema.org JSON-LD, as a @graph, tying the playground to the library, to
//     the repo, and to its author's site at clarklavery.com;
//   - a plain-HTML reference for every filter, each one a working demo link;
//   - the filter count, wherever the copy claims one.
//
// Runs in dev as well as build, so `view-source` locally is what Googlebot
// gets in production.

import { CATALOGUE, CATEGORY_ORDER, TRAITS } from '../src/catalogue.ts';

const SITE = 'https://clarity.clarklavery.com';
const AUTHOR_SITE = 'https://clarklavery.com';
/** The same @id the portfolio's own Person node uses, so both sites describe one entity. */
const PERSON_ID = `${AUTHOR_SITE}/#person`;
const PROJECT_PAGE = `${AUTHOR_SITE}/projects/web/clarity`;
const REPO = 'https://github.com/calrk/clarity';
const PACKAGE = 'https://www.npmjs.com/package/@calrk/clarity';
const OG_IMAGE = `${SITE}/og-image.png`;
const OG_IMAGE_ALT =
	'The Clarity playground: a colour gradient pixelated on the GPU, with the source list, the filter palette, the live pipeline and the generated code around it';

const FILTERS = Object.entries(CATALOGUE);

const DESCRIPTION =
	`Build a canvas filter chain in the browser, drag to reorder, watch it run on the GPU. ` +
	`Clarity is a dependency-free image-filter library with ${FILTERS.length} composable filters - blur, ` +
	`edge detection, chromatic aberration, posterising, normal maps, motion detection - and the ` +
	`chain you build is a link you can send.`;

const escape = (text) =>
	String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A chain that shows the filter doing something, worked out from its traits.
 *
 * A motion detector on a still is black and a dot remover on a photograph is
 * mush, so "point it at the colours sample" is the wrong link for a third of
 * the catalogue. The traits already say what each one needs; this turns that
 * into the source - and, where the filter wants a prepared frame, the stage in
 * front of it - that makes the link worth clicking.
 */
function demo(name, entry) {
	const traits = entry.traits ?? [];
	if (traits.includes('starter')) return `#blank/${name}`;
	if (traits.includes('temporal')) return `#camera/${name}`;
	if (traits.includes('normalmap-in')) return `#heightmap/NormalGenerator/${name}`;
	if (traits.includes('heightmap-in')) return `#heightmap/${name}`;
	if (traits.includes('binary-in')) return `#colours/ValueThreshold/${name}`;
	return `#colours/${name}`;
}

/** The filter reference: every filter, its one-line summary, and what it needs. */
function reference() {
	const groups = CATEGORY_ORDER.map((category) => {
		const entries = FILTERS.filter(([, entry]) => entry.category === category);
		if (!entries.length) return '';

		const items = entries
			.map(([name, entry]) => {
				const needs = (entry.traits ?? [])
					.map((trait) => `<span class="ref-trait">${escape(TRAITS[trait].label)}</span>`)
					.join('');
				return (
					`<dt><a href="${escape(demo(name, entry))}">${escape(name)}</a>${needs}</dt>` +
					`<dd>${escape(entry.summary)}</dd>`
				);
			})
			.join('');

		return `<section class="ref-group"><h3>${escape(category)}</h3><dl>${items}</dl></section>`;
	});

	return groups.join('');
}

/**
 * The questions the page cannot answer on its own.
 *
 * Rendered as visible text and mirrored into the JSON-LD below - the same
 * words in both, because structured data that says something the page does not
 * is the one thing search engines actually penalise.
 */
const FAQ = [
	{
		q: 'Do my images get uploaded anywhere?',
		a: 'No. Every filter runs in your browser, on your machine. Nothing you drop on the page, and nothing from your webcam, is sent to a server - there is no server, only a static page.'
	},
	{
		q: 'Does it need a GPU?',
		a: 'No. Filters run as fragment shaders where WebGL2 is available, and every one of them has a CPU implementation behind it. The fallback is per stage rather than all-or-nothing, so one unsupported filter does not drop the whole chain.'
	},
	{
		q: 'Can I use these filters in my own project?',
		a: 'Yes - npm install @calrk/clarity. It is MIT licensed, has no dependencies, and needs no DOM: every filter takes an ImageData and returns an ImageData, so it runs in Node too.'
	},
	{
		q: 'Can I share a chain I have built?',
		a: 'Yes. The whole pipeline lives in the URL, so copying the address bar copies the exact stack, its filters, their settings and their order.'
	}
];

/** Real chains worth arriving on, and the fastest explanation of what the thing does. */
const EXAMPLES = [
	['#colours/Bleed,radius=24/ChromaticAberration,xdistance=8', 'Colour bleed and chromatic aberration', 'the composite-video look'],
	['#colours/Posteriser,colours=6', 'Posterised to six colours', 'median-cut palette, recomputed per frame'],
	['#blank/Cloud,iterations=6', 'A cloud texture from nothing', 'the starters need no input at all'],
	['#heightmap/NormalGenerator', 'Height map to normal map', 'then NormalIntensity to re-light it'],
	['#camera/MotionDetector', 'Motion detection on your webcam', 'compares frames, so it wants something moving'],
	['#colours/Puzzler,horizontalSegs=8,verticalSegs=6', 'Scrambled like a puzzle', 'segments shuffled, deterministically']
];

function footer() {
	const examples = EXAMPLES.map(
		([hash, label, note]) =>
			`<li><a href="${escape(hash)}">${escape(label)}</a> <span>&mdash; ${escape(note)}</span></li>`
	).join('');

	const faq = FAQ.map(
		({ q, a }) => `<dt>${escape(q)}</dt><dd>${escape(a)}</dd>`
	).join('');

	return `
<footer class="about">
	<div class="about-inner">

		<section class="about-block">
			<h2>What this is</h2>
			<p>Clarity is a canvas image-filter library: ${FILTERS.length} filters that each take an <code>ImageData</code> and return an <code>ImageData</code>, so they compose by chaining. They run as fragment shaders by default - an N-filter chain is N draw calls with no round-trip to the CPU between them - and every one of them has a CPU implementation behind it for where WebGL2 is missing.</p>
			<p>This page is the playground for it. Pick a source, stack filters, drag to reorder, and read the code it generates. The chain lives in the URL, so anything you build here is a link:</p>
			<ul class="examples">${examples}</ul>
		</section>

		<section class="about-block">
			<h2>Questions</h2>
			<dl class="faq">${faq}</dl>
		</section>

		<section class="about-block">
			<h2>Every filter</h2>
			<p class="about-note">All ${FILTERS.length}, by family, each linked to a chain that shows it working. This list and the palette above are built from the same catalogue in the library.</p>
			<div class="reference">${reference()}</div>
		</section>

		<p class="colophon">
			Clarity is built by <a href="${AUTHOR_SITE}" rel="author">Clark Lavery</a>.
			<a href="${PROJECT_PAGE}">More about the project</a> &middot;
			<a href="${REPO}" rel="noreferrer">Source on GitHub</a> &middot;
			<a href="${PACKAGE}" rel="noreferrer">@calrk/clarity on npm</a>
		</p>

	</div>
</footer>`;
}

/**
 * The structured data, as one @graph rather than four loose scripts, so the
 * nodes can point at each other by @id: the page is about the app, the app is
 * built from the source, and both are by the person the portfolio describes.
 */
function jsonLd() {
	return {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'Person',
				'@id': PERSON_ID,
				name: 'Clark Lavery',
				url: AUTHOR_SITE,
				jobTitle: 'Web, Games & Graphics Programmer',
				sameAs: ['https://www.linkedin.com/in/clark-lavery/', 'https://github.com/calrk']
			},
			{
				'@type': 'WebSite',
				'@id': `${SITE}/#website`,
				name: 'Clarity',
				url: SITE,
				description: DESCRIPTION,
				inLanguage: 'en',
				publisher: { '@id': PERSON_ID }
			},
			{
				'@type': 'WebPage',
				'@id': `${SITE}/#webpage`,
				url: `${SITE}/`,
				name: 'Clarity - canvas image filters, live',
				description: DESCRIPTION,
				isPartOf: { '@id': `${SITE}/#website` },
				about: { '@id': `${SITE}/#app` },
				primaryImageOfPage: { '@id': `${SITE}/#screenshot` },
				inLanguage: 'en'
			},
			{
				'@type': 'ImageObject',
				'@id': `${SITE}/#screenshot`,
				url: OG_IMAGE,
				contentUrl: OG_IMAGE,
				width: 2472,
				height: 1267,
				caption: OG_IMAGE_ALT
			},
			{
				'@type': 'WebApplication',
				'@id': `${SITE}/#app`,
				name: 'Clarity Playground',
				alternateName: 'Clarity image filter playground',
				url: `${SITE}/`,
				description: DESCRIPTION,
				applicationCategory: ['MultimediaApplication', 'DeveloperApplication'],
				operatingSystem: 'Any (web browser)',
				browserRequirements: 'Requires JavaScript. Uses WebGL2 where available, and falls back to CPU where it is not.',
				permissions: 'Optional camera access, used only to render your webcam locally.',
				screenshot: { '@id': `${SITE}/#screenshot` },
				author: { '@id': PERSON_ID },
				isBasedOn: { '@id': `${SITE}/#library` },
				mainEntityOfPage: { '@id': `${SITE}/#webpage` },
				// Every filter, by name, so the app's capabilities are machine-readable
				// rather than a paragraph of prose a crawler has to guess at.
				featureList: FILTERS.map(([name, entry]) => `${name} - ${entry.summary}`),
				offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
				isAccessibleForFree: true
			},
			{
				'@type': 'SoftwareSourceCode',
				'@id': `${SITE}/#library`,
				name: '@calrk/clarity',
				description: `A dependency-free canvas image-filter library: ${FILTERS.length} composable filters over ImageData, running as fragment shaders with a CPU implementation of every one behind them.`,
				codeRepository: REPO,
				url: PACKAGE,
				programmingLanguage: 'TypeScript',
				runtimePlatform: ['Web browser', 'Node.js'],
				license: 'https://opensource.org/licenses/MIT',
				author: { '@id': PERSON_ID }
			},
			{
				'@type': 'FAQPage',
				'@id': `${SITE}/#faq`,
				isPartOf: { '@id': `${SITE}/#webpage` },
				mainEntity: FAQ.map(({ q, a }) => ({
					'@type': 'Question',
					name: q,
					acceptedAnswer: { '@type': 'Answer', text: a }
				}))
			}
		]
	};
}

/** JSON is not HTML: a `</script>` anywhere in a summary would end the block early. */
const embed = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

/** @returns {import('vite').Plugin} */
export default function seo() {
	return {
		name: 'clarity-seo',
		transformIndexHtml: {
			// before Vite's own HTML handling, so the injected footer's links and
			// the asset references in it are processed like the rest of the page
			order: 'pre',
			handler(html) {
				return {
					html: html
						.replace(/{{FILTER_COUNT}}/g, String(FILTERS.length))
						.replace(/{{DESCRIPTION}}/g, escape(DESCRIPTION))
						.replace('<!-- seo:footer -->', footer()),
					tags: [
						{
							tag: 'script',
							attrs: { type: 'application/ld+json' },
							children: embed(jsonLd()),
							injectTo: 'head'
						}
					]
				};
			}
		}
	};
}
