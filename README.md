Clarity
=======

Canvas image filter library. Every filter is a class that takes `ImageData` and
returns `ImageData`, so filters compose into a pipeline by chaining them.

Install
-------

```sh
npm install @calrk/clarity
```

Usage
-----

```js
import { Renderer, Blur, EdgeDetector, Invert } from '@calrk/clarity';

const renderer = new Renderer(canvas)
	.source(video)
	.add(new Blur({ radius: 8 }))
	.add(new EdgeDetector({ fast: true }))
	.add(new Invert());

renderer.start();
```

`Renderer` owns the canvas, the source, the ordered chain and the frame loop.
`start()` runs a `requestAnimationFrame` loop; `render()` does one frame.
`move(from, to)`, `insert`, `remove` and `clear` reorder the chain live.

A single filter is just a function from `ImageData` to `ImageData`, so you can
skip all of that:

```js
const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
ctx.putImageData(new Blur({ radius: 8 }).process(frame), 0, 0);
```

Each filter takes a typed options bag, exposes `enabled` to bypass it without
removing it from the chain, and describes its own tweakable properties through a
[schema](#property-schemas). The two-input filters (`Add`, `Subtract`, `Blend`,
`Mask`, `Multiply`) take `process([frameA, frameB])`.

A plain `<script>` build is also published, exposing everything on a `CLARITY`
global:

```html
<script src="dist/clarity.global.js"></script>
<script>
	const blur = new CLARITY.Blur({ radius: 8 });
</script>
```

GPU
---

**Shaders are the default.** A `Pipeline` creates a WebGL2 context on first use
and runs every filter that has a shader as a fragment shader, ping-ponging two
framebuffers so an N-filter chain is N draw calls with no CPU round-trip in
between. Where WebGL2 is missing — Node, an old browser, a lost context — it
falls back to the CPU silently.

```js
const pipeline = new Pipeline([new Desaturate(), new EdgeDetector()]);
pipeline.usingGPU;            // false when WebGL2 could not be had
pipeline.run(frame);
pipeline.stats.backend;       // 'gpu' | 'cpu' | 'mixed'
pipeline.stats.fallbacks;     // which stages ran on the CPU, and why
pipeline.stats.transfers;     // times the frame crossed between the two

new Pipeline(filters, { gpu: false });   // opt out
```

**Every filter has a shader**, so in a browser the whole chain runs on the GPU.
Fallback is still **per stage** rather than all-or-nothing, for the cases where
a shader can't compile or a filter's options aren't covered: one stage dropping
to the CPU doesn't drag the rest with it. Each maximal run of shader stages is
uploaded once, ping-ponged through, and read back once.

The CPU implementation stays the reference. It's the oracle the parity tests
compare against and the fallback when there's no GL, so a filter isn't finished
until both paths exist and agree — `npm run test:gpu` runs every case through
both and compares.

### Writing a shader

A filter declares one, compiled against a prelude that supplies the source
texture, the frame size, the channel selector and a `u_<key>` uniform per schema
property:

```js
class Invert extends Filter {
	static shader = `
		void main(){
			writeRGB(vec3(255.0) - srcPixel(vUv).rgb);
		}
	`;
}
```

Colours are handled in **0–255 space**, matching what the CPU implementations
compare against. `static supportsGPU(filter)` says when a shader covers only
some of the filter's options; an array of passes handles the multi-draw cases.

A pass may also declare a `reduce` shader, for filters that need to know
something about the whole frame first. It maps each pixel to the quantity being
reduced; a pyramid of halving passes collapses that to one texel, which the
filter reads back with `reduction()` as (min, max). That is how `Invert`'s
dynamic mode, `Contourer` and `ValueThreshold`'s auto mode get the frame's range
without a readback.

Four more hooks cover what a plain fragment shader can't reach. Each is a
`static` on the filter:

| | for | in the shader |
|---|---|---|
| `outputSize` | a filter that changes the frame's size — `Rotator` | `uOutSize` |
| `retains` | previous frames — `Ghoster`, `MotionDetector` | `historyTexel(age, p)` |
| `data` | per-instance arrays — `Puzzler`'s shuffle | `dataTexel(x, y)` |
| `samples` + `prepare` | whole-image statistics — `Posteriser`'s palette | via `data` |

`samples` is the interesting one. A filter that must see every pixel before it
can decide anything — a median-cut palette, a set of quartiles — asks for a
small point-sampled copy, and `prepare` is handed it before the shader runs.
That is a thumbnail rather than the frame, so it costs about 1% of a readback.
The CPU path calls the same `prepare` with the same sample, so both backends
derive their answer from identical pixels.

Filters needing an earlier pass's input declare nothing — a shader mentioning
`uOriginal` gets the stage's input stashed aside for it automatically.

Pipelines
---------

`Pipeline` is the headless half of `Renderer` — an ordered filter list with no
canvas, no DOM and no frame loop. Use it directly outside the browser, or as the
chain behind your own render loop:

