// Snippets worth starting from.
//
// The counterpart to PRESETS, and a different kind of artifact: a preset is a
// chain and shows a *look*, a snippet is code and shows the API. That makes
// them documentation, which means they rot - the eight example pages this
// playground replaced did not fail loudly, they quietly stopped working and
// nobody noticed for years.
//
// So `test/site.test.js` runs every one of these in the real page and asserts
// it returns a Pipeline that changes pixels. An example that cannot compile
// fails the build.

/** @typedef {{ id: string, label: string, note: string, source: string }} Snippet */

/** @type {Snippet[]} */
export const SNIPPETS = [
	{
		id: 'cartoon',
		label: 'Cartoon',
		note: 'The Build tab preset, written out',
		source: `// Every filter is in scope by name, and the snippet's job is to hand back
// a Pipeline. The page owns the source, the canvas and the frame loop.
//
// This is the Cartoon preset from the Build tab. Bilateral first is what
// makes it work: Posteriser on its own quantises a photograph into a
// photograph with banding, because the noise is still there deciding which
// band each pixel lands in. Smoothing without losing edges turns a face into
// a handful of regions to quantise instead.

return new Pipeline([
  new Bilateral({ radius: 5, similarity: 50, iterations: 3 }),
  new Posteriser({ colours: 8 }),
  new hsvShifter({ saturation: 1.2 })
]);`
	},
	{
		id: 'generated',
		label: 'Generated',
		note: 'A field made from nothing, and driven by the clock',
		source: `// Starters ignore their input, so this pays no attention to the source
// you have selected - it draws its own.
//
// \`seed\` pins the cloud. Leave it out and Cloud picks one when it is
// constructed and keeps it, which is still stable, but a different field
// every time you press Run.
//
// Translator wraps at the edges, so \`speed\` scrolls the field forever with
// no seam. That is also what makes the page start its frame loop: the source
// is a still image, but the chain is the moving part.

return new Pipeline([
  new Cloud({ seed: 7, initialSize: 3, iterations: 5 }),
  new GradientMap({ ramp: 'ice' }),
  new Translator({ horizontal: 0.1, vertical: 0.02, speed: 0.15 })
]);`
	},
	{
		id: 'computed',
		label: 'Computed',
		note: 'A chain whose length is worked out rather than typed',
		source: `// What a list cannot express, and the cheapest demonstration of why this
// panel exists: the chain is built by a loop.
//
// Repeated small blurs are not one large blur. Each pass re-reads what the
// last one wrote, so the falloff compounds into something closer to a
// Gaussian than any single radius gives you - and the cost is linear in
// passes where one big radius is not.
//
// Change \`passes\` and the whole chain is rebuilt.

const passes = 6;
const chain = new Pipeline();

for (let i = 0; i < passes; i++) {
  chain.add(new Blur({ radius: 2 }));
}

chain.add(new Levels({ black: 20, white: 235 }));
return chain;`
	}
];

/** The one loaded into an empty editor. */
export const DEFAULT_SNIPPET = SNIPPETS[0];
