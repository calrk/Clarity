# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@calrk/clarity` — a dependency-free canvas image filter library. 57 filters, each a class taking `ImageData` and returning `ImageData`, each with both a CPU implementation and a fragment shader. Published to npm as ESM + UMD + IIFE with `.d.ts`, plus a `/svelte` subpath for the `<img>` action. `README.md` is the user-facing documentation and is thorough — read it for the public API. This file covers what you need to *change* the library.

## Commands

```sh
npm run build       # tsc --noEmit, then library bundle, then the svelte adapter -> dist/
npm run typecheck   # tsc --noEmit alone
npm test            # pretest builds dist/ and site/dist first, then node --test test/*.test.js
npm run dev         # playground on Vite, library loaded from src/ (alias of `npm run site`)
npm run docs        # regenerate docs/FILTERS.md from the library
npm run deploy      # site:build, then wrangler deploy (assets-only Cloudflare Worker)
```

There is no linter or formatter. `tsc` is the only static check, and it is strict (`noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`).

### Running one test

**The tests import from `dist/`, not `src/`** (see [test/helpers/exports.js](test/helpers/exports.js)). `npm test` rebuilds first via `pretest`; running a file directly does not, so build before you do:

```sh
npm run build && node --test test/pipeline.test.js
node --test --test-name-pattern="every filter is in the catalogue" test/schema.test.js
```

Named suites: `test:golden`, `test:gpu` (CPU/GPU parity), `test:action` (the `<img>` action in a real browser).

The browser-driven suites — `gpu-parity`, `site`, `action` — drive headless Chrome through `puppeteer-core` and **skip cleanly when no Chrome is found**. A skipped GPU suite looks like a pass, so check the output rather than the exit code when you have touched a shader. Set `CHROME_PATH` if detection fails.

### Golden images

Filter output is pinned to committed PNGs in `test/golden/`, compared exactly on the CPU path. On failure the actual output and a visual diff land in `test/output/`.

```sh
npm run test:update-golden   # regenerate, then LOOK at the diff before committing
npm run test:sheet           # build test/contact-sheet/index.html
npm run test:fixtures        # regenerate the input images in test/fixtures/
```

Never regenerate a golden to make a test pass without looking at what changed. The contact sheet is the fastest way to see it: every filter's before/after side by side, with the percentage of pixels changed, and any filter that changed *nothing* highlighted.

## Architecture

```
src/core/      Filter (base class), Pipeline (headless chain + caching), Renderer (canvas + rAF loop),
               schema (property metadata + coercion), imagedata (the ImageData factory indirection)
src/gpu/       glsl (the prelude every shader compiles against), GLBackend (contexts, textures,
               framebuffers), execute (splits a chain into GPU runs and CPU runs)
src/filters/   one file per filter, grouped by family
src/registry.ts / catalogue.ts / chain.ts    name -> constructor, name -> metadata, chain <-> text
site/          the playground, plain DOM, no framework
```

**`Filter` is the whole contract.** Subclasses implement `doProcess` for the CPU and declare a `static shader` for the GPU. Everything the rest of the system needs to reason about a filter is a `static` on the class: `schema`, `stateful`, `varying`, `supportsGPU`, `outputSize`, `retains`, `data`, `samples`/`prepare`. Read [src/core/Filter.ts](src/core/Filter.ts) before adding or changing one — each static carries a comment explaining what breaks without it.

**The CPU implementation is the reference.** It is the oracle the parity tests compare against and the fallback where WebGL2 is missing, so a filter is not finished until both paths exist and agree. Shaders work in **0–255 colour space**, not 0–1, so the two backends compare like with like.

**`Pipeline` caches on purity.** Stages upstream of the first dirty one are served from cache, so a filter must honestly declare itself `stateful` (depends on frames already seen) or `varying` (reads the clock or the random source). Neither is ever cached. Get this wrong and you get either a stale frame or a strobe. `Renderer` is `Pipeline` plus a canvas, a source and a `requestAnimationFrame` loop; `Pipeline` itself has no DOM dependency at all, which is what lets the whole suite run in Node.

**Property writes go through `setProperty`.** It coerces per the schema and clamps to the declared range. Assigning to `properties` directly leaves you with `radius: "10"` from a DOM input, which works in some arithmetic and becomes `NaN` at `uniform1i`.

**The main entry must stay importable in Node.** `src/svelte/` is the only part that touches the DOM and is built separately ([vite.svelte.config.ts](vite.svelte.config.ts)), importing the library rather than bundling a second copy. Node has no global `ImageData`, hence `setImageDataFactory` in [src/core/imagedata.ts](src/core/imagedata.ts) — always construct frames with `createImageData`, never `new ImageData`.

## Adding or renaming a filter

Four lists must agree, and the tests enforce it:

1. `src/filters/<Family>/<Name>.ts` — the class
2. `src/registry.ts` — the `FILTERS` map (name → constructor)
3. `src/index.ts` — the named export *and* its options type
4. `src/catalogue.ts` — a `CATALOGUE` entry: summary, category, and any `traits` (`starter`, `dual`, `temporal`, `binary-in`, …)

Then `test/helpers/cases.js` needs a golden case with fixed options and a `gpu` comparison metric (`tolerance` for pointwise filters, `population` for ones with a hard decision boundary), `test/helpers/descriptions.js` needs a "what you should see" line for the contact sheet, and `npm run docs` must be run and `docs/FILTERS.md` committed — [test/docs.test.js](test/docs.test.js) fails if it is stale.

The playground is deliberately *not* on that list. It builds its palette from `CATALOGUE`, its controls from each filter's schema, and its code panel from the chain — if a new filter needs `site/` edited, the metadata was not enough.

## Conventions

Tabs, not spaces. Comments explain **why**, often at length, and frequently record what the code used to do and what that broke — that history is load-bearing documentation, so don't strip it when editing nearby. Filters that use randomness or time take injectable `random` and `now` options so their output is reproducible; a filter's `seed` is drawn once and fixed for its lifetime.

`FEATURES.md` is the backlog and the design record: shipped features keep their original write-up, and #9, #10, #12, #14 are the open ones.
