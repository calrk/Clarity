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
import { Blur, EdgeDetector, Invert } from '@calrk/clarity';

const ctx = canvas.getContext('2d');
ctx.drawImage(image, 0, 0);

const pipeline = [
	new Blur({ radius: 8 }),
	new EdgeDetector({ fast: true }),
	new Invert()
];

let frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
for (const filter of pipeline) {
	frame = filter.process(frame);
}
ctx.putImageData(frame, 0, 0);
```

Each filter takes a typed options bag, and exposes `properties` for live tweaking
plus `enabled` to bypass it without removing it from the chain. The two-input
filters (`AddSub`, `Blend`, `Mask`, `Multiply`) take `process([frameA, frameB])`.

A plain `<script>` build is also published, exposing everything on a `CLARITY`
global:

```html
<script src="dist/clarity.global.js"></script>
<script>
	const blur = new CLARITY.Blur({ radius: 8 });
</script>
```

### Outside the browser

Importing Clarity no longer needs a DOM. Node has no global `ImageData` though,
so headless callers must supply one:

```js
import { setImageDataFactory } from '@calrk/clarity';

setImageDataFactory((w, h) => new MyImageData(w, h));
```

The `Interface` helpers and every filter's `doCreateControls` still build real
DOM nodes, so those remain browser-only.

Development
-----------

```sh
npm install
npm run dev        # serves examples/ on http://localhost:8080
npm run build      # emits dist/ (ESM + UMD + global) and .d.ts files
npm run typecheck
npm test
```

`dist/` is generated and not committed - the examples load it, and the tests run
against it, so run `npm run build` once after cloning.

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
```

When a golden fails, the actual output and a visual diff are written to
`test/output/`. Never regenerate a golden to make a test pass without looking at
what changed.

Licence
-------

**MIT** - see [LICENSE](LICENSE).

The one remaining piece of third-party code is `src/vendor/StackBlur.js`, by
Mario Klingemann, which is also MIT. Its copyright notice is reproduced in
LICENSE and is baked into every built bundle.

Current Filters
===============

### Dual Input
#### Add/Subtract
Adds/Subtracts images from each other
#### Blend
Blends two images together, with optional weighting
#### Mask
Simple implementation of multiply, where white is shown and black is not
#### Multiply
Multiplies an image with a greyscale

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
Adds a small colour bleed effect to an image
#### Blur
Blurs an image
#### De-saturate
Removes colour from an image
#### Dot Remover
Cleans up outlying pixels in a binary image
#### Glow
Blurs an image, and then adds this to the original, to create a glowing effect
#### Hanover Bars
Applies Hanover Bars or Scan lines over an image
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
Thresholds the image based on a calculated or given pixel value

### Transform
#### Channel Separate
Translates the RGB channels of an image individually
#### Mirror
Flips the image in horizontal or vertical axis
#### Rotator
Rotates an image in 90 degree increments. Will crop a rectangular image to be square
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