```js
const pipeline = new Pipeline([new Desaturate(), new ValueThreshold({ threshold: 120 })]);
const out = pipeline.run(frame);
```

It only recomputes what can have changed. Everything upstream of the first stage
that is dirty, impure or newly reordered comes out of a cache, so tweaking the
last filter in a long chain doesn't redo the ones before it — and an unchanged
chain on an unchanged frame does no work at all. `pipeline.stats` reports where
the time went and how many stages were skipped.

That requires knowing which filters are safe to cache, so each declares itself:

- `static stateful` — output depends on frames already seen (`Ghoster`,
  `MotionDetector`, `DifferenceDetector`). Must see every frame, in order.
- `static varying` — output changes between calls on identical input, because
  the filter reads the clock or the random source (`Wave`, `Noise`, `Cloud`).

Neither is ever cached. Everything else is pure and is.

A stateful filter's history is thrown away — `reset()` — whenever it stops
being trustworthy: the chain is edited, the filter is removed, one of its
properties changes, or it moves between the CPU and the GPU. That last one
matters because the two keep separate histories, and blending them makes a
trail jump.

### Two-input filters

`Add`, `Subtract`, `Blend`, `Mask` and `Multiply` need a second frame, which a
stage supplies:

```js
const maskChain = new Pipeline([new Desaturate(), new ValueThreshold()]);

new Pipeline()
	.add(new Blur({ radius: 6 }))
	.add(new Mask(), { second: maskChain });
```

`second` takes an `ImageData`, a function returning one, or another `Pipeline` —
which is fed the outer run's *source*, so it branches off the input rather than
continuing the chain.

Property schemas
----------------

Every filter carries a `static schema` describing its properties — what each one
means, and what values are legal:

```js
Blur.schema
// { radius: { type: 'int', label: 'Radius', min: 1, max: 180, step: 1, default: 10 } }
```

Clarity ships **no UI code**. The schema is metadata, so build controls however
you like — `site/src/controls.js` is a ~130-line plain-DOM renderer that handles
every filter in the library, and a framework version is shorter still:

```svelte
{#each Object.entries(filter.schema) as [key, field]}
	<label>{field.label}</label>
	{#if field.type === 'bool'}
		<input type="checkbox" checked={filter.getProperty(key)}
			on:change={(e) => filter.setProperty(key, e.target.checked)}>
	{:else}
		<input type="range" min={field.min} max={field.max} step={field.step}
			value={filter.getProperty(key)}
			on:input={(e) => filter.setProperty(key, e.target.value)}>
	{/if}
{/each}
```

Always write through `setProperty`. It coerces per the schema, clamps to the
declared range, and rebuilds any derived state — a DOM input hands back a
*string*, so assigning to `properties` directly leaves you with `radius: "10"`,
which works in some arithmetic and silently breaks the rest.

Field types are `int`, `float`, `bool` and `select`. A numeric field may be
`nullable`, meaning `null` is legal and stands for "derive this from the frame"
— `ValueThreshold`'s auto mode is the one that uses it.

### Outside the browser

Clarity has no DOM dependency at all. Node has no global `ImageData` though, so
headless callers must supply one:

```js
import { setImageDataFactory } from '@calrk/clarity';

setImageDataFactory((w, h) => new MyImageData(w, h));
```

Development
-----------

```sh
npm install
npm run dev        # the playground, with the library loaded from source
npm run build      # emits dist/ (ESM + UMD + global) and .d.ts files
npm run typecheck
npm test
```

`dist/` is generated and not committed - the tests run against it, so run
`npm run build` once after cloning.

### Playground

`site/` is a single-page playground: pick a source, drag filters into a chain,
and watch it run. It is also the demo, so it doubles as the answer to "what does
this library actually do".

```sh
npm run site           # dev server, library loaded from src/ rather than dist/
npm run site:build     # static build into site/dist
npm run deploy         # build, then wrangler deploy to Cloudflare
```

It builds nothing the library does not already expose: the palette comes from
`CATALOGUE`, the controls from each filter's schema, the code panel from the
chain itself. That is the test of whether the metadata is any good - if a new
filter needs the playground edited, the metadata was not enough.

Chains live in the URL - `#photo/Blur,radius=8/Invert` - so a link reproduces an
exact stack. A dropped file joins the source list for the session; nothing is
uploaded anywhere, so it only exists in that tab.

Deployment is an assets-only Cloudflare Worker (`wrangler.jsonc`), so there is
no server code.

### Tests

Filter output is pinned by golden images in `test/golden/`, one per case,
compared exactly. Filters that use randomness or time take injectable `random`
and `now` options so their output is reproducible:

```js
import { Noise, seededRandom } from '@calrk/clarity';

new Noise({ intensity: 40, random: seededRandom(1) });   // same result every run
```

```sh
npm run test:golden           # goldens only
npm run test:update-golden    # regenerate them, then review the diff before committing
npm run test:fixtures         # regenerate the input images in test/fixtures/
npm run test:sheet            # build the contact sheet (below)
```

When a golden fails, the actual output and a visual diff are written to
`test/output/`. Never regenerate a golden to make a test pass without looking at
what changed.

