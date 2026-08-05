# Clarity — Feature List

Clarity is a canvas image-filter library from 2014 — 41 filters across eight categories, all pure-JS `ImageData` loops, concatenated by Gulp 3 into one `CLARITY` global. The filter-chain design still holds up; everything around it (build, GPU, examples, tests) had aged out.

**All eight of the original features are done**, plus #13, which was not on the list. What follows is the record: what was built, and the decisions that were not obvious at the time. Items #9, #10, #12 and #14 are still open, and are additive rather than gaps — the library works without them. #15 is the exception: it is the one open item that closes a claim the shipped docs already make.

Each shipped entry keeps its original write-up in a collapsed block underneath, because the *reasoning* is the part worth keeping and it is often the part that turned out to be wrong.

## Where it stands

| | then | now |
|---|---|---|
| Build | Gulp 3, one global | TypeScript, Vite, ESM + UMD + global, `.d.ts` |
| Filters clean | 31 of 41, 4 hard crashes | 49 of 49, each with a golden image, a GPU parity case and a generated docs entry |
| GPU | none | every filter, 63/63 parity cases as shaders |
| Tests | none | 563, plus golden images, GPU parity, and browser-driven tests for the playground and the `<img>` action |
| Demo | 8 pages, broken for years | one playground, live and tested on every run, with stills, video and a webcam |
| Licence | GPL dependency | MIT throughout |

Bugs found along the way: **four crashing filters**, plus roughly two dozen quieter ones — an inverted mask, a filter that blurred the wrong channel, a colour-space round trip that was not the identity, an "average" that averaged nothing, and a filter whose default mode did nothing at all. Most were found by *looking at pictures* rather than by reading code, which is the strongest argument in here for the contact sheet.

---

## ~~1. Correctness Sweep — the bugs hiding in the current filters~~ ✓

**Effort: Low**

