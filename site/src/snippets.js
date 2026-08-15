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
		id: 'fog',
		label: 'Drifting fog',
		note: 'Two cloud fields crossing, laid over the picture',
		source: `// Two chains, built the same way and pointed in different directions,
// laid over the photograph.
//
// A Pipeline is a valid input on either side of a two-input filter, which
// is what makes this possible at all - the drag list can only describe one
// straight chain, and this is three of them. Each fog is a branch: it never
// sees the picture, it just produces a frame for Multiply to combine with.
//
// Nothing here is special-cased. \`drift\` is an ordinary function that
// returns a Pipeline, so "two fogs" is two calls, and "five fogs" would be
// a loop.

const drift = (horizontal, vertical, seed) => new Pipeline([
  // Starters ignore their input, so it does not matter what a branch is
  // fed - only that it hands back a frame the right size.
  new Cloud({ seed, initialSize: 3, iterations: 5 }),
  // How thick the fog is. Multiply only ever darkens, so the black point
  // is the control that matters: raise it for a heavier bank of it.
  new Levels({ black: 25, white: 255, gamma: 1.7 }),
  new Blur({ radius: 8 }),
  // The motion. Translator wraps at the edges, so a field scrolls forever
  // with no seam - and this is the only moving part in the whole chain.
  new Translator({ horizontal, vertical, speed: 0.05 })
]);

const across = drift(0.3, 0, 7);
const upward = drift(0, -0.3, 21);

// The two fogs crossing. Neither of them is "the chain" and the other one
// an argument - they are peers, and \`first\` is what lets the code say so.
// Without it one of the two has to be written differently from the other
// for no reason but where it sits.
//
// The picture is not involved at this point, which is the giveaway: a
// stage with a \`first\` ignores whatever reached it and starts again.
const fog = new Pipeline()
  .add(new Multiply(), { first: across, second: upward });

// And now the photograph, with the weather laid over it. Multiply only
// darkens, so this is the pass that puts the fog in front.
return new Renderer(canvas)
  .source(image)
  .add(new Multiply(), { second: fog });`
	},
	{
		id: 'comic',
		label: 'Comic book',
		note: 'Flat colour with black ink over it, both drawn from the same photo',
		source: `// Flat colour, with the ink laid over the top by a Multiply.
//
// The ink is a branch, and a branch is handed the outer chain's *source* -
// not the frame at the point it is used. That is what this needs: the
// outlines have to come from the photograph, because by the time the main
// chain reaches the Multiply it is already flat colour with no edges left
// to find.
//
// Which is why the smoothing and the posterise appear twice. It is not
// repetition for its own sake - both chains have to flatten the picture the
// same way, or the ink lands somewhere the colour boundaries are not.

const flatten = { radius: 6, similarity: 60, iterations: 3 };

const ink = new Pipeline([
  new Bilateral(flatten),
  new Posteriser({ colours: 6 }),
  // Posterising *before* looking for edges is what makes them findable: a
  // band boundary is a cliff, where the original photograph only has a
  // gentle slope. Take this out and the ink nearly disappears.
  new GradientThreshold(),
  // Thicken the line. Dilate grows light regions, and at this point the
  // lines are still white on black.
  new Morphology({ radius: 2 }),
  // Now black on white, which is what Multiply needs - it can only darken,
  // so the paper has to be white or it darkens the whole picture.
  new Invert(),
  // The anti-aliasing, and the whole answer to jagged outlines. A threshold
  // can only write black or white, so its edges are hard by construction;
  // blurring the line map gives the greys back and Multiply turns them into
  // a soft edge. Do not reach for Morphology 'open' here - a one-pixel line
  // is exactly the small light speck it exists to remove, and it will erase
  // the ink entirely.
  new Blur({ radius: 2 })
]);

return new Renderer(canvas)
  .source(image)
  .add(new Bilateral(flatten))
  .add(new Posteriser({ colours: 6 }))
  .add(new Multiply(), { second: ink });`
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
