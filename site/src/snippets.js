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
		id: 'watercolour',
		label: 'Watercolour',
		note: 'Diluted washes, pigment stranded at every rim, and paper underneath',
		source: `// Four ideas in order: flatten the picture into regions, thin the pigment
// until the paper shows through, strand what is left at the region
// boundaries, then put the whole thing on paper.
//
// The Comic snippet's cousin - same ink branch, same reason the flattening
// appears twice - with dilution and paper where that one has Ben-Day dots.
// None of it can be a preset: every stage past the first needs a second
// input, and a chain string has nowhere to say where one comes from.

const white = () => new Pipeline([new Fill({ colour: 'ffffff' })]);

// Where the paint runs. A cloud read as a normal map is a field of
// two-axis offsets, and \`Displace\` moves each pixel by the one underneath
// it, so boundaries wander rather than bend. \`Wave\` was here first and
// gave the whole frame the same wobble on a fixed wavelength - which reads
// as corrugation rather than as a wet edge the moment you turn it up.
//
// The Blur is not optional. A normal is a *slope*, so an unblurred cloud
// is a field of cliffs and the picture tears along them instead of
// flowing.
const bleed = () => new Pipeline([
  new Cloud({ seed: 4, initialSize: 5, iterations: 4 }),
  new Blur({ radius: 6 }),
  new NormalGenerator({ intensity: 0.9 })
]);

// Both chains below need every one of these, and they must be *their own*
// copies - two pipelines sharing a filter object share its state and its
// dirty flag. Hence a function that builds onto a chain rather than an
// array to spread.
const flatten = (chain) => chain
  // Displace first, so the wander lands in the region shapes rather than
  // on top of a picture whose shapes have already been decided.
  .add(new Displace({ amount: 7 }), { second: bleed() })
  // The Cartoon preset's pairing, unchanged and for the reason written
  // there. A few more colours than Cartoon takes, because a wash is not a
  // cel.
  .add(new Bilateral({ radius: 6, similarity: 45, iterations: 3 }))
  .add(new Posteriser({ colours: 12 }))
  // Saturation up *before* the dilution below, never after. Thinning paint
  // drops saturation and lifts value together, so pre-loading it is what
  // keeps the result from going chalky.
  .add(new hsvShifter({ saturation: 1.6 }));

// The dilution, and the single step that separates watercolour from poster
// paint. \`ratio\` is how much of the first frame survives and the first
// frame is the paint, so 0.78 is a fairly wet mix. Turn this one first.
const wash = () => flatten(new Pipeline())
  .add(new Blend({ ratio: 0.78 }), { second: white() });

// Edge darkening: the pigment stranded at the rim of a wash as it dries.
// Take this layer out and what is left is a posterised photograph.
//
// It re-derives the washes rather than being handed them, because a branch
// runs against the chain's *source* and not the frame at the point it is
// used - the constraint the Comic snippet documents. Both chains have to
// flatten identically or the ink lands where the colour boundaries are
// not, which is also why every seed here is written down rather than left
// to be drawn.
const ink = () => flatten(new Pipeline())
  // On the washes this traces region boundaries. On the photograph it
  // would trace every branch in the treeline, which is the whole
  // difference between an ink line and a scribble.
  .add(new GradientThreshold({ threshold: 18, distance: 1 }))
  // Hands back the greys a thresholder cannot write, so the Multiply below
  // lands a soft edge rather than a jagged one.
  .add(new Blur({ radius: 2 }))
  .add(new Invert())
  // A second, smaller displacement on the line alone, so it wanders off
  // the wash it belongs to. A pen and a brush never register perfectly,
  // and the picture looks printed when they do.
  .add(new Displace({ amount: 3 }), {
    second: new Pipeline([
      new Cloud({ seed: 21, initialSize: 4, iterations: 3 }),
      new Blur({ radius: 5 }),
      new NormalGenerator({ intensity: 0.9 })
    ])
  })
  .add(new Blend({ ratio: 0.45 }), { second: white() });

// Paper. Multiply only ever darkens, so a mid-grey cloud sinks the whole
// picture - each field has to be pulled most of the way to white first,
// and then it tints instead of dimming. Levels cannot do that pull: it
// stretches, so raising the black point on a field that peaks near 200
// clips it away rather than lifting it.
//
// Two scales, because paper has two: a coarse cockle and a fine tooth.
const paper = (seed, initialSize, iterations, amount) =>
  new Pipeline([new Fill({ colour: 'ffffff' })])
    .add(new Blend({ ratio: 1 - amount }), {
      second: new Pipeline([
        new Cloud({ seed, initialSize, iterations, persistence: 0.55 })
      ])
    });

return new Renderer(canvas)
  .source(image)
  // \`first\` because the washes are the picture here rather than an
  // argument to it. Without it one of the two branches would have to be
  // written differently from the other for no reason but where it sits.
  .add(new Multiply(), { first: wash(), second: ink() })
  .add(new Multiply(), { second: paper(7, 6, 5, 0.13) })
  .add(new Multiply(), { second: paper(11, 16, 3, 0.09) });`
	},
	{
		id: 'river',
		label: 'River',
		note: 'One distance field, giving the channel, the banks and the depth at once',
		source: `// A texture rather than an effect: nothing above is used but the size of
// the frame, so pick any source you like.
//
// What makes a river harder than fog or paper is that it has a *subject*.
// Noise can be scattered anywhere; a river has to be somewhere in particular
// and be the same river all the way down the frame, and the water, the banks
// either side of it and the shading within it all have to agree about where
// that is.
//
// They do here because they are all read off one greyscale image. A ramp
// across the frame, bent, and then Difference against flat mid-grey - which
// gives \`|value - 128|\`, the distance from the line where the ramp reads 128.
// Threshold that near zero and you have the channel; threshold it wider and
// the ring around the channel is the bank; map it through a blue ramp and it
// is the water's depth, pale along the middle and darkening to both edges,
// because distance from the centreline is exactly what that shading is.
//
// Built as three separate fields they would drift apart and the bank would
// stop following the water.
//
// Difference is doing something slightly unusual to earn that. It is a
// compositing filter, meant for comparing two pictures - against a flat grey
// it is an absolute-value operator instead. There is no \`abs\` filter in the
// library and this is it.

const flat = () => new Pipeline([new Fill({ colour: '808080' })]);

// \`a * (1 - m) + b * m\`, per pixel: the cross-fade the library has no single
// filter for, and the workhorse of the whole snippet. Every layer here is
// "this picture, except where that mask says otherwise".
const lerp = (under, over, mask) => new Pipeline()
  .add(new Add(), {
    first: new Pipeline().add(new Multiply(), {
      first: under,
      second: new Pipeline().add(new Invert(), { first: mask })
    }),
    second: new Pipeline().add(new Multiply(), { first: over, second: mask })
  });

// Pulls a field toward mid-grey so it can nudge something without taking it
// over. \`keep\` is how much of the field survives.
const gentle = (chain, keep) => new Pipeline()
  .add(new Blend({ ratio: keep }), { first: chain, second: flat() });

// --------------------------------------------------------------- the course
// A ramp is a field whose contours are vertical lines. Bend those and you have
// a river, and *how* you bend them decides what kind of one.
//
// Both bends are here on purpose and they do different jobs. Wave shifts each
// row sideways by a sine of its own y - a shift that is constant along the
// flow, so it moves the channel without changing its width anywhere. That is a
// clean bend, and on its own it is also unmistakably a sine.
//
// The cloud is what stops it looking drawn by a computer: it varies along the
// channel as well as across it, so the banks wander, pinch and swell
// independently, which is what a river does and what a sine cannot do at any
// amplitude.
//
// \`speed: 0\` because Wave reads the clock - left alone it animates, and a
// texture that renders differently every frame is not a texture.
//
// Both of Wave's numbers are distances in pixels rather than proportions of
// the frame, and its ceiling is 100 - so on a much larger picture than the
// 1024px sources here the same pair gives a straighter river. \`ratio\` is the
// dial to reach for then: less sine, more cloud.
const course = new Pipeline()
  .add(new Gradient({ shape: 'linear', angle: 0, start: 12, end: 244 }))
  .add(new Wave({ axis: 'horizontal', frequency: 100, amplitude: 96, speed: 0 }))
  .add(new Blend({ ratio: 0.68 }), {
    second: gentle(
      new Pipeline([new Cloud({ seed: 1, initialSize: 2, iterations: 4 })]),
      0.9
    )
  });

// Zero along the river's line, rising away from it in both directions.
const distance = new Pipeline().add(new Difference(), { first: course, second: flat() });

// Bright at the centreline instead, which is the way round a mask wants it.
const nearness = new Pipeline().add(new Invert(), { first: distance });

// Three cuts of that one field. Levels with the black and white points close
// together is a soft threshold: everything below is black, above is white, and
// the narrow span between them is the only part that stays grey - which is the
// anti-aliased edge. Water is the narrowest cut, the bank sits just outside
// it, and \`damp\` is wider still, somewhere for the grass to change colour
// before it reaches the rock so the transition is not a line.
const water = new Pipeline().add(new Levels({ black: 230, white: 240 }), { first: nearness });
const bank = new Pipeline().add(new Levels({ black: 216, white: 228 }), { first: nearness });
const damp = new Pipeline().add(new Levels({ black: 200, white: 216 }), { first: nearness });

// ---------------------------------------------------------------- the land
// A ramp for the lie of the land and a billowed cloud for the lumps in it,
// then a gradient map to turn one number per pixel into grass. \`steps\`
// because painted scenery has flat areas of colour with edges between them,
// where a smooth ramp reads as an airbrush.
//
// The cloud is the larger share of that blend, and it has to be. Banding a
// field that is mostly a straight ramp puts every band boundary on a straight
// line, so the grass ends up striped across the frame - the steps only read as
// terrain once the thing being stepped is lumpy.
const meadow = new Pipeline()
  .add(new Gradient({ shape: 'linear', angle: 90, start: 186, end: 116 }))
  .add(new Blend({ ratio: 0.42 }), {
    second: gentle(
      new Pipeline([
        new Cloud({ seed: 2, fold: 'billow', initialSize: 4, iterations: 5, persistence: 0.55 })
      ]),
      0.7
    )
  })
  .add(new GradientMap({
    steps: 8,
    stops: [[0, 74, 116, 52], [0.42, 104, 146, 60], [0.74, 138, 176, 76], [1, 174, 202, 98]]
  }))
  // Takes the stair-step edges off the bands without softening them away.
  .add(new Blur({ radius: 5 }));

// ---------------------------------------------------------------- the water
// The depth shading, and the payoff for building the field first. Levels
// stretches the first 24 values of the distance field across the full range,
// so the ramp below spends all of itself inside the channel: pale at the
// centreline, deep at both edges, and registered with the banks exactly
// because it is the same measurement they were cut from.
const depth = new Pipeline()
  .add(new Levels({ black: 0, white: 24 }), { first: distance })
  .add(new GradientMap({
    stops: [[0, 172, 214, 234], [0.4, 96, 158, 204], [1, 50, 104, 158]]
  }));

// ------------------------------------------------------------- the assembly
// Widest band first, narrowest last. Painting the damp ground, then the rock
// over it, then the water over that means the bank is whatever is left showing
// between the last two - no subtraction anywhere, and the three cannot come
// apart.
const ground = lerp(meadow, new Pipeline([new Fill({ colour: '4a6a34' })]), damp);
const banked = lerp(ground, new Pipeline([new Fill({ colour: '483826' })]), bank);
const river = lerp(banked, depth, water);

// A stage with \`first\` ignores whatever reached it, so the picture the page
// is showing gets no further than setting the size - which is all a texture
// wants from it.
return new Renderer(canvas)
  .source(image)
  .add(new Vignette({ amount: 0.45, radius: 0.42, softness: 1.1 }), { first: river });`
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