**Done.** All of the below are fixed in `src/`, and `build/` + `examples/js/` were regenerated (Gulp 3 can't run on modern Node, so the concat + uglify was reproduced by a one-off script — replacing it properly is #2).

Verified by running every filter headlessly over a synthetic frame with a stubbed canvas, twice each so stateful filters get a second pass. **Before: 31 of 41 filters clean, 4 hard crashes. After: 40 of 41 clean, 0 crashes**, plus 22 targeted behavioural assertions (mirror is an involution, Wave output is a permutation of its input, `ratio: 0` survives, Posteriser output is always a real palette entry, Puzzler permutes correctly on a non-square segment grid, and so on).

Three notes on judgement calls made along the way:

- **Posteriser's dead cache** was rewritten to match on *exact pixel equality* rather than the proximity test the original was reaching for. Proximity would have been faster but approximate — it can pick the wrong palette entry near a Voronoi boundary — and turning a dead branch into a lossy one isn't a bug fix. Equality still skips the palette search across flat regions, which is where the cost is.
- **`Cloud` still emits alpha `(red+green+blue)/3`** rather than 255, so with default options it produces a fully transparent image. That looks deliberate (alpha tracking the requested colour, for the WebGL-Material texture use), so it was left alone — but it's worth a decision.
- **`Rotator`'s non-square cropping** is still approximate. The 90°/180°/270° mapping is now correct and the operator-precedence bug is fixed, but the offset/crop path for non-square frames applies its offset to both axes and needs a proper rewrite.

**A second round of fixes came out of the contact sheet in #6** — which is the point of building it. Reading a filter is a poor way to find out whether it works; looking at 56 before/after pairs found five things in a minute that the headless smoke tests, the behavioural assertions and the golden suite had all passed clean:

- **`Posteriser`'s fast path rendered an empty canvas.** It stepped `i += 4` while guarding with `(i+1) % 4 == 0` — a test that only makes sense stepping one byte at a time, and which is therefore permanently false. The alpha branch never ran, so alpha stayed 0; green and blue were never written either.
- **`Pixelate` wrapped at the right edge.** It shrank `size` until it divided the frame *height*, which says nothing about the width, so on a 33-wide frame the last block sampled one pixel past the end of the row and picked up the *next row's* first pixel. Now a clamped gather, which also honours the requested block size instead of quietly reducing it.
- **`Tiler` had the same bug, plus a cross down the middle.** Scattering from 2×2 blocks meant an odd frame read past the end of a row and past the end of the buffer, and both halves landed on the centre row and column, writing them twice. Rewritten as a clamped gather; `Tiler.png` on the even fixture is byte-identical, which proves the rewrite equivalent where the old code was already right.
- **`Mask` was inverted** — it kept the image where the mask was *dark*. Flipped, and it now goes through `getColourValue` so the `channel` option applies and a coloured mask behaves sensibly. The obvious follow-up question is why it exists at all when `Multiply` is right there — the answer is that the old README description ("a simple implementation of multiply") was simply wrong. `Mask` has a hard cut-off, `Multiply` is continuous: a 50% grey mask over a value of 200 gives 200-or-0 under `Mask` and 100 under `Multiply`. Both are worth having; the docs now say so, and `threshold`/`inverted` options make the stencil properly controllable.
- **The `grey` channel wasn't exact.** The Rec. 601 red weight was `0.2989`, so the weights summed to `0.9999` and a neutral grey read back fractionally darker. Correcting it to `0.299` isn't enough either — that doesn't sum to 1 in binary floating point — so it now scales by 1000 and divides once, `299 + 587 + 114` being exactly `1000`. Six goldens moved by a single unit; nothing with a hard boundary changed. This is precisely the class of bug that only bites at a decision boundary, which is where it was found: a mask of exactly 128 fell on the wrong side of a threshold of 128.

Two structural changes came with them. **`AddSub` is now `Add` and `Subtract`** — a boolean that switches which operation runs is two filters wearing one coat, and splitting it keeps the shader path branch-free and the #12 fusion groups monomorphic. **`LIFX` is deleted**, along with its example, cases and goldens.

`DotRemover` was also flagged, but the filter was fine and the *fixture* was wrong: it's a clean-up pass for thresholded output, so a continuous-tone photo gave it nothing to do. It now runs on a binary fixture with salt-and-pepper specks. Expect it to be superseded by proper morphological bloat/erode in #9.

Original findings, for the record:

- **`DifferenceDetector` is dead code.** `src/filters/misc/DifferenceDetector.js:23` calls the bare `findDifference(colour2, colour1)` instead of `this.findDifference(...)` — a `ReferenceError` on the first non-null frame. This is exactly why the README says "(not working)". One `this.` fixes it. (It also stores `this.original = frame` **by reference**; the caller's `ImageData` gets mutated downstream, so the reference frame drifts. Copy it.)
- **`Ghoster` reads globals.** `src/filters/misc/ghoster.js:16` does `CLARITY.ctx.createImageData(width, height)` — `width`/`height` are globals that only happen to exist because every example file declares them. Use `frame.width`/`frame.height`. It also never declares `this.properties`, so `setInt`/`toggleBool` from the base class throw on it.
- **`Posteriser`'s cache never fires.** `src/filters/Process/posterise.js:47` tests `tempDist < prevDistance + 5` *before* `tempDist` is assigned — always `undefined`, always false. The "attempts to improve performance" branch is unreachable; the full palette search runs for every pixel. Either fix it (compare against the *previous pixel's* colour, not the previous distance) or delete it.
- **`Operations.colorDistance` has no `return`.** `src/helpers/operations.js:111` — the American spelling alias silently returns `undefined`.
- **`Pixel.setFromHSV` has two scale bugs.** `src/helpers/pixel.js:92` sets `f = this.h - i` where `i` is already `h/60`; it should be `h/60 - i`. And the `s == 0` grey shortcut (line 87) assigns `r = g = b = v` where `v` is 0–1 but r/g/b are 0–255, so every desaturated pixel comes out black. `this.v = max/256` (line 54) should be `/255`.
- **`Cloud` overruns its output.** `src/filters/Starters/Cloud.js:82` loops `k < data.length` where `data` is `w*h*3` long, then indexes `output.data[k*4]` — three times too many iterations, writing off the end of the `Uint8ClampedArray` for two thirds of the loop. Loop to `w*h`. The octave stepping (`size *= (z+1)` → 4, 8, 24, 96) is also not doubling; `size *= 2` gives proper Perlin octaves.
- **`RGBtoHSV` leaks globals.** `computedH` / `computedS` / `computedV` in `src/helpers/operations.js:16-25` are never declared — implicit globals that will hard-fail the moment the code runs in a module or under `'use strict'`. Fixing this is a prerequisite for #2.
- **The `fast` edge-detector path is unreachable from the examples.** `EdgeDetector` reads `options.fast`, but `examples/Image/main.js:20` and `examples/WebGL/main.js:20` both pass `{efficient:true}`. Nobody has ever seen that branch run.
- **`Blend` can't take ratio 0.** `CLARITY.Operations.clamp(options.ratio, 0, 1) || 0.5` in `src/filters/DualInput/Blend.js:6` — a legitimate `0` is falsy and becomes `0.5`. Same `||` trap across most filters' option defaults (`intensity: options.intensity || 0.5` etc.), so "off" is unreachable for any zero-valued option.
- **`hsvShifter`'s third slider is initialised from nothing.** `src/filters/Process/hsvShifter.js` stores the property as `value` but the slider reads `this.properties.lightness` (undefined) while writing back to `value`.
- **`Wave` jumps every second.** `new Date().getMilliseconds()` in `src/filters/Transform/wave.js:20` wraps at 1000ms, so the animation phase snaps back once a second. Use `performance.now()/1000`. Wave is also a **scatter** (writes to a computed `to`), which leaves un-written holes wherever the mapping isn't onto — rewrite as a gather (read from a computed `from`) and the tearing disappears. This matters again in #3, since shaders are gather-only by nature.
- **The example sort comparator is wrong.** `compareFilters` returns `first.position > second.position` — a boolean, so `Array.sort` only ever sees `1` or `0`, never `-1`. Reordering the filter list is unreliable in every example. Should be `first.position - second.position`. Duplicated verbatim across all seven `main.js` files (which is its own argument for #5).
- **`MotionDetector` index bookkeeping disagrees with itself.** The constructor sets `preindex = frameCount`, the slider handler sets `preindex = value-1`. One of them is wrong.
- **`Bleed` declares `output` twice and reads a global `ctx`.** `src/filters/Process/bleed.js:18-21` — the second `var output = ctx.createImageData(...)` uses a bare `ctx` that only resolves because the examples happen to define one globally. Same class of bug as `Ghoster`.
- **`Mirror` can never be turned off, and drops a column.** `options.Horizontal || true` (`src/filters/Transform/mirror.js:7`) is *always* `true` — the option is unusable. And `toX = frame.width - x` should be `width - 1 - x`: at `x = 0` it writes to index `width`, wrapping onto the next row, and column 0 is never written at all.
- **`Brickulate` loops 4× past both bounds.** `src/filters/misc/Brickulate.js:22-23` iterates `y < frame.height*4` and `x < frame.width*4` while indexing `(y*width + x)*4` — a 16× overrun. The bounds should be plain `height`/`width`. It also has a hardcoded `5` where `grooveSize` is meant (`xasd >= widthSegs-5`), so the groove is asymmetric for any other groove size.

Cheap, self-contained, and it stops #3 from faithfully porting bugs into GLSL.

---

## ~~2. Modern Build: ESM + Vite + a Publishable Package~~ ✓

**Effort: Medium**

**Done.** `src/` is TypeScript ES modules; Vite emits ESM + UMD + a global `<script>` build plus 47 `.d.ts` files; `package.json` is publishable as **`@calrk/clarity`**. Gulp is gone.

- **41 filters converted to classes** with a typed `<Name>Options` interface each. The port was done by codemod so the bodies — and the #1 fixes in them — carried across verbatim rather than being retyped.
- **Three bundles**: `dist/clarity.js` (ESM, what `import` gets), `dist/clarity.umd.cjs` (what `require()` gets — `.cjs` because the package is `"type": "module"`), and `dist/clarity.global.js` (IIFE exposing the `CLARITY` global). At the time the examples loaded the third, so all 8 kept working with only their `<script src>` changed; #5 later replaced them outright.
- **`npm run dev`** replaced the gulp-connect task that bound port 80 and needed admin. It serves the playground now.
- **The DOM dependency at import time is gone** (pulled forward from #10). `src/clarity.js`'s `document.createElement('canvas')` is replaced by `core/imagedata.ts`, which prefers the `ImageData` constructor. Node has no global `ImageData`, so a `setImageDataFactory()` injection point covers headless use — which is what #6's golden-image tests will need.
- **`npm test`** runs 55 assertions over the built bundle (every filter twice, plus targeted behaviour checks). Not the golden-image suite — that's still #6 — but enough to prove the migration is behaviour-preserving.
- `build/` and `examples/js/clarity*.js` are deleted; `dist/` is generated and gitignored.

**Bugs the type system found that the runtime sweep in #1 could not:**

- **`ChannelSeparate`'s "fix vertical lines" loop used `left`/`right` that it never declared.** Under `var` they leaked out of the *previous* loop, so every pixel in that pass read the same two stale indices — whatever the horizontal loop happened to leave behind. Genuinely wrong output for a decade, invisible to any runtime check.
- **`Contourer.setVar` and `Posteriser.setThresh` both read the loop counter after the loop**, relying on `var` hoisting. `let` broke them loudly; both now declare it outside.
- **`HanoverBars` reassigned one `pix` variable through RGB → YUV → RGB**, so its type changed twice under it. Split into separate bindings.

Two notes: the codemod initially dropped `doProcess` from `Sharpen` and `DifferenceDetector` — its brace matcher counted braces inside commented-out code — which the test suite caught. And the licence is now declared honestly as **GPL-3.0-or-later**, because MCut is still bundled; #7 is what makes it permissive.

<details>
<summary>The original write-up</summary>

The current build is `gulpfile.js`: Gulp **3.8**, `gulp-concat`, `gulp-uglify` 0.3. This does not run on any Node released in the last decade — Gulp 3 depends on `graceful-fs@3`/`natives`, which throws on Node ≥ 12. Beyond that:

- `gulp.task('connect')` shadows the outer `connect` variable with `require('connect')`, calls `connect.static()` (removed in Connect 3), and binds **port 80** (needs root/admin).
- `gulp.task('aws')` references a bare `aws` variable whose only assignment is commented out — instant `ReferenceError`.
- The `js` task doesn't return its streams, so `watch` → `build` ordering is a race.
- Output is plain concatenation into one `CLARITY` global, and load order is whatever `['./src/*.js', './src/**/*.js']` globs to. `src/clarity.js` (which *creates* the `CLARITY` object) happening to sort first is luck, not design.
- **`package.json` has no `name`, `version`, `main`, `module`, `exports`, `types`, or `files`** — this library literally cannot be `npm install`ed today.

Proposed:

- **ES modules per filter**, `export class Blur extends Filter`, with an `index.js` barrel re-exporting everything. Kills the implicit global and makes load order explicit.
- **Vite** for dev server + library build (`build.lib`), emitting ESM + UMD + minified, with sourcemaps. Replaces concat, uglify, connect, and watch in one config file.
- **TypeScript** — or at minimum JSDoc types with `checkJs`. Every filter takes an options bag with no documented shape; typed option interfaces are the single biggest usability win for anyone consuming this. It also catches half of #1 statically.
- **A real `package.json`**: `name: "clarity-filters"` (npm's `clarity` is taken), `version`, `type: "module"`, `exports` map, `sideEffects: false` so bundlers can tree-shake unused filters.
- Drop the `aws` deploy task in favour of GitHub Actions → Pages (see #5), and stop committing `build/` to git.

Prerequisite for basically everything below.

</details>

---

## ~~3. GPU Backend — Filters as Shaders~~ ✓

**Effort: High** *(depended on #2; much easier after #1)*

> **Done — every filter has a shader.** WebGL2 backend, ping-pong framebuffers, uniforms generated from the schemas, per-stage CPU fallback, and **all 63 parity cases running as shaders**. Shaders are the default path; the CPU runs where there is no WebGL2 — Node, an old browser, a lost context — and stays the reference implementation.
>
> Verified by a real parity suite rather than by inspection: `npm run test:gpu` drives headless Chrome with SwiftShader, runs every case through both paths and compares them. Node has no WebGL2 and headless-gl only implements WebGL 1, so the choice was between writing against a decade-old GLSL dialect or driving a browser — the browser wins, and SwiftShader means it needs no GPU and works in CI. **All parity assertions passing, with every CPU golden byte-identical.**
>
> Two things the parity suite caught that review would not have:
>
> - **`Blur` must not touch alpha.** `stackBlurCanvasRGB` copies the frame and blurs only the colour channels, so alpha passes straight through. The shader forced it to 255 and every pixel of the alpha fixture was wrong by 255 — invisible on an opaque photo, which is exactly why the alpha fixture exists.
> - **`Wave` is a boundary filter, not a pointwise one.** It floors a sine to choose which texel to read, and the GPU has 32-bit floats where the CPU has 64. A value a fraction either side of an integer reads a different pixel, so 3.6% of pixels differ by however far apart their neighbours happen to be. Re-tagged `population`, which is the metric that exists for precisely this.
>
> **Nothing is CPU-only any more.** All 63 parity cases run as shaders. Getting the last thirteen filters there needed five additions to the executor rather than five clever shaders — each one a general capability, not a special case:
>
> **1. Retained frames** — `Ghoster`, `MotionDetector`, `DifferenceDetector`. A filter declares `static retains()` and gets a `sampler2DArray` of previous frames, read with `historyTexel(age, p)`. An array rather than N textures because Ghoster reaches back thirty frames, and thirty samplers is past what a fragment shader is guaranteed to have; `mode: 'first'` covers DifferenceDetector, which holds one frame rather than a ring. Cheaper than the CPU path, which does a `createImageData` and a full byte copy per frame.
>
> The invalidation rule is explicit: history is dropped when the chain is edited, when the filter is removed, when it goes dirty, and when it moves between backends — the last because a filter that ran as a shader and then fell back has two histories that have diverged. Storage lives on the backend, so `Filter.reset` bumps a counter the backend compares against rather than reaching into it. A GPU test covers that indirection and fails when the counter is ignored.
>
> **2. Per-pixel randomness** — `Noise`, `Cloud`. Both paths now hash the pixel coordinate, so they agree *exactly* rather than statistically. `src/helpers/hash.ts` and its twin in the prelude are both 32-bit integer arithmetic — `Math.imul` is GLSL's `uint` multiply — and hand back 24 bits, because a float32 cannot hold a 32-bit integer and a shader dividing by 2³² would round the low bits away. Randomness stays injectable: one draw per frame becomes the seed, so `seededRandom` still controls the output and the grain still moves.
>
> **3. An extra input to a later pass** — `Glow`, `Bleed`. The executor copies the stage's input into a slot outside the ping-pong pair when any pass mentions `uOriginal`. The copy is not optional: on a three-pass filter the third draw renders into the same target the input arrived in, so by the time the pass that wants the original runs, the original has been overwritten by the filter's own working.
>
> **4. Per-instance data** — `Puzzler`. `static data()` returns a small RGBA8 block uploaded to `uData`. Puzzler's *selection* travels in it too, rather than as a uniform, because it changes on a click — and a click is not a property change, so there is no schema field for it and nothing marks the filter dirty.
>
> **5. Statistics no pyramid can reduce** — `Posteriser` (median cut), `MedianThreshold` (quartiles). Both need pixels in CPU memory, which on the GPU path means a readback — eight megabytes at 1080p, mid-chain, every frame, which is the exact cost this backend exists to avoid. So they read a *thumbnail*: `static samples` asks for a point-sampled copy at most 48 pixels on the longest edge, about 1% of the transfer, and `static prepare` is handed it before the shader runs. The palette goes back up as a 1D texture and the per-pixel lookup stays on the GPU — the right seam, since the lookup is O(pixels × palette) and the build is O(distinct colours).
>
> The CPU calls the same `prepare` with the same sample, so both derive their palette and quartiles from identical pixels. Sampling costs nothing in quality — median cut is a colour *distribution* algorithm and does not care about spatial detail — and it point-samples rather than averaging on purpose, because averaging invents colours that are not in the image and a palette should be made of colours that are.
>
> **Filters can also change the frame's size now** (`static outputSize`), which is what let `Rotator` do the honest thing.
>
> **Bugs this tier turned up**, none of which the golden suite could see on its own:
>
> - **`Operations.YUVtoRGB` had a sign error.** The green U coefficient was spelled `- -0.39465`, so RGB → YUV → RGB was not the identity and came back shifted by 0.789·u.
> - **`HanoverBars` did nothing at all in its default mode** — which only became visible once the above was fixed. The chroma rotation it switched on *is* Hanover bars; with `offset` defaulting to false there was nothing left, and the round-trip error was what made it look like an effect. Two bugs holding each other up, caught by the contact sheet on the next build. Now a mode select where both modes do something.
> - **`Bleed` blurred red, always.** `stackBlurCanvasSingle` opens with a hardcoded `channel = 0` that overwrites its argument, so the `channel` control in Bleed's schema did nothing whatsoever. It is now a real composite colour bleed — chroma smeared, luma left sharp.
> - **`ChromaticAberration`'s ramp was inverted** (and it was called `ChannelSeparate`). `1 - |x/w - 0.5| · 2` is maximum displacement at the *centre*; real chromatic aberration is a lens effect, zero on the optical axis and growing toward the corners. It survived a decade because there was no golden case for the ramped mode at all, only for `fixed`.
> - **`ValueThreshold`'s auto mode was converging on nothing.** `average = (average + colour) / 2` per pixel weights the last pixel at 50% and the first at 2⁻ⁿ. On the photo fixture it landed above almost every pixel and produced a near-black frame. Now the midpoint of the frame's own range, which is what auto was reaching for and is exactly what the reduction pyramid already computes.
>
> **Float precision is a recurring hazard, and integer arithmetic is the fix.** Twice a shader disagreed with the CPU not by a rounding error but by a whole pixel of displacement, because a value that is exactly a half-integer in float64 lands either side of it in float32. `ChromaticAberration` displaced 4% of the frame that way. Both now compute their indices in integers on both sides — `round(n·d/w)` as `(2·n·d + w) / (2·w)` — and agree exactly. The same reasoning drove `Cloud`'s cell lookup, which also stopped taking a modulo by a possibly-fractional number.
>
> **Whole-image reductions now work on the GPU**, which took `Invert` (dynamic) and `Contourer` off that list. A fragment shader cannot loop over an image, but it can read four pixels and write one — so doing that repeatedly walks a pyramid down to a single texel holding the frame's minimum and maximum. On a 1080p frame that is eleven tiny draws against a `readPixels` of eight megabytes. A filter declares a `reduce` shader that maps each pixel to the quantity being reduced; the halving passes need no knowledge of what they are reducing, and the result arrives as `reduction()`.
>
> `Contourer` needed one non-obvious detail. Its thresholds are *accumulated* on the CPU (`i += difference`), and computing them as `min + n * difference` instead puts the top threshold a hair lower — enough that the single pixel sitting exactly on the frame's maximum falls into the next band and comes out 43 different. The shader accumulates too. That also produced a third comparison metric: banding agrees to rounding inside a band and can flip a whole band at an edge, which neither a tolerance nor a population budget describes.
>
> **The contact sheet has a third panel.** Every card shows input → CPU → GPU, with the GPU caption reporting agreement — most cases *byte-identical* to the CPU, the rest differing by well under one unit on average. Building it needs a browser, so `npm run test:sheet` renders through the same headless Chrome and skips the column cleanly when there isn't one.
>
> It has more than earned its keep: it is what caught `HanoverBars` doing nothing, on the build after an unrelated fix, when every golden and every parity assertion was green.
>
> That column immediately caught a bug in itself: reading GPU output back through `canvas.toDataURL` premultiplies alpha, and so does `createImageBitmap` + `drawImage` on the way in, so the alpha fixture was degraded on both sides and showed a mean delta of 11 where the real figure is 0.32. Fixtures are now handed to the page as raw RGBA and results come back as raw RGBA; nothing decodes or re-encodes an image anywhere in that path.
>
> Tier 3 (WebGPU compute) is untouched, and is no longer *needed*: the sample-and-prepare hybrid handles the histogram-shaped filters without it. It remains the better home for them if the sampling ever proves too coarse, and would let the palette build move off the CPU entirely.

**The decision that shaped everything else:** target **WebGL2 first, WebGPU later**, and keep the **CPU path permanently** as a first-class fallback rather than scaffolding to be deleted after the port.

WebGL2 is universal — Firefox and older Safari included — and it is testable headlessly through SwiftShader, which WebGPU is not. Keeping both paths means every filter is implemented twice, forever, and the honest risk is that the CPU side rots while nobody looks at it. So the parity tests are not a nice-to-have; they are the mechanism that stops the two drifting. **A filter is not done until both paths exist and agree.** That rule is what turned up most of the bugs listed above: writing a shader forces you to say precisely what the CPU was doing, and several times the answer was "something nobody intended".

<details>
<summary>The original write-up</summary>

The headline. Today every filter is a JS loop over `ImageData`; a 1080p frame is 8.3M array writes per filter per frame, and a five-filter chain on a webcam feed is unwatchable. The README's own to-do list has said "Add WebGL function to each filter to improve performance" since 2014.

The design that fits Clarity's existing shape: **keep the pipeline, swap the executor.** Each filter already declares `doProcess(frame)` + `properties`; add a parallel GPU declaration:

```js
class Invert extends Filter {
  static shader = /* glsl */`
    uniform sampler2D uSrc;
    void main(){ vec4 c = texture(uSrc, vUv); fragColor = vec4(1.0-c.rgb, c.a); }
  `;
  doProcess(frame){ /* existing CPU path, unchanged */ }
}
```

Then a `CLARITY.Renderer` (see #4) owns one GL context and **ping-pongs two framebuffers** through the chain, so a five-filter pipeline is five draw calls with *zero* CPU round-trips — no `getImageData`/`putImageData` between stages, which is where the real cost lives. `properties` map straight onto uniforms, and now that #8 has landed the schemas, *which* uniform call to make is declared rather than guessed — `type: 'int'` is `uniform1i`, `type: 'float'` is `uniform1f`. `setProperty` is the single write path, so it becomes the single place a uniform gets marked stale.

Options tiers:

- **Quick fix** — GPU-accelerate only the pointwise filters (Invert, Desaturate, HSV Shift, Threshold ×3, Posterise, Noise, Sepia, Fill*). These are one-liners in GLSL and cover maybe half the library. Immediate, visible win.
- **Better** — add the 3×3 kernel family (Edge, Sharpen, Smoother, Emboss, Custom Kernel) via a shared `kernel3x3` shader template parameterised by a `mat3` uniform. Also unlocks #9 nearly for free. Then the separable ones: Blur becomes two passes (H then V) which is *far* better than the StackBlur port, and Glow becomes blur + additive blend with no intermediate readback.
- **Best** — **WebGPU with a WebGL2 fallback**, and WGSL compute shaders for the filters that genuinely aren't pointwise: median threshold, dot remover, MCut palette generation, histogram. Those need scans/reductions that fragment shaders handle badly. WebGPU is baseline in Chrome/Edge/Safari 26+; Firefox is behind, so the fallback isn't optional.

Filters that need real thought rather than a transliteration:

- **Multi-frame state** — `MotionDetector`, `Ghoster`, `DifferenceDetector` keep a ring of previous frames. On GPU these become a texture array / pool of retained textures, which is *cheaper* than the current per-frame `createImageData` + byte-by-byte copy in `pushFrame`.
- **Scatter filters** — `Wave`, `Puzzler`, `Translator`, `Tiler`, `Mirror` currently write to a computed destination. Fragment shaders can only gather, so each needs its mapping inverted. Fix them as gathers on the CPU first (#1) and the shader is then a direct port.
- **`Posteriser`'s median cut** is genuinely sequential. Keep it CPU-side, upload the resulting palette as a small 1D texture, and do the nearest-colour lookup on GPU.
- **`NormalGenerator`** is a poster child for this — four cross products and a normalise per pixel, which is what GPUs *are*.

Keep the CPU path as the reference implementation, not dead weight: it's the oracle for the golden-image tests in #6 (GPU output should match CPU within a tolerance), and the fallback for headless/Node use.

*(The three tiers held up, but the hard part turned out not to be any of them. It was the five executor capabilities above — retained frames, `uOriginal`, data textures, size changes, sample-and-prepare — none of which are shader problems. The "genuinely sequential" list shrank to nothing: median cut, histograms and quartiles all fell to a thumbnail readback, which was not in the plan at all.)*

</details>

---

## ~~4. A `Renderer` / `Pipeline` Object~~ ✓

**Effort: Medium** *(pairs with #3)*

**Done.** Split in two, which was the main design call:

- **`Pipeline`** — the ordered filter list, the caching, and nothing else. No canvas, no DOM, no frame loop. #2 and #8 went to some trouble to make the library importable outside a browser, and a `Renderer(canvas)` that everything had to route through would have quietly undone that. Keeping the ordering logic headless also means it is testable in Node rather than only in a browser.
- **`Renderer`** — owns the canvas, the source and the `requestAnimationFrame` loop, and delegates to a `Pipeline`.

The caching is the part worth getting right, because a stale cache doesn't look like a bug — it looks like a working render that stopped responding. Everything upstream of the first stage that is dirty, impure or newly reordered comes out of the cache; everything from there down re-runs. So tweaking the last filter of a long chain doesn't redo the ones before it, and an unchanged chain on an unchanged frame does **no work at all**. `pipeline.stats` reports the per-stage timings, the total, how many stages were skipped and where the recompute started, which is also what #5's timing panel wants.

That needs to know which filters are safe to cache, so **each declares itself**:

- `static stateful` — output depends on frames already seen: `Ghoster`, `MotionDetector`, `DifferenceDetector`. Must see every frame, in order, exactly once.
- `static varying` — output changes between calls on identical input, because the filter reads the clock or the random source: `Wave`, `Noise`, `Cloud`.

Both are excluded from the cache, but the distinction is not cosmetic — it is exactly the split #3 needs, where a stateful filter wants retained storage and a varying one wants a time or seed uniform. `Puzzler` looks varying and isn't: it shuffles once, in its constructor.

Things that came up doing it:

- **`enabled` had to become an accessor.** Host apps assign to it directly — the example control panel does — and a bypass that didn't mark the filter dirty would show a stale frame. It now sets `dirty` on change, and only on an actual change.
- **The source has to be read *once* for a still image.** Read it every frame and you hand the pipeline an equal-but-different `ImageData` each time, `source !== lastSource` is always true, and the cache can never hit. `Renderer.source(input, { live })` decides, defaulting to live for video and canvas.
- **`Renderer` re-introduced a runtime DOM dependency by accident.** `input instanceof ImageData` is a `ReferenceError` in Node, not a `false` — and it would also reject a caller's own ImageData-alike from `setImageDataFactory`. Every DOM global it touches is now looked up defensively and `ImageData` is duck-typed.
- **Nesting a pipeline as a second input needed a decision.** It is fed the outer run's *source*, not the frame at the point it is used: that is the more predictable reading of "mask this chain with that one", and the only one where the inner pipeline's cache can ever hit.

**The examples lost the duplication they were called out for.** `shuffleChanged` and `compareFilters` — the pair that walked the DOM matching `<li>` ids back to a `position` field and re-sorted the array — are gone from all four copies, along with the hand-rolled `getImageData`/loop/`putImageData` in seven. `examples/js/pipeline-list.js` wires drag-to-reorder to `renderer.move()` once. Three bugs fell out of the rewrite: `HeightMap` had accumulated **two identical copies of `compareFilters`**; every canvas click handler tested `setClick` on the wrapper object rather than on the filter, so clicking Puzzler never did anything; and three examples passed `{thresh: 64}` to `ValueThreshold`, which has no such option.

`Renderer` still reads back through a scratch canvas, which is exactly the CPU round-trip #3 exists to delete — but the seam is now in one place instead of seven.

<details>
<summary>The original write-up</summary>

Also straight off the README's own to-do list: *"Create a renderer object that holds a canvas and its filters."* Right now every example hand-rolls the same loop:

```js
var frame = ctx.getImageData(0,0,width,height);
for(var i = 0; i < filters.length; i++) frame = filters[i].filter.process(frame);
ctx.putImageData(frame, 0, 0);
```

...plus its own `shuffleChanged` / `compareFilters` / list-building code, copy-pasted across seven `main.js` files, bugs and all.

A `Renderer` should own: the target canvas, the ordered filter list, the source (image / video / canvas / `MediaStream`), and the frame loop. API sketch:

```js
const pipeline = new CLARITY.Renderer(canvas)
  .source(video)
  .add(new Blur({radius: 8}))
  .add(new EdgeDetector());
pipeline.start();            // rAF loop
pipeline.move(1, 0);         // reorder
pipeline.render();           // one-shot
```

Fold in the other README to-do while you're here — **"a flag to each filter to only process if input/controls changed or forced"**. **#8 already added the flag** — `setProperty` sets `filter.dirty`, and nothing clears it yet because clearing it is this feature's job. A static image with unchanged controls should then cost nothing per frame, and the renderer can cache each stage's output so tweaking filter #5 doesn't recompute #1–4. On a stateful filter (`Ghoster`, `MotionDetector`) the flag has to stay permanently dirty — worth an explicit `static stateful = true`.

This is also where the ping-pong FBO management from #3 lives, so it's worth designing the two together.

</details>

---

## ~~5. The Demo Site — A Live Pipeline Playground~~ ✓

**Effort: Medium–High** *(depended on #2, best after #3/#4)*

> **Done.** `site/` is one page that does more than the eight it replaced, and `examples/` is gone — along with the vendored jQuery 1.10, the jQuery UI, the checked-in `three.min.js`, the `ccv.js`, and the `.ogv`.
>
> **The playground builds nothing the library does not already expose.** The palette comes from `CATALOGUE`, the controls from each filter's schema, the code panel from the chain itself. That is the real test of the metadata #8 landed: if adding a filter needed the playground edited, the metadata was not enough. It doesn't, so it was.
>
> - **Sources became a list**, not a page each: sample, drag-and-drop, file, webcam. `Renderer.source()` takes an image, a video or a canvas and works the rest out, which is what collapses eight render loops into none.
> - **Drag-to-reorder** over `renderer.pipeline`, so the list is a *view* of the chain rather than the place the ordering lives — the DOM and the pipeline cannot disagree about the order.
> - **Shareable URLs**, readable rather than compact: `#photo/Blur.radius=8/Invert`. Only values that differ from a filter's default are written, so a default chain gives a short link and the link stays stable when a default changes underneath it.
> - **`Compare backends`** times the same chain both ways over 24 frames and reports the ratio. The most persuasive argument for #3 is an honest number, including the caveat that the GPU figure pays for an upload and a readback a canvas-bound chain would not.
> - **A `Filter.reset()`-aware benchmark**: stateful filters have their history dropped between runs, or the second measurement would be timing a filter that had already seen 24 frames.
>
> `Renderer` gained one thing: **`sourceFrame`**, the frame it last read. A two-input filter masking against the *unfiltered* source needs exactly those bytes, and re-deriving them means drawing into a scratch canvas and reading it back a second time.
>
> **Deployment is an assets-only Cloudflare Worker** (`wrangler.jsonc`) — no server code, nothing to run per request, `npm run deploy`.
>
> **`test/site.test.js` drives the built page in headless Chrome.** This is the part that matters: the pages it replaced didn't fail loudly, they rotted quietly, and by the time anyone looked the demo had been broken for years. So the test adds filters, reorders them, follows shared links, toggles a bypass and asserts the pixels actually changed — and it caught two bugs while being written:
>
> - **A pasted link did nothing.** Changing the hash on an already-open page is a *same-document* navigation, so nothing reloads and `applyHash` never ran again. The one way a shareable link must not fail.
> - **Every `=` was percent-escaped** into `%3D` by encoding whole URL segments, which defeats the point of choosing a readable format over a compact one. Only values are escaped now.
>
> One thing the test also disproved: it flagged `Mirror.Horizontal=true` as missing from a generated link, and it was right to be missing — `Horizontal` defaults to true, so the omission was the "only non-defaults" rule working correctly.

<details>
<summary>The original write-up</summary>

`examples/` is eight static HTML pages with a brown gradient, vendored jQuery 1.10 + jQuery UI 1.10, a checked-in `three.min.js`, and a randomly-chosen tagline. It also **no longer works**: `examples/Webcam/main.js:130-133` uses the callback form of `navigator.getUserMedia` plus `URL.createObjectURL(stream)`, both removed from every current browser (it's `navigator.mediaDevices.getUserMedia()` → `video.srcObject = stream` now, and it needs HTTPS or localhost). The video example ships a `.ogv`.

Replace the whole folder with **one app** that's a better demo than eight pages ever were:

- **A node-graph or drag-list pipeline editor** — the sortable list is genuinely Clarity's best idea; give it a proper UI. Drag filters in from a palette, reorder, toggle, and see the result update live at 60fps (which #3 makes possible for the first time).
- **Auto-generated controls.** ✓ Ready — #8 landed the schemas, so a generic control component binding to `filter.setProperty(key, value)` is all this needs, and new filters get a UI for free. `examples/js/controls.js` is a working plain-DOM reference to port.
- **Swap the input**: sample images, drag-and-drop your own, webcam (fixed), video, or a live three.js scene — the existing examples become *sources* in one app rather than separate pages.
- **Shareable pipelines** — serialise the chain to a URL hash so a link reproduces an exact filter stack. Very cheap, disproportionately good for showing the thing off.
- **Show the code** — a panel emitting the `new CLARITY.Renderer()...` snippet for the current graph, so the playground doubles as documentation.
- **Side-by-side CPU vs GPU timing** — an honest ms-per-frame readout for each backend is the most persuasive possible argument for #3.

Deploy via GitHub Actions → GitHub Pages (replacing the broken `gulp aws` task). SvelteKit or plain Vite + a small framework; the library itself must stay framework-free.

*(Built as plain Vite and vanilla DOM in the end, and deployed to Cloudflare Workers rather than Pages. No framework: the page is one screen with three panels, the schemas already describe the controls, and a page whose whole argument is "this library needs no framework" is a strange place to load one.)*

</details>

---

## ~~6. Test Suite — Golden Images~~ ✓

**Effort: Medium** *(depends on #2)*

**Done.** The suite has grown with everything since — **434 tests** now, across golden images, GPU parity, schemas, the pipeline, the control renderer and the playground. What follows is what it looked like when this feature landed; the counts have moved but nothing about the design has.

- **63 golden cases across all 41 filters**, pinned to committed PNGs in `test/golden/`. CPU output is deterministic, so goldens are matched **exactly** — any difference is a regression. Verified by injecting a one-unit change into `Invert` (`255-x` → `254-x`) and confirming it was caught, with an actual/diff image written for inspection.
- **Determinism plumbing** (`src/core/random.ts`): `Filter` now takes injectable `random` and `now`, defaulting to `Math.random` / `performance.now`, plus an exported `seededRandom()` (mulberry32). `Cloud`, `Noise`, `Puzzler` and `Wave` use them. Regenerating every golden twice produces byte-identical output.
- **Eight fixtures** at 64×48 (photographic, hard-edged, height map, alpha, a second input for the dual-input filters, a binary image with salt-and-pepper specks for `DotRemover`, and a near-identical pair for the frame-differencing filters) plus one at **33×25** for the boundary cases — `Pixelate` walked `size` down until it divided the height, `Tiler` stepped by 2, and the whole #1 sweep was off-by-ones at edges. That 33×25 fixture earned its keep twice over: both `Pixelate` and `Tiler` were visibly wrong on it.
- **`test/gpu-parity.test.js`** was written and wired *before* there was a backend to drive, skipping until one arrived, so the cases list and comparison logic could not rot in the meantime. Writing the harness first turned out to be the right call twice over: it also fixed what "done" meant for #3, and the answer was "agrees with the CPU", not "produces a picture".
- **Per-case comparison metadata** lives in `test/helpers/cases.js`, tagged `POINTWISE` (±1), `KERNEL` (±2), `ACCUMULATING` (±3) or `BOUNDARY` (at most 2% of pixels may differ *at all*) — the last for thresholders, where a per-channel tolerance is meaningless because a one-unit input difference flips a pixel between 0 and 255. #3 added a fifth, `BANDED`, for quantised output, where interiors agree to rounding and an edge pixel can flip a whole band.
- `npm run test:golden`, `test:update-golden` and `test:fixtures` added.
- **`npm run test:sheet`** builds `test/contact-sheet/index.html` — one self-contained page with every case's before and after side by side, what the filter does, what you should be able to see, and the percentage of pixels it actually changed. Anything changing 0% is flagged. This turned out to be the highest-value part of the whole suite: it found five real bugs the assertions and goldens had all passed clean, because a golden only tells you output *changed*, never that it was ever right. See #1 for the list.
- **Cases can declare a `pre` chain** — filters run over the fixture before the case's own. `NormalIntensity` and `NormalFlip` want a normal map, not a height map, so they were being tested against an input that made their output meaningless; they now run on `NormalGenerator`'s output, and the sheet shows the prepared frame as the "before" image. Declaring the pipeline beats committing a derived fixture, which would go stale silently when its producer changed.

One incidental fix: the "which exports are filters" check is now derived from the prototype chain (`value.prototype instanceof Filter`) rather than a hand-maintained denylist. The denylist silently misclassified each new helper export as a filter — it broke three times while building this.

<details>
<summary>The original write-up</summary>

#2 added 68 tests, but they assert *properties* (no NaN, opaque alpha, output is a permutation of its input). Nothing pins down what a filter's output actually looks like. That's what this adds.

### Two comparisons, deliberately separate

- **A — CPU vs a committed golden PNG.** Catches unintended changes to CPU behaviour. The reference lives in git.
- **B — GPU vs CPU, computed live in the same run.** Catches a shader disagreeing with the reference implementation. No stored file: the CPU path *is* the oracle.

Folding B into A — storing the CPU result and diffing the GPU against the file — looks simpler but collapses two failure modes into one. Legitimately change a CPU filter and you regenerate the golden, at which point the GPU test fails for a reason unrelated to the GPU. Kept apart, each failure points at exactly one cause, and A still pins B transitively. Given the decision in #3 to keep both paths permanently, **B is the mechanism that stops the CPU path rotting**, so it stays after the port is finished.

### Prerequisite: five filters aren't deterministic

Nothing can be goldened until these are seedable:

- **`Cloud`** — `Math.random()` per grid cell
- **`Noise`** — `Math.random()` per pixel
- **`Puzzler`** — shuffles in the constructor
- **`Wave`** — phase from `performance.now()`
- **`MotionDetector` / `Ghoster` / `DifferenceDetector`** — output depends on frames already seen, so their fixture is a frame *sequence*, not one image

So `Filter` needs injectable `random` and `now`, defaulting to `Math.random` / `performance.now`, plus a small seeded PRNG. This is the first piece of work, not a detail.

### Tolerance has to be per-filter

GPU output can't be bit-exact — 8-bit framebuffer rounding, `mediump` against JS doubles. But one global tolerance doesn't fit:

- pointwise (Invert, Desaturate, HSV Shift) — ±1 per channel
- accumulating (Blur, Glow, Smoother) — ±2–3
- **thresholders, `DotRemover`, `SkinDetector` — per-pixel tolerance is meaningless.** A pixel on the boundary flips 0 ↔ 255 from a one-unit input difference, so a tight tolerance fails a correct shader and a loose one hides real bugs. These need a different metric: *at most N% of pixels may differ at all*.

So tolerance and comparison mode belong in each filter's fixture definition.

### Fixtures

Not one image — a small set at ~64×48 so diffs stay reviewable: a photographic gradient, a hard-edged synthetic (edges and thresholds), a height map, one with real alpha, and one at **odd dimensions**. That last matters given #1: `Tiler` steps by 2, `Pixelate` does `while(height % size != 0) size--`, and the Mirror/Brickulate bugs were all boundary off-by-ones. Dual-input filters need a second image.

`pngjs` for decode/encode (pure JS, no native build on Windows) and `pixelmatch` for diffing; `setImageDataFactory` from #2 is already the hook.

**Honest caveat:** the GPU half of B is awkward in CI, since headless runners have no real GPU. Either drive SwiftShader through headless Chrome or accept that B runs locally only — worth deciding before building the harness rather than after.

</details>

---

## ~~7. Licensing — Replace the GPL Dependency~~ ✓

**Effort: Low–Medium**

**Done.** Clarity is **MIT** now. `src/vendor/MCut.js` is deleted and no GPL code remains.

- **`src/helpers/quantise.ts`** is a from-scratch median cut — ~190 lines against MCut's 470, exported publicly as `medianCut()` and `nearestColourIndex()`. It histograms the frame's *distinct* colours instead of building an array of `[r,g,b]` triplets per pixel (2 million of them at 1080p), splits the widest box at the **population-weighted** median, and averages each box weighted by pixel count. The `// TODO fix NaNs` at the old `MCut.js:393` doesn't survive the rewrite.
- **`LICENSE` added** — the repo never had one. MIT, plus a third-party notices section reproducing StackBlur's.
- **A real compliance bug found and fixed:** minification was **stripping StackBlur's MIT copyright notice from all three bundles**. MIT requires the notice travel with every copy, so the distributed files were technically in breach. A rollup `output.banner` now bakes it into each bundle, verified by a grep in the build check.
- `Posteriser`'s per-pixel search is now keyed on a packed 24-bit int rather than allocating a 3-element array per pixel.

Measured against the old implementation (restored from git purely to benchmark):

| Image | Distinct colours | Old | New | |
|---|---|---|---|---|
| 320×240 photo-like | 32,239 | 48ms | 26ms | 1.9× |
| 640×480 photo-like | 106,726 | 172ms | 64ms | 2.7× |
| 1280×720 photo-like | 294,668 | 427ms | 174ms | 2.5× |
| 640×480 flat art | 44 | 93ms | 4ms | **21×** |

Noisy photographic content is the *worst* case for a histogram approach — nearly every pixel is a distinct colour — and it still roughly doubles. Flat or already-posterised images, where the histogram collapses hard, are where it runs away.

Note the palette differs slightly from the old implementation: it splits on unique colours weighted by population rather than sorting the raw pixel list, which is the better-behaved formulation. Output is deterministic, entries always fall inside the image's gamut, and 15 new tests cover it.

<details>
<summary>The original write-up</summary>

There is **no LICENSE file** in the repo, and two pieces of vendored third-party code are compiled into the build:

- `src/helpers/MCut.js` is **GPL-3.0** (median-cut.js). Because Gulp concatenates it into `clarity.js`, the entire distributed bundle is arguably a GPL derivative — which makes Clarity unusable in most projects and unpublishable as a permissive npm package.
- `src/helpers/StackBlur.js` is Mario Klingemann's MIT-licensed StackBlur (v0.5, 2010) — fine to keep, but the attribution needs to survive minification and be listed in the README.

Actions: pick and add a LICENSE (MIT is the norm for this kind of library); replace MCut with a from-scratch median-cut or k-means quantiser (~150 lines, and a good excuse to fix the `// TODO fix NaNs` at `MCut.js:393`); or split it out as an optional `clarity-posterise-gpl` package. Once #3 lands, palette generation moves to a compute shader anyway and the dependency largely evaporates.

Unglamorous, but it's the difference between a library people can use and a repo people can only read.

</details>

---

## ~~8. Declarative Filter Schemas — Delete `doCreateControls`~~ ✓

**Effort: Medium** *(unblocks #5, simplifies #3)*

**Done.** 717 lines out, 423 in — and every golden image is byte-identical, so nothing about what the filters *compute* moved.

- **`static schema` on 33 filters**, in `src/core/schema.ts`. Four field types: `int`, `float`, `bool` and `select`, with `label`, `min`/`max`/`step`, `default`, an optional `description` for tooltips and generated docs, and `nullable` for the "derive it from the frame" case (only `ValueThreshold` uses it, but it needed representing rather than special-casing).
- **`setProperty(key, value)` is the single write path.** It coerces per the schema, clamps to the declared range, marks the filter dirty for #4, and calls a `propertyChanged` hook. `setInt`/`setFloat`/`toggleBool` are gone — the caller no longer has to know which one a property wanted. Unknown *keys* throw (a caller bug); out-of-range *values* clamp (user input, or a link made by an older build).
- **`Interface` and all 31 `doCreateControls` methods deleted**, and with them the library's last DOM dependency.
- **The examples still work**, via a ~90-line plain-DOM renderer that draws any filter from its schema. It lives outside the library, which is the whole point: the metadata is Clarity's, the markup is yours. (It moved to `site/src/controls.js` with #5 and grew a little; it still handles every filter without knowing what any of them are.)

Four things fell out of doing it that weren't in the original write-up:

- **Filters were hiding derived-state rebuilds inside their control handlers.** `Sharpen` rebuilt its convolution kernel in the slider's `change` listener; `MotionDetector` reset its frame ring in one. Setting those properties *any other way* — from a constructor-adjacent call, a preset, a URL — left the derived state stale and the filter quietly ignoring the change. Deleting the DOM code would have deleted the rebuild with it. That logic now lives in `propertyChanged`, where it belongs, and is asserted by a test.
- **Declaring a property forces you to ask whether changing it works.** `Puzzler` shuffles its tile grid in the constructor and had no controls at all, so nothing had ever noticed that changing the segment counts left a grid of the old size. `Posteriser.method` was a constructor-only field that nothing could describe, so the fast/accurate choice was invisible; it is a `select` property now and switches live.
- **`Bleed` returned `undefined` at radius 0.** StackBlur bails out with a bare `return` below a radius of 1, and `Bleed` handed that straight back, so everything downstream died on `.data`. Found by a test that simply sets every declared field to each end of its declared range and checks the filter still produces a frame — the cheap version of the property-based fuzzing in #6, and it earned its keep immediately.
- **Minification was renaming the classes.** `filter.constructor.name` came back as `lt`, which matters now that it is the natural key for serialising a pipeline to a URL in #5, and it was appearing in `setProperty`'s error messages. `esbuild.keepNames` fixes it for ~1.3 kB.

**The anti-drift mechanism is the point.** A hand-written description of hand-written code rots, so `test/schema.test.js` compares each schema against the filter it claims to describe rather than against another document: schema keys must match the filter's actual properties exactly, every declared default must equal what the constructor builds, and every field must be internally consistent. `test/controls.test.js` then renders all 41 filters through the playground's renderer against a DOM stub, so "the schema carries enough to build a working control" is asserted rather than hoped for. 181 new tests.

Still deliberately not done: constructors don't yet *read* their defaults from the schema, so the two are pinned together by a test rather than being one declaration. That's the natural follow-up, but it means rewriting 33 constructors that each coerce their options slightly differently, and it's better done alongside #4 when the `Renderer` decides how filters get built.

<details>
<summary>The original write-up</summary>

**34 filters hand-write a `doCreateControls` that builds DOM by hand** — about 550 lines of near-identical code:

```js
var slider = CLARITY.Interface.createSlider(1, 180, 1, 'radius', this.properties.radius);
controls.appendChild(slider);
slider.addEventListener('change', function(e){ self.setInt('radius', e.srcElement.value); });
```

It was a reasonable call in 2014 — the filter owning its own controls meant you could drop one into a page and get a UI. But it has decayed exactly the way copy-pasted code does:

- **Two incompatible wiring conventions.** `Blend`, `Mask`, `Multiply`, `hsvShifter` and `noise` drill into `getElementsByTagName('input')[0]`; the other ~29 attach `change` to the **wrapper div** returned by `createSlider`. Both happen to work — `change` bubbles, and `e.srcElement` resolves to the inner input either way — but nothing enforces or documents which is intended, and the div form breaks the moment a control grows a second input.
- Every handler uses `e.srcElement`, a legacy non-standard alias for `e.target`.
- `hsvShifter` initialises a slider from `this.properties.lightness` while writing back to `value` (see #1) — the kind of drift that copy-paste guarantees.
- It makes the library **require a DOM**. Together with the `document.createElement('canvas')` at `src/clarity.js:3`, importing Clarity in Node throws — no SSR, no headless tests, no build-time texture generation.

### The important distinction: delete the *rendering*, keep the *metadata*

The tempting version of this change is to bin `doCreateControls` and hand-write the controls in the demo app's Svelte/Vue components with two-way binding. Don't — that throws away real domain knowledge. That `radius` is an integer from 1–180, `hue` is 0–360, `ratio` is a float 0–1 in steps of 0.01 — **only the filter knows that**, and it isn't UI, it's the filter's contract. Move it into the app and every consumer has to rediscover it.

So: keep a declarative schema in the library, ship **zero** rendering code.

```js
static schema = {
  radius: { type: 'int', min: 1, max: 180, step: 1, default: 10, label: 'Radius' }
};
```

A generic control component in the playground (#5) consumes it and binds to the filter's properties — one place that wires an input, so the two conventions collapse into one and drift becomes impossible.

**One trap with two-way binding:** `setFloat`/`setInt` exist because DOM inputs yield *strings*. Bind a framework model straight onto `filter.properties` and you get `radius: "10"` — which silently works in some arithmetic and breaks in the rest (`"10" + 1` is `"101"`, and it'll pass straight into `uniform1i` as a `NaN` once #3 lands). The schema's `type` field is what coerces on write, so route binding through a single `setProperty(key, value)` that coerces per the schema, marks the filter dirty for #4, and leaves the structural signature untouched for #12.

### What it unlocks beyond UI

This is why the schema earns its place in the library rather than the app — the same metadata drives:

- **GPU uniform binding** in #3 (`type: 'float'` → `uniform1f`), generated instead of hand-written per filter.
- **The recompile boundary** in #12 — property change = uniform write, structure change = recompile.
- **Auto-generated options docs** in #11, which can't go stale.
- **Property-based tests** in #6 — fuzz each filter across its declared ranges and assert it never emits `NaN` or out-of-gamut values.
- **Pipeline serialisation** for the shareable-URL feature in #5.

Deletes `CLARITY.Interface` (92 lines), `Filter.createControls`/`doCreateControls` (~550 lines), and the DOM dependency. The enable/disable checkbox goes too — that's the pipeline editor's job, not the filter's.

</details>

---

## ~~13. A `clarity` Action for `<img>`~~ ✓

**Effort: Low** *(added after the original list; depends on #8's schemas)*

> **Done.** `<img src="/sprite.png" use:clarity={'Desaturate/Noise,intensity=20'} />`. The element keeps its identity — same `<img>`, same CSS, same `alt` — and only its `src` changes; the original is kept on `data-clarity-source`.
>
> Three decisions worth recording, because the obvious version of each is wrong:
>
> - **An action, not a component.** Actions are exactly "attach behaviour to an existing element". And an action is only `(node, params) => { update, destroy }`, so this is a plain function with no Svelte import — it works in Svelte 4 and 5, in other frameworks, and standalone. A component would have had to own the element and would have taken its class list, sizing and `alt` with it.
> - **A blob URL, not a data URL.** `toDataURL` puts base64 into the DOM as an attribute: a 2MB sprite becomes a ~2.7MB `src`, re-encoded on every change. A blob URL is a short reference to bytes the browser already holds, and it can be revoked.
> - **This repo, as a subpath export.** A separate `svelte-clarity` would mean a second release process and a version skew discovered from a bug report — and this project is a long lesson in what happens to adjacent code nobody tests. `@calrk/clarity/svelte` costs one line in `exports` and keeps the main entry point DOM-free.
>
> **The format came out of the playground.** `Blur,radius=8/Invert` moved into the library as `parseChain` / `buildChain` / `formatChain`, so a URL and an HTML attribute are the same format with one implementation. That needed `FILTERS`, a name-to-constructor registry — the missing half of `CATALOGUE`, and something *any* deserialiser needs. Both now have the same completeness test.
>
> Reading is deliberately forgiving and writing is exact: an unknown filter is skipped rather than thrown, because the text comes from a URL or a template written against some other version of the library, and a page that renders the rest of the chain beats a page that renders nothing.
>
> Four things that are easy to get wrong and are the actual work:
>
> - **One shared WebGL context** for every element on the page. A browser hands out around sixteen and then starts dropping the oldest, so a context per sprite fails quietly as soon as a page has a few.
> - **Re-run from the original, never from the last result.** Two `Invert`s applied in sequence to the *output* land back where they started, which looks exactly like the action having stopped working. Asserted.
> - **A generation counter**, so a slow run finishing after a newer one started cannot overwrite it.
> - **A real error for the cross-origin case.** Reading pixels from another origin taints the canvas, and it is the likeliest failure in a game whose assets are on a CDN. It needs `crossOrigin` *and* a server header, and the message says so.
>
> `test/action.test.js` drives it in headless Chrome — the lifecycle rather than the filtering, since the filtering is covered sixty times over already.

---

## 9. Finish the Filter Wishlist

**Effort: Low each** *(unblocked — #3 landed everything these need)*

The README's "Filters to be made" list had been sitting there since 2014. Every mechanism they need now exists, so most of these are genuinely small: a shader, a CPU twin, a schema, a golden case. Grouped by what they *need*, because that is what decides the effort — several are nearly free once one parent filter exists.

### The kernel family — one filter, then presets

| Filter | Summary | Effort |
|---|---|---|
| ~~**Convolver**~~ ✓ | Applies a 3×3 kernel chosen from a list, optionally more than once. | Done |
| ~~**Sobel**~~ ✓ | Edge strength from the gradient magnitude of two perpendicular kernels. | Done — preset |
| ~~**Laplace**~~ ✓ | Second-derivative edges — thinner than Sobel's, and signed. | Done — preset |
| ~~**Emboss**~~ ✓ | Lights the frame from one side so edges read as raised or cut into the surface. | Done — preset |

**Done.** One filter, five presets, and two files deleted: `Sharpen` became `preset: sharpen` with its `intensity` generalised into `amount`, and `Smoother` became `preset: smooth`. `amount` blends the result back over the source and is allowed above 1, where it extrapolates rather than interpolates — which is exactly what over-sharpening is, and is how it covers the range `intensity` used to. `sobel` is deliberately special-cased: edge strength is the magnitude of two perpendicular gradients, so it runs both and takes `sqrt(gx² + gy²)`. Offering the halves separately would be purer and would mean nobody could get the thing they wanted in one stage.

Two details worth keeping: the CPU path **clamps at the border** to match `srcTexel`, rather than skipping a one-pixel ring the way `Sharpen` did and leaving a dark frame around every result; and the checkerboard behaviour is now a regression test — the `smooth` preset takes two opposite pixels to the *same* value in one pass and holds them there, where `Smoother` swapped them and oscillated forever.

Do `Convolver` first: the other three are entries in a select rather than files. It also **retires `Sharpen`** and **retires `Smoother`** — the latter takes its centre-pixel bug with it, see below.

The open question is the *custom* kernel. `FilterSchema` has no matrix type, so nine `float` fields is the only way to express one, and nine controls would clutter the panel for the 95% of uses that want a preset. Shipping presets first keeps the door open: adding `custom` to the select plus nine fields later does not break any existing link, because `formatChain` only writes non-defaults.

*`Smoother` is not merely redundant, it is wrong.* Its kernel **excludes the centre pixel**, giving frequency response `(cos 2πu + cos 2πv)/2`, which is exactly **−1** at the diagonal Nyquist. A one-pixel checkerboard is inverted at full strength rather than smoothed, and iterating flips it back and forth forever — measured: 0→255→0→255 over three passes, where `Blur` collapses the same input to flat grey. It is also ~4× slower than `Blur` for 1/36th of the reach, and it forces alpha to 255 where `Blur` preserves it. Deleting it in favour of a `smooth` preset fixes the bug by replacement.

### Morphology — one filter

| Filter | Summary | Effort |
|---|---|---|
| ~~**Morphology**~~ ✓ | Grows or shrinks light regions; open and close remove speckle without moving the edges that remain. | Done |

**Done.** Modes `dilate / erode / open / close`, and `DotRemover` is deleted. It generalises past binary images because morphology is defined by ordering rather than by 0 and 1 — dilate is the local maximum over the structuring element and erode the local minimum, so on a photograph dilate spreads highlights and erode deepens shadows. `radius` is the reach and is the thing to turn up.

Three things worth keeping:

- **It runs separably**, exactly as `Blur` does: the maximum over a box is the maximum of the row maxima, so it is two passes of 2r+1 taps rather than one of (2r+1)². At radius 10 that is 42 samples instead of 441.
- **Four passes always run**, with a per-pass `uPhase` uniform choosing min, max or a bit-exact copy. `static shader` is fixed at class level and cannot vary by mode, so the compound modes get their second operation from passes 3 and 4 and the simple ones pass those through. (`uPass`, which the executor already supplies, is the *repeat* index rather than the pass index — worth knowing before reaching for it.)
- **`open` is a better despeckle than `DotRemover` was.** `DotRemover` flipped any pixel with too few matching neighbours, in both directions at once, which also nibbled real edges. `open` removes anything smaller than the element and leaves everything else exactly the size it was. Its symmetric behaviour is an `open` followed by a `close` — two stages in a chain, which is what a pipeline is for.

Removing it also orphaned the `binary-in` trait, which nothing else carried, so the vocabulary lost a word — which is what the drift test asking every declared trait to tag something is for. **`Skeletiser` reintroduces it** when it lands.

### Colour

| Filter | Summary | Effort |
|---|---|---|
| ~~**Levels**~~ ✓ | Remaps the black point, white point and gamma — the everyday contrast control. | Done |
| ~~**Sepia**~~ ✓ | Tones the frame to warm monochrome. | Done — a `GradientMap` ramp |
| ~~**LUT**~~ ✓ | Remaps every colour through a lookup table. | Done as `GradientMap`; the 3D cube is a separate thing |
| **Dither** | Quantises to a few colours with an ordered or diffused pattern instead of flat bands. | Low–Medium |
| **Halftone** | Redraws the frame as a grid of dots on a flat ground, sized by how strong each cell is. | Low–Medium |

**`Levels` was a real gap rather than a nicety** and is now done: there was no brightness or contrast control anywhere in the library, only `hsvShifter.value` multiplying brightness, which can scale but never *stretch*. Gamma is applied after the black/white stretch, as `pow(t, 1/gamma)`, so the two ends stay pinned while the midtones move — doing it before would drag the ends with it.

**`LUT` shipped as `GradientMap`, indexed by brightness rather than by colour**, and the reframing is the whole of it. A 3D colour cube is the film-grade version and is genuinely useful — but the table has to come from *somewhere*, and in practice that means a `.cube` exported from Resolve. That is an asset-pipeline feature wearing a filter's clothes, and it is the only thing in the library that would need a file the user does not have. A 1D ramp indexed by luminance needs no asset at all, because the ramps are authored here, and it pays off against how much of this library **outputs grey and had nothing to do with it**: `Cloud`, `Gradient`, `Contourer`, height maps, `EdgeDetector`, the thresholders, `DifferenceDetector`. Seven ramps — `fire`, `ember`, `ice`, `thermal`, `toxic`, `sepia`, `spectrum` — and **`Sepia` is one of them rather than a filter**, the same absorption `Convolver` did to `Sharpen`.

Two things worth recording:

- **`steps` and `cycle` together are palette cycling**, the trick pixel artists used to animate waterfalls and lava without touching a pixel. Banding happens *before* the rotation on purpose: quantising fixes where the bands are and the rotation then moves colours through them, which is what reads as flow. Rotating first and banding after slides the band edges instead, and the picture appears to crawl. The test asserts exactly that — two pixels sharing a colour before the rotation must still share one after.
- **The table is built on the CPU and handed to the shader through `data()`**, so both backends look colours up in the same 256 bytes rather than each evaluating the ramp its own way. All that is left to disagree about is which entry a pixel lands on, which is a hard boundary and takes the population metric.

`Dither` is the one honest use of `supportsGPU`: Bayer is an ordered threshold and runs as a shader, while Floyd–Steinberg diffuses error to pixels not yet visited and is inherently sequential, so it stays CPU-only.

**`Halftone` is cheaper than it sounds and covers two effects at once.** For each output pixel: find its cell, sample the source at the cell's centre, turn that into a radius, and write the dot colour or the ground depending on the distance. One pass, pure gather, nothing retained — the same shape as `Pixelate`, which is already the closest thing in the library and is the reason this is not just a variant of it: `Pixelate` fills every cell edge to edge, so it never shows a ground and can never look drawn.

The dot colour is the choice that splits it in two. Take it from the cell and you get **Clark's dot painting** — coloured dots on white, size by strength. Fix it to black and you get **newsprint**. One `colour: 'sampled' | 'ink'` covers both, alongside `spacing`, `background` and a `scale` for how much of a cell a full-strength dot fills.

The one thing worth getting right rather than shipping naively: **rotate the grid**. An axis-aligned screen reads as a grid artifact laid over a photograph, because the rows line up with everything else rectangular in the frame; the classic screens sit near 15°, 45° and 75° precisely so the eye reads tone instead of pattern. It is one rotation of the cell coordinates and it is the difference between "looks like a halftone" and "looks like a bug". Per-channel angles are the full CMYK version and are a later problem — the rosette they make is the thing worth doing eventually, and it wants three sampled channels rather than one.

Also worth knowing it is the honest partner to `Dither`: both trade colour depth for pattern, but a dither keeps the pixel grid and a halftone throws it away for a coarser one, so they answer different questions and neither absorbs the other.

**A 3D `.cube` LUT stays open, and should be judged as an import feature rather than a filter** — `static data()` already uploads arbitrary texture data, so the mechanism exists; what does not exist is anywhere for a user of the playground to put a file.

### Starters

| Filter | Summary | Effort |
|---|---|---|
| ~~**Gradient**~~ ✓ | Fills the frame with a linear or radial grey ramp. | Done |
| ~~**Voronoi**~~ ✓ | Fills the frame with cellular noise — stone, scales, cracked ground, caustics. | Done |

**`Gradient` is done.** Grey rather than two colours on purpose: its job is to be a *mask*, and a coloured ramp is this multiplied by a `FillRGB` — one more stage, against six more properties nobody sets. The linear ramp normalises across the frame's extent *along the angle* rather than its width, so a diagonal reaches `end` in the corner instead of running out part way; the radial one normalises to the nearest edge, so a centred spotlight behaves as expected and the corners clamp. **`Voronoi` is done** — the sibling of the gradient noise in `Cloud`, reusing the same hashing so its feature points land identically on both backends, and wrapping at the frame edge so the result tiles. One difference from `Cloud` is deliberate: `Cloud` lays `grid × grid` cells over the frame whatever its shape, which stretches its noise. That is invisible in fog and glaring in cells, where a stretched Voronoi reads as a bug — so the row count is derived from the aspect in integer arithmetic and the cells stay square. Three modes off one distance field: `distance` (blobs), `borders` (the seams — cracked ground, stained glass) and `cells` (flat hashed values — stone, scales). `cells` uses the population GPU metric rather than a tolerance, because a near-tie between two feature points flips a whole cell at once, which no per-channel tolerance can describe.

**Since, on randomness.** `Cloud`, `Voronoi` and `Noise` drew a fresh seed inside `doProcess`, so a single filter produced a different picture on *every call*. That was invisible for as long as a still image rendered once and stopped — and became a strobe the moment anything drove a frame loop, including an unrelated filter downstream, because an impure stage cannot be cached and so re-ran alongside it. A cloud under an animating wave was a new cloud sixty times a second.

The seed is now drawn once per filter and held (`Filter.seed`, lazily, so it does not take a number out of `random` for filters that use the stream for something else — drawing it eagerly moved `Puzzler`'s shuffle). All three are **pure** as a result, so the pipeline caches them: an animating wave over a cloud now recomputes only the wave, and six octaves of noise stop being recalculated per frame to produce a picture nobody asked for.

It also fixed something quieter. `#blank/Cloud` gave a *different* cloud to everyone who opened it, because their page builds its own filters — the chain is supposed to *be* the URL, and for the three random filters it silently was not. `seed` is a nullable schema property now: empty means "one was picked when this was made", and the reshuffle button writes a concrete number, so a rolled link reproduces exactly.

**`Translator` scrolls now**, which is the other half of the same fix: `speed` advances the offset along itself, so the two properties that aim it also aim the motion. It only works *because* the seed is pinned — translating a cloud that redrew itself every frame moved a picture that was already a different picture. The travelled distance is wrapped into one frame before use: the motion is identical either way since the result wraps regardless, but a number that grows with the clock loses its fractional precision on the GPU, where `uTime` is a 32-bit float, and the two backends would eventually disagree about which side of a whole pixel the offset fell on — which shifts the entire picture by one. It also exposed a latent CPU bug: the wrap adjusted the index *once*, which was only ever enough because the offset was clamped to a single frame. Scrolling carries it past two, and one adjustment leaves the index reading a neighbouring row. The first test written for it passed against the old code, because a gentle offset never reaches that far; sweeping the extremes is what caught it.

**The gradient map's ramps fold rather than wrap.** `fire` runs black to white, so rotating it straight through slammed white into black once per cycle — a visible tear. A ramp that does not end where it started is now swept up and back down instead, and the choice is read off the stops rather than declared, so `spectrum` keeps its continuous hue sweep and everything else stops seaming. The fold is the identity on 0–1, so nothing that is not cycling changed and no golden moved. Verified the other way too: with the fold disabled, `fire` jumps by **254** between adjacent frames.

**And `varying` turned out to be answering two questions.** Its own doc said "reads the clock *or* the random source", and those want opposite answers from a host deciding whether to run a loop: purity is "may I reuse the last output", while a loop needs "will waiting produce a new one". A `Wave` at `speed = 0` is impure and will draw the same frame forever. `Filter.animated(filter)` is the second question, per instance like `retains` and `supportsGPU` — so `speed = 0`, `cycle = 0` and the three seeded filters no longer spin a render loop for nothing.

### Video and CRT

| Filter | Summary | Effort |
|---|---|---|
| ~~**FishEye**~~ ✓ | Bows the image outward like a lens, or pinches it inward. | Done |
| ~~**Vignette**~~ ✓ | Darkens towards the corners. | Done |
| ~~**CRT**~~ ✓ | *Not a filter.* `FishEye` + `HanoverBars,mode=scanlines` + `Vignette`. | Done — a chain |
| ~~**DotCrawl**~~ ✓ | The crawling dot pattern composite video leaves along colour edges. | Done |
| ~~**ScreenBurn**~~ ✓ | Burns a fading ghost of the brightest thing that has been on screen. | Done |
| ~~**ShotDetector**~~ ✓ | Marks the frame where a cut happened, by how much of the picture changed at once. | Done |

**CRT shipped as two filters and a chain rather than one filter**, which is the better shape: a CRT look is a lens curve, a scanline pattern and a corner falloff, and `HanoverBars` already had the scanlines. Written as one filter those three would have been six properties nobody could reuse; written separately, `FishEye` is a lens effect and `Vignette` is a photographic one, and the CRT is a link:

[`FishEye,amount=0.35/HanoverBars,mode=scanlines/Vignette,amount=0.7,radius=0.4,softness=0.7`](https://clarity.clarklavery.com/#colours/FishEye,amount=0.35/HanoverBars,mode=scanlines/Vignette,amount=0.7,radius=0.4,softness=0.7)

Both normalise distance by **half the diagonal**, so the effect is circular in pixel space rather than stretched with the aspect ratio, and a radius of 1 is exactly the corner. `FishEye` is a gather — it asks each output pixel where its input came from — because a scatter leaves holes wherever the distortion stretches. It leaves anything sampled from outside the frame black rather than clamping, since the point of the barrel case is that the screen *has* an edge; `zoom` pushes that edge back off-screen when you want the curve without the border.

`FishEye` is compared with the population metric rather than a tolerance: a radial term inside a `floor` means a pixel near a rounding boundary can take its colour from the neighbouring source pixel on one backend and not the other, which is a large delta on a few pixels rather than a small one everywhere.

**Done, and one of them widened the GPU gate.**

`DotCrawl` shades chroma edges, not luma edges, which is the whole character of it — a black-and-white frame shows none of this however much detail it has. The pattern is a checkerboard that *steps* one place per frame rather than sliding, which is what makes the dots crawl instead of shimmer in place.

`ScreenBurn` differs from `Ghoster` by one operator, and it is the whole difference in look: `Ghoster` averages the retained frames so everything leaves an equal translucent trail, while this takes the age-weighted **maximum**, so only bright things leave a mark. A white shape crossing a dark frame gives Ghoster a smear and this a scar.

`ShotDetector` answers a question about the *whole frame* rather than about any pixel, which is what separates it from `MotionDetector` and `DifferenceDetector`: those say "what moved here", a cut is "how much of everything moved at once". It is the first filter to use `samples` + `prepare` for **state** rather than for a statistic — it keeps the previous thumbnail and compares against it, and hands the answer to the shader through `data`, since a uniform cannot be derived per instance.

That last one exposed a real limitation. `gpuBlocker` sent any `stateful` filter with no `retains` to the CPU, on the reasoning that a history cannot live in the ping-pong pair. True for pixels — but `ShotDetector`'s state is a thumbnail on the filter, maintained by `prepare`, which runs on **both** backends from identical sampled pixels. The gate now also accepts `samples > 0`. Worth noting how it was caught: the parity test *passed* while the filter ran on the CPU on both sides, and only the harness's `CPU only:` line gave it away — a green parity result does not by itself prove the shader ran.

It also moved the `temporal` trait's derivation from `retains(filter) !== null` to `stateful`. `stateful` is the property that actually means "output depends on frames already seen"; `retains` is only its commonest implementation, and `ShotDetector` was temporal in every sense but the test's.

### The rest

| Filter | Summary | Effort |
|---|---|---|
| **Bilateral** | Blurs flat areas while leaving edges sharp. | Medium |
| **Histogram** | Draws the frame's tonal distribution over it. | Low–Medium |
| **ChromaKey** | Makes one colour transparent, with tolerance and edge softening. | Low |
| **Crackulate** | Draws procedural cracks across the frame. | Medium |
| **Skeletiser** | Thins a binary shape down to lines one pixel wide. | Medium–High |

`Histogram` wants `samples` + `prepare`, which is exactly the shape that already exists for `Posteriser`'s palette. `ChromaKey` was not on the old list and is the obvious partner to `Mask`. **`Skeletiser` is the only genuinely hard one** — iterative thinning is sequential and needs a repeat-until-stable loop, which is a poor fit for a shader and the one item here that is a day rather than an hour.

*Chromatic aberration was on this list and is now shipped — it turned out `ChannelSeparate` had been it all along, with an inverted ramp. See #3. Difference clouds and ridged noise are done; see below.*

### ~~Difference clouds & ridged noise~~ ✓

**Done.** Photoshop's one menu item was two separable ideas, and both shipped.

**`Difference`** is a new `DualInput` filter: `|a − b|`. `Subtract` writes `a - b` into a `Uint8ClampedArray`, so everywhere the second frame is brighter collapses to zero and half the range is lost — the goldens show it, mean 39 against Difference's 76 on the same two frames. Taking the magnitude also makes it symmetric, so the order the frames arrive in stops mattering. `Cloud → Difference` is now the Photoshop filter, and repeating the pair folds an already-folded field the way hammering Ctrl-F does, because `Cloud` is `varying` and reseeds each pass.

**`fold: 'none' | 'ridged' | 'billow'`** on `Cloud`, applied per octave inside the loop. `none` left every existing golden byte-identical.

The caveat about amplitude falloff turned out to be the whole story rather than a footnote. **Ridged on the harmonic `/(z+1)` falloff reads as grain, not terrain** — folding sharpens every octave, and harmonic keeps the fine ones roughly twice as loud as standard fBm, so sharpening those is exactly the wrong thing. It was obvious the moment the first golden rendered and would not have been obvious from reading the code. So `persistence` shipped alongside rather than later:

- A nullable float. `0.5` - standard fBm - is the default; `null` selects the original harmonic falloff and is kept only for compatibility. The same nullable pattern `ValueThreshold` uses for its auto threshold.
- **Harmonic was not merely a different falloff, it was a normalisation bug**, and that is why the default moved. The amplitudes are `1/(z+1)` - 1, ½, ⅓, ¼ - but the sum was divided by the *octave count* rather than by the sum of the amplitudes. Four octaves sum to 2.083 in amplitude and get divided by 4, so everything is scaled to about half, and it worsens with every octave added: a field of pure mid-grey renders at 66 rather than 127.5 at four octaves, 52 at six, and at six octaves plain `Cloud` **cannot emit a pixel brighter than 86 of 255**. `127.5 × (Σ amplitudes ÷ octaves)` predicts every measured mean to one decimal place. Persistence divides by the real amplitude sum, so mid-grey stays mid-grey at any octave count.
- The harmonic branch is still arithmetically identical to what it always was, so `persistence: null` reproduces pre-existing output exactly. Note `options.persistence === undefined ? 0.5 : options.persistence` rather than `?? 0.5`, or an explicit `null` would be coerced back to the default and harmonic would be unreachable.

**Gradient noise, and the quintic fade.** `Cloud` was *value* noise: a random scalar per lattice corner, interpolated. Value noise passes through its stored numbers, so every local maximum and minimum sits **on** a grid corner and the lattice is plainly visible — tolerable in fog, and much worse once ridging draws a sharp crease along it. It is gradient noise now: each corner hashes to one of eight directions and contributes `dot(gradient, offset)`, which is exactly zero at the corner itself. The lattice contributes a constant instead of a pattern, and the features move off it.

- **Eight integer-component directions**, not normalised. A normalised diagonal would put an irrational constant in the parity-critical path, where float32 and float64 round differently — the bug `ChromaticAberration` already had once. With 0 and ±1 every product is exact on both backends.
- **The fade is quintic now**, `6t⁵ − 15t⁴ + 10t³`. `smootherStep` had been sitting in the file unused since the rewrite while the code called `smoothStep`. This is not taste: cubic `3t² − 2t³` has `s″(0) = 6` and `s″(1) = −6`, so its second derivative jumps by 12 at every cell boundary, while the quintic's is 0 at both ends. Invisible in the noise, visible in anything that differentiates it — which is what `NormalGenerator` does.
- **Ridged is squared**, `(1 − |n|)²`, which is Musgrave's formulation and not decoration. Plain `1 − |n|` is biased high — it averaged 172 of 255 — so the crests washed out against an already-bright field. Squaring drops the mean to 132 and leaves the ridge lines at full brightness. Billow is the fold as it comes.
- **The output is scaled by 1.5** before mapping to 0–255. Gradient noise reaches ±1 but its rms is 0.24, so mapping the extremes directly leaves a nearly flat grey frame. 1.5 clips 0.7% of pixels, and only where saturating to black or white is what you wanted anyway.

**Value noise was dropped rather than kept as an option.** It is about twice as fast on the CPU — 18.8ms against 36.6ms for 512×512 at six octaves — but that is the fallback path for a filter that generates a texture, usually once, and the GPU path is the default and unaffected. A permanent second noise mode, a second set of goldens and a second thing to hold at parity is not worth 18ms on a path nobody renders in a loop, for a look that is strictly worse.

Worth recording, because it was 4× rather than the 30% it should have been: the gradient lookup **must be inlined in the loop**. Behind a six-argument function V8 declines to inline it and the whole filter costs 4.45× the value-noise version; read straight from two `Float64Array`s in the loop body it costs 1.95×. Measured, not guessed — a bare hash is 11ms per 6M calls, the same arithmetic behind a call is 60–86ms.

Tests: a golden and a GPU parity case each for `Difference`, `Cloud-ridged` and `Cloud-billow`, plus a property test that ridged and billow sum to 255 at every pixel on a single octave — which pins the fold arithmetic *and* the fact that both modes share one noise field, rather than merely pinning bytes the way a golden does.

Adding one filter also flushed out three more hardcoded copies of the dual-input list — in `filters.test.js`, in `schema.test.js`, and an `assert.equal(filterNames.length, 41)` that failed with a message saying nothing about what was wrong. All three now ask the catalogue.

*Chromatic aberration was on this list and is now shipped — it turned out `ChannelSeparate` had been it all along, with an inverted ramp. See #3.*

---

## 10. Modernise the CPU Path

**Effort: Medium** *(largely superseded — one item left worth doing)*

Written when the CPU path was the *only* path. It is now the fallback and the parity oracle, which changes the case for optimising it: the fallback runs where there is no WebGL2 at all, and the oracle wants to be obviously correct more than it wants to be fast.

Two of the four are off the list:

- ~~**Drop `CLARITY.ctx`** as a module-level singleton~~ ✓ **done** — pulled forward into #2. `core/imagedata.ts` prefers the `ImageData` constructor, with `setImageDataFactory()` for headless callers.
- ~~**Workers + `OffscreenCanvas`**~~ — **dropped**, not done. The chain left the main thread by moving onto the GPU instead; a worker would now mostly be relocating the fallback, and it would put a thread boundary between the parity oracle and the thing it is an oracle for.

What is still worth doing:

- **Stop allocating per frame.** Nearly every `doProcess` starts with a fresh `createImageData(w, h)` — at 60fps that is 60 new 8MB buffers per filter per second, straight into the GC. A double-buffered pool in `Pipeline` fixes it for the whole library at once, and it is the one item here that would show up in a profile.
- **`Uint32Array` views** for pointwise filters — one 32-bit read/write per pixel instead of four 8-bit ones. Real, but it obscures the code, and the code is the reference implementation the shaders are checked against. Legibility is worth more here than speed.

---

## ~~11. Docs, Types & a README That Sells It~~ ✓

**Done.** The README leads with the pitch, a screenshot of the playground and five example chains as live links — which works because the chain format *is* the URL format, so an example is a link rather than a picture that goes stale. `docs/FILTERS.md` is generated by `npm run docs` from `CATALOGUE`, the schemas, the golden images and the golden cases: a before/after pair, an options table and a playground link for all 41 filters.

Three things worth recording:

- **The examples are taken from the golden cases**, so `new Blur({ radius: 6 })` is provably the code that produced the image beside it. A hand-typed example is a claim; this one is checked on every run.
- **It is committed, not built on demand.** A filter change shows up as a docs diff in the same commit, so drift is something you approve rather than something that happens quietly. `test/docs.test.js` fails when the file does not match a fresh generation, when a filter or property is missing, when a playground link no longer round-trips through `buildChain`, or when the README's family table falls behind.
- **The metadata had to be finished first**, and doing it found two bugs: `EdgeDetector,channel=red` threw where `EdgeDetector,bogus=1` was forgiven, and EdgeDetector's shader hardcoded luma while its CPU path honoured `channel`. 39 undescribed schema fields were written, and four tests now fail if a new one appears.

Deliberately not done:

- **The playground links are derived from traits**, not curated — a starter gets the blank source, a height-map filter gets the height map, a temporal one gets a video, `SkinDetector` gets the face. Curated demos would show each filter off better, but the golden cases run against 64×48 fixtures the playground does not have, so they cannot simply be reused. A `demo` field per case is the fix, and it wants the source-list URL format from #5's follow-ups.

**Since, on the sample set.** The rule was sound but the pictures under it were not. The fallback source was `colours`, a smooth rainbow ramp with no high-frequency content, and it carried most of the catalogue — so every filter that works on *detail* demonstrated itself on an image that has none. A blur of a smooth ramp is a smooth ramp. Four samples in (`landscape`, `books`, `rorschach`, `box`), the fallback is now `landscape`, which has both saturated colour and fine texture, and a short `DEMO_SOURCE` table in `make-docs.js` covers the handful the traits cannot predict: Morphology wants the near-binary inkblot, the detail filters want small text. `box.mp4` — a bright cube on a dark ground, camera locked off — is what `DifferenceDetector` had been missing entirely: it compares every frame against the *first* one it saw, which means nothing on a handheld shot.

Three things this turned up:

- **`npm test` was validating a stale build.** Every test imports `dist/clarity.js`, and the playground tests serve `site/dist`, but neither was built by `npm test`. A `pretest` now builds both, costing ~7s. It immediately failed a site test that had been green against an old bundle since Rotator's default changed from 0 turns to 1 — a false green that had already survived a full run.
- **The docs test kept its own copy of the source-id list**, so a link naming a source the playground does not have would pass. It scrapes `sources.js` now.
- **The README's hand-written example chains were never checked**, unlike the generated ones, though they are the first thing anyone clicks. They are round-tripped now, which caught `ChromaticAberration,xdistance=8` on the first run — `8` had become the default, so it no longer survives `formatChain`.
- **Typedoc** — the `.d.ts` files and source comments are enough. Closing this rather than leaving it open.

---

## 12. Pipeline Fusion — Compile the Chain into One Shader

**Effort: High** *(depends on #3; explicitly a second phase, not part of it)*

#3 gives every filter its own shader and ping-pongs framebuffers between them: N filters = N passes = N full-resolution texture reads + N framebuffer writes. But most of those intermediates are never needed as *images* — they're just values on their way to the next stage. A **fusion pass** analyses the chain and emits a single program for each run of compatible filters, so `Desaturate → HSV Shift → Posterise → Threshold` becomes one draw call with the intermediates living in registers.

### The classification is the feature

Fusibility is a property of each filter's **sampling footprint**, and Clarity's 41 filters fall into four clean buckets:

- **Class A — pointwise** (reads only its own texel). `Invert`, `Desaturate`, `hsvShifter`, `ValueThreshold`, `GradientThreshold`, `Noise`, `HanoverBars`, `Brickulate`, `NormalIntensity`, `NormalFlip`, `FillRGB`/`FillHSV`, and the dual-input set (`Add`, `Subtract`, `Blend`, `Mask`, `Multiply` — pointwise across two samplers). These fuse by straight function composition: `c = posterise(hsvShift(desaturate(c)))`. This is the easy, obvious win.
- **Class B — pure UV transforms** (reads one texel, at a computed coordinate). `Translator`, `Mirror`, `Rotator`, `Tiler`, `Pixelate` (a UV quantisation), `Puzzler`, `Wave` (once #1 rewrites it as a gather), `ChannelSeparate` (three offset lookups). **These are the ones worth getting excited about** — coordinate transforms *compose*, so a run of N of them collapses to one composed `mapUV()` and a **single** texture read, no matter how long the run. Today that's N complete passes over the image. Mirror → Rotate → Translate → Tile is four full-res round-trips to produce what is mathematically one matrix multiply on a UV.
- **Class C — fixed-footprint kernels.** `EdgeDetector`, `Sharpen`, `Smoother`, `DotRemover`, `NormalGenerator`, plus the Sobel/Laplace/Emboss/Custom-Kernel additions from #9. Convolution is associative, so 3×3 ∘ 3×3 *is* a single 5×5 — but that's 25 taps instead of 9+9, so you're trading ALU for bandwidth and it's only a win when bandwidth-bound. Fusing a kernel with a *trailing* Class A run, on the other hand, is unambiguously free. Recommendation: fuse kernel→pointwise, don't bother fusing kernel→kernel until profiling says otherwise.
- **Class D — barriers** (need the whole image, or a previous frame). `Blur`/`StackBlur`/`Bleed` (separable — two passes with a mandatory intermediate), `Glow` (blur + blend), `MedianThreshold` (needs a full-image histogram before it can threshold), `Posteriser`'s MCut palette, `Contourer`, and the stateful trio `MotionDetector`/`Ghoster`/`DifferenceDetector`. These terminate a fusion group. Note the nuance: `MedianThreshold`'s *reduction* is a barrier but its *apply* step is pointwise, so it ends one group and starts the next — worth modelling as two nodes rather than one opaque blocker.

**Add this metadata during #3, even if fusion never ships.** The ping-pong renderer wants it anyway — to know which filters can render in place, which need a retained previous-frame texture, and which need a full intermediate. It's nearly free at that point and expensive to retrofit later.

> **What #3 actually declared, and what it didn't.** The advice above was half taken, and the half that was taken was taken for the reasons predicted. Filters now declare `stateful`, `varying`, `outputSize`, `retains`, `data` and `samples` — which between them identify every Class D barrier, because a barrier is exactly a filter that needs retained frames, a whole-image statistic, or a different output size. So **the group boundaries are already computable**; `gpuBlocker` and `endOfGPURun` in `Pipeline` do a cruder version of that walk today.
>
> What is *not* declared is the A/B/C distinction — pointwise vs UV-transform vs kernel. Nothing in #3 needed it, so adding it would have been speculative, and a shader's sampling footprint is not something a filter can be trusted to self-report accurately. The honest position: fusion needs one new declaration per filter, and the Class B list in this section is the design for it.

### The shape of the compiler

Filters stop exposing whole programs and instead expose GLSL **functions** against two hooks:

```glsl
// Class B contributes this:
vec2 clarity_mirror_uv(vec2 uv)          { return vec2(1.0 - uv.x, uv.y); }
// Class A contributes this:
vec4 clarity_invert(vec4 c, vec2 uv)     { return vec4(1.0 - c.rgb, c.a); }
```

The fuser walks the enabled chain, groups maximal runs by class, and code-generates a `main()` per group — composing all the Class B `mapUV`s into the single `texture()` coordinate, then threading the result through the Class A chain. Practical details that decide whether this is pleasant or miserable:

- **Mangle uniforms per stage index** (`u3_radius`, `u4_hue`) or two `Blur`s in one chain will collide.
- **Cache compiled programs against a structural signature** — the ordered list of enabled filter ids. Shader compilation is expensive (tens of ms, and synchronous unless you use `KHR_parallel_shader_compile`), so this only works if dragging a slider *doesn't* recompile. It doesn't need to: properties are uniforms. **Recompile on structure change (add / remove / reorder / enable-toggle), never on property change.** That distinction is exactly what the dirty-flag work in #4 and the schemas in #8 give you — `type: 'float'` → `uniform1f` binding, generated.
- **Cap the group size** and keep a runtime kill-switch back to plain ping-pong. Mobile drivers have real instruction-count and uniform limits, and a 12-stage fused shader is where you meet them.

### Honest expectations

The perf win is **bandwidth and pass count, not ALU** — the arithmetic was never the bottleneck. At 1080p RGBA8 each pass is ~8MB in and ~8MB out, so fusing a five-stage pointwise run saves roughly 66MB of traffic per frame and four framebuffer binds. On a discrete GPU with 400GB/s that's real but not transformative; on integrated and mobile tile-based GPUs — which particularly hate framebuffer round-trips — and at 4K, it's substantial. Framing it honestly: **#3 is what takes the library from unwatchable to 60fps; #12 is what takes 60fps to 60fps with headroom**, and it matters most on the weakest hardware. Class B chains are the exception where it's a genuine order-of-magnitude change, since N passes really do collapse to one.

The **quality** argument may actually be the stronger one. Every ping-pong hop through an RGBA8 framebuffer quantises intermediates to 8 bits per channel. A chain like `hsvShifter → NormalIntensity → GradientThreshold` currently loses precision *twice* on the way through, and banding compounds. Fused, the intermediates stay `highp float` in registers and only the final result is quantised. So fusion isn't just faster — it's visibly more correct, and it's the cheap alternative to float framebuffers (which would cost the bandwidth back).

### Why it must come after #3, not with it

- Debugging a wrong pixel in stage 4 of 6 is easy; debugging it inside one fused 6-stage shader is not. You want the per-filter shaders working and validated first.
- It gives you a free oracle. #6 uses the CPU path to validate the GPU path; #12 uses the **unfused ping-pong path to validate the fused path** — same trick, one level up. Fused output should be within tolerance of ping-pong output for any chain, which is a property you can fuzz over randomly generated pipelines.
- If #3 lands and profiling shows you're already GPU-idle at target resolution, you get to *not build this*, which is a legitimate outcome.

> **Still the right call to defer it, and now measurable.** The playground's `Compare backends` button reports real per-frame numbers for any chain, so the question "is fusion worth building" has stopped being a guess: build a long Class B chain, read the number, decide. Two things have also moved in fusion's favour since this was written — `Rotator` can change the frame size mid-chain (a fused group has to agree on one output size, so `outputSize` is now a group boundary as well as a barrier), and several filters gained multi-pass shaders, which are ping-pong hops that fusion cannot remove.

---

## 14. `filterImage()` — the Primitive Under the Action

**Effort: Low** *(depends on #13, which already contains most of it)*

#13 filters an `<img>` when you tell it to. That is the right shape for "here is a page of images, filter them", and the wrong shape for a game — which is the case it was actually built for.

A game has a **small, known set of states**: a portrait is healthy, hurt, critical or confused. #13 re-runs the whole thing on every transition — read pixels, run the chain, encode a PNG, decode it back — which is a few milliseconds at portrait size, at the exact moment something interesting is happening on screen. Precomputing every variant during a loading screen and then assigning a string is strictly better: no work at runtime, no encode, no first-application gap.

So expose the layer the action is already built on:

```js
const hurt = await filterImage('/portraits/knight.png', 'ChromaticAberration,xdistance=6/Desaturate,amount=0.4');
// => a blob URL. Put it wherever you like, revoke it when you're done.
```

That is nearly all existing code — #13 does load, read, run, encode, wrap internally. What it needs is to be pulled out, given a name, and given an explicit `revoke` so the caller owns the lifetime rather than the element.

Worth adding alongside it:

- **A batch form**, since the whole point is doing this at load time: take a map of `name → chain` and hand back a map of `name → url`, so the four variants of a portrait are one call and one `await`.
- **Accept an `ImageBitmap` or a `Blob`, not only a URL** — a game that has already loaded its atlas should not fetch the file a second time.
- **`fetch` rather than `new Image()`.** #13 sets `img.src` and waits, which works but leaves the cross-origin case dependent on the `crossorigin` attribute. Fetching gives explicit CORS control, a real HTTP error instead of a bare `onerror`, and it is the only route that works for #14's optional half, below.

### The optional half: `background-image`

The same action, pointed at a `<div>`. Read the URL out of `getComputedStyle(node).backgroundImage`, write the result back as an inline `background-image`. Reverting is *easier* than the `<img>` case — clear the inline style and the cascade re-applies whatever the stylesheet said.

Four things make it meaningfully more awkward than it looks, and they are the reason this is a maybe rather than a yes:

- **There is no `crossorigin` for a CSS background.** The browser fetches it without CORS mode and the pixels are unreadable, with no attribute to add. The only fix is to fetch the image yourself — which is why `filterImage` should be fetch-based, and why this half depends on that half.
- **Layered backgrounds are ambiguous.** `background-image: linear-gradient(...), url(x.png)` is legal and common. "The first `url()` layer" is a workable rule but it is a rule you have to remember rather than something obvious from the call site.
- **An inline style wins the cascade.** A stylesheet that swaps the background on `:hover` or a state class will be silently blocked by what the action wrote. The `<img>` case only fights the `src` attribute, which nothing else usually touches.
- **A size-changing filter interacts with `cover`.** A `Rotator` quarter turn changes the image's aspect ratio, so `background-size: cover` crops differently afterwards. Correct, and surprising exactly once.

### Honest expectations

`filterImage` is the useful part and is close to free. The `<div>` support is a convenience with four sharp edges, and an `<img>` is arguably the more correct element for a character portrait anyway — it is content rather than decoration, and it deserves an `alt`. Build the primitive; treat the background-image action as something to add if a real page wants it.

**And say plainly in the docs what neither of these is for.** `filter: blur(2px) saturate(0.3)` is free, GPU-composited and animatable, and beats anything here for the effects CSS already has. Clarity earns its place on `Puzzler`, `Bleed`, `ChromaticAberration`, `Posteriser` and `HanoverBars` — the ones with no CSS equivalent. A README that does not say so is selling the wrong thing.

---

## 15. Actually Publish `@calrk/clarity`

**Effort: Low** — *everything below is done except the one command.*

**Ready.** `package.json` now carries `publishConfig.access: "public"` (a scoped package publishes private by default and the first publish fails with a 402 without it), `prepublishOnly: "npm run build && npm test"` so the tarball cannot ship a `dist/` that does not match `src/`, `homepage` pointing at the playground, `bugs`, a full `author`, the repository URL corrected to the remote's capitalisation, and six more keywords — `image-filter`, `webgl`, `webgl2`, `shader`, `svelte`, `svelte-action` — which is the cheap half of the discoverability argument below.

**Two decisions left, and they are both yours:**

- **Source maps are 1.6 MB of the 2.3 MB unpacked.** Left in. Dropping them later reads as a regression while adding them later is a pure improvement, so the reversible direction is to ship them and see if anyone minds. 600 kB packed is not a burden on a library with no dependencies.
- **`0.1.0` or `1.0.0`.** Left at `0.1.0`. Everything the README promises is built and tested, so it understates — but `1.0.0` is a promise about `exports`, the chain string format and the schema shape, and #14 and #12 may still move all three. It should be `0.1.0` on purpose rather than by default.

Then it is `npm publish`, and the four claims below stop being 404s.

#2 made the package *publishable* and stopped there. `npm pack --dry-run` produces a clean 73-file tarball today — 516 kB packed, every path in the `exports` map resolving to a file that exists (`dist/clarity.js`, `dist/clarity.umd.cjs`, `dist/index.d.ts`, `dist/svelte.js`, `dist/svelte/index.d.ts`), README and LICENSE included automatically. The artefact is fine. Nobody has run `npm publish`.

That matters more than it did, because **three places now tell people the package exists**:

- `README.md:46` — `npm install @calrk/clarity`
- `site/seo.js:106` — the playground's FAQ answer, which is mirrored verbatim into the `FAQPage` structured data
- `site/seo.js:160` and `:240` — the colophon link and the `SoftwareSourceCode.url` in the JSON-LD, both pointing at `https://www.npmjs.com/package/@calrk/clarity`

All four are correct the moment this ships and 404 until it does. **Nothing about them needs changing on publish day — they need checking.** If publishing slips a long way, point the two `site/seo.js` references at the GitHub repo instead (`PACKAGE` is one constant at `site/seo.js:29`, used by both) rather than leaving a structured-data `url` that resolves to a 404, which is the one kind of wrong claim a crawler can verify.

### The things `npm publish` will hit

- **A scoped package publishes private by default.** `@calrk/clarity` will fail with a 402 unless the first publish passes `--access public` — which is a flag you have to remember exactly once and then never again. Put `"publishConfig": { "access": "public" }` in `package.json` and the problem stops existing.
- **Nothing guarantees `dist/` matches `src/`.** `dist/` is gitignored and regenerated by hand, so the tarball ships whatever was last built — possibly from a branch, possibly from a shader you were mid-way through changing. `"prepublishOnly": "npm run build && npm test"` makes that impossible; both already pass (504 tests) and take under 20 seconds.
- **`homepage` and `bugs` are missing.** npm's sidebar has nowhere to send anyone, and the best possible demo — the playground — is one line: `"homepage": "https://clarity.clarklavery.com"`. This is the same tie-in the JSON-LD does, on the third site that will rank for the package name.
- **`author` is `"Clark"`.** `"Clark Lavery <contact@clarklavery.com> (https://clarklavery.com)"` costs nothing and makes the npm page point at the portfolio, which is the whole reason the `#person` `@id` is shared between the playground and clarklavery.com in the first place.
- **`keywords` mentions neither Svelte nor the GPU** — see the subsection below; it is the cheap half of a question worth settling before the name is taken.
- **`repository.url` says `calrk/clarity`; the remote is `calrk/Clarity`.** GitHub redirects so both work, but npm resolves the README's relative image (`docs/playground.png`, which is deliberately not in `files`) against that URL, and the portfolio's `gitUrl` uses the capitalised form. Pick one.

### The Svelte action ships in the same tarball — and should stay that way

`@calrk/svelte-clarity` as a second package is the obvious idea and it is the wrong one. #13 rejected it on release-process grounds; publishing for real adds two harder reasons and one honest counter-argument.

**It is not a Svelte package.** `src/svelte/index.ts` contains no `svelte` import — the string does not appear in the file. Its one import is `@calrk/clarity` (`src/svelte/index.ts:26`), and an action is only `(node, params) => { update, destroy }`, so it already works in Svelte 4, Svelte 5, and standalone:

```js
const handle = clarity(document.querySelector('img'), 'Blur,radius=8');
```

Naming it `svelte-clarity` claims a framework tie it does not have. Worse, a package called `svelte-*` is expected to declare `svelte` as a peer dependency, which would *manufacture* a constraint that does not currently exist and cut off the standalone and other-framework use the entry point advertises. There is nothing to make peer of.

**Splitting it can put two copies of the library in one page.** Today `dist/svelte.js` imports `"./clarity.js"` — a relative path inside a single tarball, verified in the build output, so there is exactly one module instance no matter how anyone resolves it. As a separate package that becomes `import { Pipeline } from '@calrk/clarity'` under a semver range, and npm is free to install two copies at two versions. That duplicates the module-level `shared` backend at `src/svelte/index.ts:72` — the singleton that exists *specifically* because a browser hands out around sixteen WebGL contexts and then starts dropping the oldest. The failure mode is that the thing built to prevent context exhaustion becomes a way to cause it, and it would present as sprites that stop updating on a page with enough images, which is the hardest possible bug to attribute to packaging.

**The one real argument for splitting is discoverability, and it has a cheaper fix.** Nobody searching npm for "svelte image filter" finds `@calrk/clarity` — `keywords` is currently `canvas, image, filter, imagedata, image-processing`, which mentions neither Svelte nor the GPU. npm indexes keywords, so `svelte`, `svelte-action`, `webgl`, `webgl2`, `shader` and `image-filter` cost one line and are the same search-surface argument the JSON-LD work was making, one registry over. A `## Svelte` heading in the README with the `use:clarity` one-liner does the rest; npm renders it on the package page.

Revisit only if the adapter grows a genuine `svelte` import — a component, a store, anything using the runtime. At that point it is a real Svelte package with a real peer dependency and the split pays for itself. A DOM function that happens to satisfy an action contract is not that.

### Two decisions worth making before the first publish, not after

- **Source maps are 1.38 MB of the 1.9 MB unpacked size** — four `.map` files, 73% of the package, for a library whose entire point is that it has no dependencies. Shipping them is defensible (a stack trace from a minified UMD build is useless without them) and so is dropping them from `files`. Either way it is a decision, and changing it later is a version bump that looks like a regression.
- **`0.1.0` or `1.0.0`.** Everything the README promises is built and tested, so `0.1.0` understates it — but `1.0.0` is a promise about `exports`, the chain string format and the schema shape, all three of which #14 and #12 may still move. `0.1.0` is probably right; it should be right on purpose.

### Honest expectations

Publishing does not make anyone install it. What it does is make the three claims already shipped true, give the JSON-LD's `SoftwareSourceCode` node a real distribution URL, and put the package name in the one place people search for package names. The playground remains the thing that sells it.

Once it is live, two small additions to `site/seo.js` become possible and are worth doing in the same sitting: `sameAs` on the `SoftwareSourceCode` node listing both the npm page and the repo, and `softwareVersion` read from `package.json` rather than hardcoded — the version was deliberately left out of the graph precisely because there was nothing to be a version *of*.

---

## ~~16. Presets — the README's Example Chains, Inside the Playground~~ ✓

**Done.** Six presets as chips in the Pipeline panel, in `site/src/presets.js`. Applying one is `location.hash = preset.chain` and nothing else — the existing `hashchange` → `loadFromHash` path does the whole rebuild, so there is no second apply path, and browser-back is a free undo exactly as predicted. `test/docs.test.js` round-trips every chain, and `test/site.test.js` drives the CRT chip and checks the chain, the source, the URL and the back button together.

Four things worth recording:

- **The `Renderer` grew an `onFrame` callback**, and it was overdue: `site/src/main.js` had reimplemented `renderer.start()` — same rAF handle, same idempotency guard — with a comment saying it existed only because the library's loop called back into nothing. That copy is gone. It is also the hook a property animator needs (#18), which is why it is one option rather than an animation system.
- **The terrain preset had to be tuned down.** `fold=ridged` at the default persistence buries the ridges under fine octaves and the normal map reads as crumpled foil. `persistence=0.35` and `intensity=0.7` make it a surface.
- **The round-trip test earned its place twice.** It rejected `iterations=4` in the terrain chain because that is Cloud's default and `formatChain` omits it — a preset string that does not survive the format is a preset that does not match the link it produces.
- **A test flake turned out to be a real bug in the test harness.** `open('#x')` only waited for a frame size, but a URL differing solely in the hash is a *same-document* navigation, so the page does not reload and the previous source can still be rendering when that wait is already satisfied by the old readout. Switching from a video to a still occasionally measured the tail of the video. `open` now waits for the source picker to agree, which is what makes it mean "the page is showing x". Five consecutive full runs clean.

Deliberately not done: **thumbnails on the chips.** They want a build step that renders each preset against its source, which is the same step #11 wanted for curated per-filter demos. Worth doing once, for both.

---

<details>
<summary>The original entry</summary>

The playground gives you forty-nine filters and an empty pipeline. Everything interesting in this project is a *combination* — CRT is a lens curve, scanlines and a corner falloff; the composite-video look is `Bleed` into `ChromaticAberration` into `DotCrawl` — and none of that is discoverable by reading an alphabetical palette. The six best chains anyone has built are currently hand-written links in `README.md:18-24`, visible to someone reading GitHub and invisible to someone standing in the app.

**A preset is already a data type here.** A chain is a string, and that string *is* the URL, so a preset is `{ id, label, chain }` and applying one is:

```js
location.hash = preset.chain;   // 'landscape/FishEye,amount=0.35/HanoverBars,mode=scanlines/…'
```

That lands on the existing `hashchange` → `loadFromHash` path (`site/src/main.js:599`, wired at `:684`), which already clears the pipeline, rebuilds the filters, switches the source and syncs. **There is no second apply path to write, and therefore none that can drift from the link format.** Three things follow for free:

- **Undo costs nothing.** Assigning to `location.hash` pushes a history entry, so browser-back restores whatever chain was there. An action that overwrites your work normally needs a confirmation step; this one does not.
- **A preset carries its source**, because the chain format has a source segment. This is not a nicety — the CRT chain on `blank` is a black rectangle, and the `ScreenBurn` one is nothing at all without `box`.
- **They cannot rot.** The round-trip check added alongside the README links (`test/docs.test.js`) applies unchanged: every preset must name a source that exists in `sources.js` and survive `formatChain`. A renamed filter or a re-defaulted property fails the build — which has already happened once, when `ChromaticAberration,xdistance=8` stopped round-tripping the moment `8` became the default.

### Where it goes

**Not a tab in the Filters panel.** A tab hides the palette — the thing you use continuously — behind the thing you touch once a session, and it puts the control a long way from what it replaces. The preset overwrites the *pipeline*, so it belongs in the Pipeline panel (`site/index.html:107`), beside the existing `Clear` button:

- **Quick fix** — a `<select>` labelled "Start from…" in the `panel-head`. Two elements, no new CSS.
- **Better** — a row of chips under the heading, same treatment as the source picker. Browsable at a glance, and the labels are the point.
- **Best** — chips with a thumbnail each, generated the way the golden images are. Costs a build step to render each preset against its source, and that step is the same one #11 wanted for curated per-filter demos, so the two share the work.

### One list, three consumers

`site/src/presets.js` should be the single source, and the README and `docs/FILTERS.md` should read from it rather than keeping their own copies — the README's six links are exactly the second copy that goes stale. That makes this partly a cleanup: it removes hand-written chains from a file no test used to check, and it is the same move that `CATALOGUE` made for the filter list.

### Starting set

Each names its own source, which is half of why they read well:

| Preset | Chain | Why it earns a slot |
|---|---|---|
| CRT | `landscape` · FishEye + HanoverBars + Vignette | Already in the README; the clearest demonstration that Clarity composes |
| Composite video | `books` · Bleed + ChromaticAberration + DotCrawl | Nobody finds these three together by browsing |
| Security camera | `box` · Desaturate + Noise + ScreenBurn | The temporal family is the least discoverable, and `box` is the source built for it |
| Pencil sketch | `face` · EdgeDetector + Invert + Levels | The one result people recognise instantly |
| Speckle removal | `rorschach` · Morphology open, then close | Shows the operator pair doing something a threshold cannot |
| Terrain | `blank` · Cloud + NormalGenerator + NormalIntensity | Starters need no input, which is surprising until you see it |

**`ScreenBurn`'s defaults undersell it** and this is the feature that exposes it: at `length=12, decay=0.92` the scar is invisible on `box`, and at `length=32, decay=1` it draws a clean arc across the frame. Fix the default in the same sitting — it is the same class as `Wave` and `Rotator` defaulting to no-ops, only subtler, and only `ScreenBurn`'s own golden moves.

### The one that cannot ship yet

The fog/water chain — `Cloud` + `Translator` looping, multiplied against a second `Cloud` drifting the other way — is probably the most impressive thing on the list and **cannot be a preset until dual inputs take a pipeline.** `Multiply`'s second frame comes from the still-image sources only (`site/src/main.js:270`), and the chain format has no way to spell a nested chain. The library already supports it (`second` accepts a whole `Pipeline`); the playground and the string format do not. That is its own piece of work — a grammar change to the chain format — and it should not be smuggled into this one.

### Honest expectations

This is an afternoon, and it does not make the library better. What it does is make the library's *range* visible to someone who has just arrived, which is currently something you only learn by reading the README. Do it after #9 adds the filters worth combining.

</details>

---

## Rough Priority Order

### Shipped, in the order it happened

| # | Feature | Effort | Outcome |
|---|---------|--------|---------|
| 1 | Correctness sweep | Low | 4 crashing filters revived, 31→40 of 41 clean; 5 more found later by the contact sheet |
| 2 | ESM + Vite + publishable package | Medium | TS classes, 3 bundles, types, `npm test`; the type system found 3 more bugs |
| 7 | Licensing / replace GPL MCut | Low–Med | MIT throughout, and the replacement quantiser is 2–21× faster |
| 6 | Golden-image test suite | Medium | 63 goldens, contact sheet, determinism plumbing — and the parity harness written before there was a backend |
| 8 | Declarative filter schemas | Medium | 717 lines out, DOM dependency gone, `setProperty` the one write path |
| 4 | `Renderer` / `Pipeline` | Medium | Headless `Pipeline` + browser `Renderer`, stage caching, seven copied loops gone |
| 3 | GPU shader backend | High | Every filter has a shader; 63/63 parity cases on the GPU; 6 more bugs found |
| 5 | Demo site / playground | Med–High | One page replaces eight, driven by a browser test that has already caught 3 bugs |
| 13 | `clarity` action for `<img>` | Low | `@calrk/clarity/svelte`; chain-as-text moved into the library and is now shared with the playground |
| 11 | Docs — generated filter reference | Low | `docs/FILTERS.md` for all 41 filters, examples taken from the golden cases; finishing the metadata first found 2 bugs and 39 missing descriptions |
| 16 | Presets in the playground | Low | Six chips, one assignment to `location.hash`; deleted the playground's copy of `renderer.start()` on the way, and fixed a same-document-navigation bug in the test harness that had been read as a flake |

### Open

| # | Feature | Effort | Value |
|---|---------|--------|-------|
| 15 | Publish `@calrk/clarity` | Low | Medium — the package is built and packs clean; the README, the playground FAQ and the JSON-LD all already say it exists, and until it does they 404 |
| 14 | `filterImage()` primitive | Low | Medium–High — mostly extraction, and it is the shape a game actually wants: precompute variants at load, assign a string at runtime. The `background-image` half is optional |
| 9 | Finish the filter wishlist | Low each | Medium — genuinely cheap now; start with the custom 3×3 kernel and the rest are presets |
| 12 | Pipeline fusion | High | Medium — order-of-magnitude for UV-transform chains, and it fixes 8-bit precision loss between stages. Measure first: `Compare backends` will tell you whether it is worth it |
| 10 | CPU path modernisation | Medium | Low — two of four items are moot; only the per-frame allocation is worth doing |

**Do #9 next.** It was never the highest-value item, but it is now the cheapest by a wide margin and the ground has shifted under it: the drift tests added with #11 mean a new filter *cannot* land without its catalogue entry, its traits and a description for every property, and `npm run docs` picks it up with no further work. Adding filters no longer creates documentation debt, which is the whole reason it was worth doing #11 first.

Then #14, which is mostly extraction from code that already exists and is what makes #13 usable in the case it was built for.

**#16 shipped ahead of #9, which changes what #9 owes.** Every filter added from here should arrive with the question "what does this combine with?" answered — a new preset in `site/src/presets.js` where there is a good answer, and nothing where there is not. The list is the cheapest place in the project to make a new filter findable.

**#15 is not really a feature and should not wait its turn.** It is four lines of `package.json` and one command, and it is the only open item that closes something already shipped: the README, the playground's FAQ and its structured data all state that `@calrk/clarity` is installable. Do it whenever, but do it before anything else adds a fifth place that says so.

*More features to be added.*
