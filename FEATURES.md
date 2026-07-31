# Clarity — Feature List

Clarity is a canvas image-filter library from 2014 — ~41 filters across eight categories, all pure-JS `ImageData` loops, concatenated by Gulp 3 into one `CLARITY` global. The filter-chain design still holds up; everything around it (build, GPU, examples, tests) has aged out. Ordered roughly by effort / bang-for-buck, with the cheap de-risking work first.

---

## ~~1. Correctness Sweep — the bugs hiding in the current filters~~ ✓

**Effort: Low**

**Done.** All of the below are fixed in `src/`, and `build/` + `examples/js/` were regenerated (Gulp 3 can't run on modern Node, so the concat + uglify was reproduced by a one-off script — replacing it properly is #2).

Verified by running every filter headlessly over a synthetic frame with a stubbed canvas, twice each so stateful filters get a second pass. **Before: 31 of 41 filters clean, 4 hard crashes. After: 40 of 41 clean, 0 crashes**, plus 22 targeted behavioural assertions (mirror is an involution, Wave output is a permutation of its input, `ratio: 0` survives, Posteriser output is always a real palette entry, Puzzler permutes correctly on a non-square segment grid, and so on).

Three notes on judgement calls made along the way:

- **Posteriser's dead cache** was rewritten to match on *exact pixel equality* rather than the proximity test the original was reaching for. Proximity would have been faster but approximate — it can pick the wrong palette entry near a Voronoi boundary — and turning a dead branch into a lossy one isn't a bug fix. Equality still skips the palette search across flat regions, which is where the cost is.
- **`Cloud` still emits alpha `(red+green+blue)/3`** rather than 255, so with default options it produces a fully transparent image. That looks deliberate (alpha tracking the requested colour, for the WebGL-Material texture use), so it was left alone — but it's worth a decision.
- **`Rotator`'s non-square cropping** is still approximate. The 90°/180°/270° mapping is now correct and the operator-precedence bug is fixed, but the offset/crop path for non-square frames applies its offset to both axes and needs a proper rewrite.

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
- **Three bundles**: `dist/clarity.js` (ESM, what `import` gets), `dist/clarity.umd.cjs` (what `require()` gets — `.cjs` because the package is `"type": "module"`), and `dist/clarity.global.js` (IIFE exposing the `CLARITY` global). The examples load the third, so all 8 still work with only their `<script src>` changed.
- **`npm run dev`** serves `examples/` on port 8080, replacing the gulp-connect task that bound port 80 and needed admin.
- **The DOM dependency at import time is gone** (pulled forward from #10). `src/clarity.js`'s `document.createElement('canvas')` is replaced by `core/imagedata.ts`, which prefers the `ImageData` constructor. Node has no global `ImageData`, so a `setImageDataFactory()` injection point covers headless use — which is what #6's golden-image tests will need.
- **`npm test`** runs 55 assertions over the built bundle (every filter twice, plus targeted behaviour checks). Not the golden-image suite — that's still #6 — but enough to prove the migration is behaviour-preserving.
- `build/` and `examples/js/clarity*.js` are deleted; `dist/` is generated and gitignored.

**Bugs the type system found that the runtime sweep in #1 could not:**

- **`ChannelSeparate`'s "fix vertical lines" loop used `left`/`right` that it never declared.** Under `var` they leaked out of the *previous* loop, so every pixel in that pass read the same two stale indices — whatever the horizontal loop happened to leave behind. Genuinely wrong output for a decade, invisible to any runtime check.
- **`Contourer.setVar` and `Posteriser.setThresh` both read the loop counter after the loop**, relying on `var` hoisting. `let` broke them loudly; both now declare it outside.
- **`HanoverBars` reassigned one `pix` variable through RGB → YUV → RGB**, so its type changed twice under it. Split into separate bindings.

Two notes: the codemod initially dropped `doProcess` from `Sharpen` and `DifferenceDetector` — its brace matcher counted braces inside commented-out code — which the test suite caught. And the licence is now declared honestly as **GPL-3.0-or-later**, because MCut is still bundled; #7 is what makes it permissive.

### Original write-up

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

---

## 3. GPU Backend — Filters as Shaders

**Effort: High** *(depends on #2; much easier after #1)*

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

Then a `CLARITY.Renderer` (see #4) owns one GL context and **ping-pongs two framebuffers** through the chain, so a five-filter pipeline is five draw calls with *zero* CPU round-trips — no `getImageData`/`putImageData` between stages, which is where the real cost lives. `properties` map straight onto uniforms; the existing `setFloat`/`setInt`/`toggleBool` setters become uniform writes for free.

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

---

## 4. A `Renderer` / `Pipeline` Object

**Effort: Medium** *(pairs with #3)*

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

Fold in the other README to-do while you're here — **"a flag to each filter to only process if input/controls changed or forced"**. A `dirty` flag set by `setFloat`/`setInt`/`toggleBool`/`toggleEnabled` means a static image with unchanged controls costs nothing per frame, and lets the renderer cache each stage's output so tweaking filter #5 doesn't recompute #1–4. On a stateful filter (`Ghoster`, `MotionDetector`) the flag has to stay permanently dirty — worth an explicit `static stateful = true`.

This is also where the ping-pong FBO management from #3 lives, so it's worth designing the two together.

---

## 5. The Demo Site — A Live Pipeline Playground

**Effort: Medium–High** *(depends on #2, best after #3/#4)*

`examples/` is eight static HTML pages with a brown gradient, vendored jQuery 1.10 + jQuery UI 1.10, a checked-in `three.min.js`, and a randomly-chosen tagline. It also **no longer works**: `examples/Webcam/main.js:130-133` uses the callback form of `navigator.getUserMedia` plus `URL.createObjectURL(stream)`, both removed from every current browser (it's `navigator.mediaDevices.getUserMedia()` → `video.srcObject = stream` now, and it needs HTTPS or localhost). The video example ships a `.ogv`.

Replace the whole folder with **one app** that's a better demo than eight pages ever were:

- **A node-graph or drag-list pipeline editor** — the sortable list is genuinely Clarity's best idea; give it a proper UI. Drag filters in from a palette, reorder, toggle, and see the result update live at 60fps (which #3 makes possible for the first time).
- **Auto-generated controls.** Today each filter hand-builds its own DOM in `doCreateControls` — 40 near-identical slider blocks, and `CLARITY.Interface` is a hand-rolled DOM helper that predates every framework. Replace with a **declarative property schema** (see #8) that the site renders. Removes ~600 lines and means new filters get a UI for free.
- **Swap the input**: sample images, drag-and-drop your own, webcam (fixed), video, or a live three.js scene — the existing examples become *sources* in one app rather than separate pages.
- **Shareable pipelines** — serialise the chain to a URL hash so a link reproduces an exact filter stack. Very cheap, disproportionately good for showing the thing off.
- **Show the code** — a panel emitting the `new CLARITY.Renderer()...` snippet for the current graph, so the playground doubles as documentation.
- **Side-by-side CPU vs GPU timing** — an honest ms-per-frame readout for each backend is the most persuasive possible argument for #3.

Deploy via GitHub Actions → GitHub Pages (replacing the broken `gulp aws` task). SvelteKit or plain Vite + a small framework; the library itself must stay framework-free.

---

## 6. Test Suite — Golden Images

**Effort: Medium** *(depends on #2)*

There are zero tests. For an image library the natural form is **golden-image regression**: run each filter over a small fixed input PNG at fixed options, compare against a committed reference with a per-pixel tolerance, and write a diff image on failure. Vitest + `pixelmatch` + `node-canvas` (or `@napi-rs/canvas`) covers it.

Value is concentrated in three places:

- It's the only way to refactor 41 filters to ESM (#2) with any confidence.
- It's the **acceptance criterion for #3** — a GPU filter is "done" when its output matches the CPU reference within tolerance. Without this, porting 41 filters to GLSL is guesswork.
- Pure-maths helpers (`Operations.RGBtoHSV`/`HSVtoRGB` round-trips, `Pixel`, `clamp`, `colourDistance`) are trivially unit-testable and would have caught most of #1 outright.

---

## 7. Licensing — Replace the GPL Dependency

**Effort: Low–Medium**

There is **no LICENSE file** in the repo, and two pieces of vendored third-party code are compiled into the build:

- `src/helpers/MCut.js` is **GPL-3.0** (median-cut.js). Because Gulp concatenates it into `clarity.js`, the entire distributed bundle is arguably a GPL derivative — which makes Clarity unusable in most projects and unpublishable as a permissive npm package.
- `src/helpers/StackBlur.js` is Mario Klingemann's MIT-licensed StackBlur (v0.5, 2010) — fine to keep, but the attribution needs to survive minification and be listed in the README.

Actions: pick and add a LICENSE (MIT is the norm for this kind of library); replace MCut with a from-scratch median-cut or k-means quantiser (~150 lines, and a good excuse to fix the `// TODO fix NaNs` at `MCut.js:393`); or split it out as an optional `clarity-posterise-gpl` package. Once #3 lands, palette generation moves to a compute shader anyway and the dependency largely evaporates.

Unglamorous, but it's the difference between a library people can use and a repo people can only read.

---

## 8. Declarative Filter Schemas — Delete `doCreateControls`

**Effort: Medium** *(unblocks #5, simplifies #3)*

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

---

## 9. Finish the Filter Wishlist

**Effort: Low each, once #3 lands**

The README's "Filters to be made" list has been sitting there since 2014. Most are near-trivial once a kernel shader template exists:

- **Custom 3×3 kernel** — the generic case; ship it and Sobel/Laplace/Emboss are presets rather than files.
- **Sobel** and **Laplace** edge detection — the current `EdgeDetector` uses a single 8-neighbour kernel with no gradient magnitude; Sobel's dual-pass X/Y is both better and, on GPU, free.
- **Emboss**, **Sepia** — pointwise/kernel one-liners.
- **Bloat/Erode** — morphological ops; also makes `DotRemover` redundant (open/close does it better and generalises past binary images).
- **Histogram** — needs a reduction, so it's the natural first WebGPU compute shader.
- **Skeletiser**, **Crackulate**, **Screen burn**, **Dot crawl**, **Shot detector**.

Also worth adding now that GPU makes them cheap: **bilateral filter**, **chromatic aberration**, **CRT/barrel distortion**, **dithering** (Bayer + Floyd–Steinberg — the latter is sequential, so CPU), **LUT/colour-grade** from a 3D texture. The LUT one in particular turns Clarity into something people would actually reach for.

---

## 10. Modernise the CPU Path

**Effort: Medium** *(mostly obsoleted by #3 — do only the cheap parts)*

For the WebGL-less fallback and Node use, the CPU path has easy wins:

- **Stop allocating per frame.** Nearly every `doProcess` starts with `CLARITY.ctx.createImageData(w, h)` — at 60fps that's 60 fresh 8MB buffers per filter per second, straight into the GC. A double-buffered pool in the `Renderer` (#4) fixes it for the whole library at once.
- **`Uint32Array` views** for pointwise filters — one 32-bit read/write per pixel instead of four 8-bit ones.
- **Workers + `OffscreenCanvas`** — move the chain off the main thread so the page stays responsive; `ImageData` is transferable, so handoff is zero-copy.
- **Drop `CLARITY.ctx`** as a module-level singleton (`src/clarity.js:3`) — it makes the library unimportable outside a browser and is only used as an `ImageData` factory. `new ImageData(w, h)` has been supported everywhere for years.

---

## 11. Docs, Types & a README That Sells It

**Effort: Low–Medium** *(depends on #2, #8)*

The README is a flat feature list with broken markdown (`####Normal Flip`, `####Histogram` — missing spaces after the hashes, so they render as literal text) and no install instructions, no usage example, no options reference, and no screenshots — for an *image* library.

- Install + 5-line quickstart at the top.
- **One before/after image per filter**, generated automatically from the golden-image fixtures in #6 so they can never go stale.
- Options reference auto-generated from the schemas in #8.
- A link to the playground (#5) above the fold.
- Typedoc from the TypeScript in #2.

---

## 12. Pipeline Fusion — Compile the Chain into One Shader

**Effort: High** *(depends on #3; explicitly a second phase, not part of it)*

#3 gives every filter its own shader and ping-pongs framebuffers between them: N filters = N passes = N full-resolution texture reads + N framebuffer writes. But most of those intermediates are never needed as *images* — they're just values on their way to the next stage. A **fusion pass** analyses the chain and emits a single program for each run of compatible filters, so `Desaturate → HSV Shift → Posterise → Threshold` becomes one draw call with the intermediates living in registers.

### The classification is the feature

Fusibility is a property of each filter's **sampling footprint**, and Clarity's 41 filters fall into four clean buckets:

- **Class A — pointwise** (reads only its own texel). `Invert`, `Desaturate`, `hsvShifter`, `ValueThreshold`, `GradientThreshold`, `Noise`, `HanoverBars`, `Brickulate`, `NormalIntensity`, `NormalFlip`, `FillRGB`/`FillHSV`, and the dual-input set (`AddSub`, `Blend`, `Mask`, `Multiply` — pointwise across two samplers). These fuse by straight function composition: `c = posterise(hsvShift(desaturate(c)))`. This is the easy, obvious win.
- **Class B — pure UV transforms** (reads one texel, at a computed coordinate). `Translator`, `Mirror`, `Rotator`, `Tiler`, `Pixelate` (a UV quantisation), `Puzzler`, `Wave` (once #1 rewrites it as a gather), `ChannelSeparate` (three offset lookups). **These are the ones worth getting excited about** — coordinate transforms *compose*, so a run of N of them collapses to one composed `mapUV()` and a **single** texture read, no matter how long the run. Today that's N complete passes over the image. Mirror → Rotate → Translate → Tile is four full-res round-trips to produce what is mathematically one matrix multiply on a UV.
- **Class C — fixed-footprint kernels.** `EdgeDetector`, `Sharpen`, `Smoother`, `DotRemover`, `NormalGenerator`, plus the Sobel/Laplace/Emboss/Custom-Kernel additions from #9. Convolution is associative, so 3×3 ∘ 3×3 *is* a single 5×5 — but that's 25 taps instead of 9+9, so you're trading ALU for bandwidth and it's only a win when bandwidth-bound. Fusing a kernel with a *trailing* Class A run, on the other hand, is unambiguously free. Recommendation: fuse kernel→pointwise, don't bother fusing kernel→kernel until profiling says otherwise.
- **Class D — barriers** (need the whole image, or a previous frame). `Blur`/`StackBlur`/`Bleed` (separable — two passes with a mandatory intermediate), `Glow` (blur + blend), `MedianThreshold` (needs a full-image histogram before it can threshold), `Posteriser`'s MCut palette, `Contourer`, and the stateful trio `MotionDetector`/`Ghoster`/`DifferenceDetector`. These terminate a fusion group. Note the nuance: `MedianThreshold`'s *reduction* is a barrier but its *apply* step is pointwise, so it ends one group and starts the next — worth modelling as two nodes rather than one opaque blocker.

**Add this metadata during #3, even if fusion never ships.** The ping-pong renderer wants it anyway — to know which filters can render in place, which need a retained previous-frame texture, and which need a full intermediate. It's nearly free at that point and expensive to retrofit later.

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

---

## Rough Priority Order

| # | Feature | Effort | Value |
|---|---------|--------|-------|
| ✓ | Correctness sweep | Low | Done — 4 crashing filters revived, 31→40 of 41 clean |
| ✓ | ESM + Vite + publishable package | Medium | Done — TS classes, 3 bundles, types, `npm test`; found 3 more bugs |
| 7 | Licensing / replace GPL MCut | Low–Med | High — the difference between publishable and not |
| 6 | Golden-image test suite | Medium | High — the acceptance criterion for the GPU port |
| 4 | `Renderer` / pipeline object | Medium | High — kills seven copies of the same loop; home for FBO ping-pong |
| 8 | Declarative filter schemas | Medium | High — removes ~600 lines, fixes the dead sliders, feeds #3/#5/#6/#11 |
| 3 | GPU shader backend | High | Highest payoff, highest cost — do it in the three tiers, not in one go |
| 5 | Demo site / pipeline playground | Med–High | High — the thing you show people; current examples are broken anyway |
| 9 | Finish the filter wishlist | Low each | Medium — cheap and fun once the kernel template exists |
| 11 | Docs & types | Low–Med | Medium — matters the moment anyone else looks at it |
| 12 | Pipeline fusion | High | Medium — big for UV-transform chains and weak GPUs; also fixes 8-bit precision loss. Classification metadata in #3, compiler later |
| 10 | CPU path modernisation | Medium | Low–Medium — mostly superseded by #3; cherry-pick the allocation fix |

**Suggested order of attack:** ~~1~~ → ~~2~~ → **7** → 6 → 4/8 → 3 (tier by tier) → 5 → 9/11 → 12.

*More features to be added.*
