// Snippets worth starting from.
//
// The counterpart to PRESETS, and a different kind of artifact: a preset is a
// chain and shows a *look*, a snippet is code and shows the API. That makes
// them documentation, which means they rot - the eight example pages this
// playground replaced did not fail loudly, they quietly stopped working and
// nobody noticed for years.
//
// So `test/site.test.js` runs every one of these in the real page and asserts
// it returns something that changes pixels. An example that cannot compile
// fails the build.
//
// They are written the way an application would be, because that is the point
// of the panel: `new Renderer(canvas).source(image).add(...)` is the first
// example in the README, and it is exactly what the Build tab's Code panel
// prints. `canvas` and `image` are in scope - the page's canvas, and whichever
// source is selected in the row above.

/** @typedef {{ id: string, label: string, note: string, source: string }} Snippet */

/** @type {Snippet[]} */
export const SNIPPETS = [
	{
		id: 'cartoon',
		label: 'Cartoon',
		note: 'The Build tab preset, written out',
		source: `// Every filter is in scope by name, and so are \`canvas\` and \`image\` - the
// page's canvas, and whichever source is selected above. Hand the renderer
// back and the page drives the frame loop.
//
// This is the Cartoon preset from the Build tab. Bilateral first is what
// makes it work: Posteriser on its own quantises a photograph into a
// photograph with banding, because the noise is still there deciding which
// band each pixel lands in. Smoothing without losing edges turns a face into
// a handful of regions to quantise instead.

const renderer = new Renderer(canvas)
  .source(image)
  .add(new Bilateral({ radius: 5, similarity: 50, iterations: 3 }))
  .add(new Posteriser({ colours: 8 }))
  .add(new hsvShifter({ saturation: 1.2 }));

return renderer;`
	},
	{
		id: 'generated',
		label: 'Generated',
		note: 'A field made from nothing, and driven by the clock',
		source: `// Starters ignore their input, so this pays no attention to the picture you
// have selected - it draws its own. There is still a source, because the
// frame it produces is what sets the size of everything downstream.
//
// \`seed\` pins the cloud. Leave it out and Cloud picks one when it is
// constructed and keeps it - still stable, but a different field every time
// you press Run.
//
// Translator wraps at the edges, so \`speed\` scrolls the field forever with
// no seam. That is also what starts the page's frame loop: the source is a
// still image, but the chain is the moving part.

const renderer = new Renderer(canvas)
  .source(image)
  .add(new Cloud({ seed: 7, initialSize: 3, iterations: 5 }))
  .add(new GradientMap({ ramp: 'ice' }))
  .add(new Translator({ horizontal: 0.1, vertical: 0.02, speed: 0.15 }));

return renderer;`
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
// Gaussian than any single radius gives you.
//
// Change \`passes\` and the whole chain is rebuilt.

const passes = 6;
const renderer = new Renderer(canvas).source(image);

for (let i = 0; i < passes; i++) {
  renderer.add(new Blur({ radius: 2 }));
}

renderer.add(new Levels({ black: 20, white: 235 }));
return renderer;`
	},
	{
		id: 'chain',
		label: 'Just a chain',
		note: 'The short form, for when the renderer is not the interesting part',
		source: `// A bare Pipeline is accepted too, and the page wires it up for you.
//
// It is the headless half of the library - no canvas, no DOM, no frame loop -
// which is what lets the whole thing run and be tested in Node. When the
// chain is the only thing you are describing, it is all you need.

return new Pipeline([
  new Convolver({ preset: 'sobel' }),
  new Invert()
]);`
	}
];

/** The one loaded into an empty editor. */
export const DEFAULT_SNIPPET = SNIPPETS[0];