### Contact sheet

`npm run test:sheet` builds `test/contact-sheet/index.html` - a single
self-contained page showing every filter's input and output side by side, with
what each filter does and what you should be able to see. Each card reports the
percentage of pixels the filter actually changed, and any filter that changed
*nothing* is highlighted, which is the quickest way to spot one that has
silently stopped working.

Open it in a browser after `npm run build && npm run test:update-golden`.

Licence
-------

**MIT** - see [LICENSE](LICENSE).

The one remaining piece of third-party code is `src/vendor/StackBlur.js`, by
Mario Klingemann, which is also MIT. Its copyright notice is reproduced in
LICENSE and is baked into every built bundle.

Current Filters
===============

### Dual Input
#### Add
Adds the second image to the first, clamping at white
#### Subtract
Subtracts the second image from the first, clamping at black
#### Blend
Blends two images together, with optional weighting
#### Mask
Binary stencil - keeps the first image where the mask is light, blacks it out
where the mask is dark. Unlike `Multiply` the cut-off is hard, so a pixel is
either fully kept or fully dropped
#### Multiply
Multiplies two images together channel by channel, so grey attenuates rather
than cuts

### Height Map
#### Contourer
Shows the contours in a height map
#### Normal Flip
Will flip the x/y axis values, or swap the x/y axis with each other
#### Normal Generator
Generates a normal based on a height map
#### Normal Intensity
Edits the intensity of a normal map

### Misc
#### Brickulate
Will draw a grid pattern over an image, to turn it into bricks/tiles
#### Difference Detector
Will detect differences in a scene, based on the first shot
#### Ghoster
Adds a ghosting/onion skin effect to a video
#### Puzzler
Scrambles up the image like a puzzle

### Process
#### Bleed
Composite-video colour bleed - chroma is smeared sideways while luma stays
sharp, so colour runs past edges without softening detail
#### Blur
Blurs an image
#### De-saturate
Removes colour from an image
#### Dot Remover
Cleans up outlying pixels in a binary image
#### Glow
Blurs an image, and then adds this to the original, to create a glowing effect
#### Hanover Bars
Treats every third and fourth line differently - rotating their chroma, which is
the PAL delay-line artefact, or darkening them into scan lines
#### HSV Shifter
Allows editing an images hue/saturation/lightness values
#### Invert
Inverts an image's colour
#### Noise
Adds variable noise to an image, can be monochromatic
#### Pixelate
Pixelates the image to a fixed size per pixel
#### Posterise
Reduces an image into a fixed number of colours
#### Sharpen
Applies a sharpening mask to an image, to enhance edges/detail
#### Smoother
Simple neighbouring blur function

### Salience
#### Edge Detector
Detects the edges in a scene
#### Motion Detector
Detects any motion between a series of frames
#### Skin Detection
Detects skin in a scene. Relies on correct lighting.

### Starters
#### Cloud
A filter that fills the canvas with Perlin Noise, with an RGB input for colour
#### FillHSV
Will fill a canvas with a blank colour, based on HSV input
#### FillRGB
Will fill a canvas with a blank colour, based on RGB input

### Thresholders
#### Gradient Thresholder
Thresholds over changes in gradient in an image, resulting in edge detection
#### Median Thresholder
Colour quantisation over median and quartile pixel values
#### Value Thresholder
Thresholds the image at a given value, or at the midpoint of the frame's own
range

### Transform
#### Chromatic Aberration
Displaces the red and green channels in opposite directions, growing toward the
edges of the frame like a lens does - or uniformly, with `fixed`
#### Mirror
Flips the image in horizontal or vertical axis
#### Rotator
Rotates an image in 90 degree increments. A quarter turn of a non-square frame
swaps its dimensions, or crops it to a centred square with `fit: 'crop'`
#### Tiler
Will tile an image so it's edges all line up
#### Translator
Will move an image in horizontal or vertical axis based on a percentage
#### Wave
Translates the pixels of an image according to a mathematical function


Filters to be made
==================
#### Skeletiser
Will draw the skeleton of the image
#### Histogram
Will output a visual histogram of an image, or just the histogram values
#### Bloat/Erode
Will expand/reduce blobs in a binary image
#### Crackulate
Will draw procedural cracks over a texture
#### Laplace Edge
Implement edge detection with a faster algorithm
#### Sobel Edge
Implement edge detection with another more complex algorithm
#### Custom kernel
Allow a custom 3x3 kernel to be used over an image.
#### Shot Detector
Will detect scene changes in a video
#### Emboss
Embosses an image
#### Sepia
Applies a sepia effect to an image
#### Target finder
Highlights a particular point of interest in an image
#### Screen burn
Adds screen burn effect to a video, similar to ghosting
#### Dot crawl
Adds a dot crawl effect

Other things to work on
=======================

Now tracked properly in [FEATURES.md](FEATURES.md), which covers the GPU/shader
backend, the renderer object, the dirty-flag skip, and the rest - each grounded
in the code with an effort rating and a priority order.