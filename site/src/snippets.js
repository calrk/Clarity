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
		id: 'strength',
		label: 'Half strength',
		note: 'Any chain, dialled back to a percentage of itself',
		source: `// The thing a list of filters cannot say. A chain is at full strength or
// it is not there, and "I want about half of that" has no place to live -
// there is no dial, because the amount is not a property of any of the
// filters involved.
//
// It is a two-input filter. Put the effect in a branch, leave the
// photograph in the chain, and Blend between them.
//
// \`ratio\` is how much of the *first* frame survives, and the first frame
// here is the untouched picture - so 0.35 is a 65% effect. Change it and
// re-run; that number is the whole snippet.

const effect = new Pipeline([
  new Bilateral({ radius: 6, similarity: 60, iterations: 3 }),
  new Posteriser({ colours: 6 }),
  new hsvShifter({ saturation: 1.4 })
]);

return new Renderer(canvas)
  .source(image)
  .add(new Blend({ ratio: 0.35 }), { second: effect });`
	},
	{
		id: 'normals',
		label: 'Height to normals',
		note: 'A greyscale picture read as a surface, and lit as one',
		source: `// Pick the Height map source above to see this properly, though any
// picture works - it is only ever reading brightness as altitude.
//
// NormalGenerator writes a tangent-space normal map in the OpenGL
// convention: red is the surface tilting left and right, green up and
// down, blue how much it faces you. Flat is (128, 128, 255), which is the
// lavender that fills most of the result.
//
// The two steps before it matter more than the settings on it.
//
// Desaturate first, because height is one number and a colour is three -
// left to itself the generator would read the red channel and call it the
// landscape. Then Blur, because a normal is a *slope*, and a slope is the
// difference between neighbouring pixels: photographic noise one shade
// deep becomes a cliff face. Take the blur out and the surface reads as
// crumpled foil rather than ground.

const renderer = new Renderer(canvas)
  .source(image)
  .add(new Desaturate())
  .add(new Blur({ radius: 2 }))
  .add(new NormalGenerator({ intensity: 0.8 }))
  // Below 1 flattens the result, above 1 exaggerates it - and it is a
  // rescale of a finished normal map rather than a second read of the
  // heights, so it stays a unit vector and stays valid.
  .add(new NormalIntensity({ intensity: 1.2 }));

// The rest of the family, worth knowing about: NormalFlip swaps or negates
// the axes, for engines that disagree about which way green points -
// DirectX wants it the other way up. Contourer draws height as contour
// lines instead, which is the fastest way to see what the blur above did.

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
		id: 'dissolve',
		label: 'Dissolve',
		note: 'Two pictures trading places through a cloud, back and forth',
		source: `// A dissolve, which is a crossfade that happens in a different place at
// a different time - the shape of the transition is a picture in its own
// right, and here it is a ridged cloud, so one image eats the other along
// its valleys.
//
// Neither picture is the selected source. \`samples\` holds every still by
// id, so the chain here is scenery: it sets the size everything else is
// matched to, and nothing else.

const first = samples.face;
const second = samples.landscape;

// The shape of the transition. Ridged folding gives hills and valleys
// rather than smooth blobs, which is what makes the edge look torn
// instead of blurred.
const field = new Pipeline([
  new Cloud({ seed: 5, fold: 'ridged', initialSize: 3, iterations: 5 }),
  new Blur({ radius: 6 })
]);

// The moving part, and the only one. Everything above and below is still.
const cut = new ValueThreshold({ threshold: 128 });

// Threshold, then blur. That order is the whole trick: a threshold can
// only write black or white, so the sweep is clean and complete - at 0
// the matte is entirely white and at 255 entirely black - and the blur
// afterwards puts a soft edge back on it. Blur first and the extremes
// stop being reachable, so the transition never finishes.
const matte = new Pipeline()
  .add(cut, { first: field })
  .add(new Blur({ radius: 3 }));

const inverse = new Pipeline()
  .add(new Invert(), { first: matte });

// Multiply keeps a picture where its matte is white and blacks out the
// rest, so two of them cover the frame between them and Add puts the
// halves together. The matte's soft edge is what makes the seam a
// crossfade rather than a cut.
const front = new Pipeline().add(new Multiply(), { first, second: matte });
const back = new Pipeline().add(new Multiply(), { first: second, second: inverse });

// No filter can own this number, which is why it lives out here: nothing
// in the chain knows it is being dissolved. \`everyFrame\` runs after each
// frame the page draws, and registering it is also what starts the loop.
//
// A sine rather than a sawtooth so it turns around at each end instead of
// snapping back, and so it slows as it arrives.
everyFrame(() => {
  const t = (Math.sin(performance.now() / 2500) + 1) / 2;
  cut.setProperty('threshold', Math.round(t * 255));
});

return new Renderer(canvas)
  .source(image)
  .add(new Add(), { first: front, second: back });`
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
