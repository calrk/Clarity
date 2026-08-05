// Chains worth starting from.
//
// A preset is a chain string, and a chain string *is* the URL - so applying one
// is `location.hash = preset.chain` and the existing `hashchange` handler does
// the rest. There is no second apply path, and therefore none that can drift
// from what a shared link does.
//
// Each carries its own source, because most of these mean nothing without the
// right one: the CRT chain on `blank` is a black rectangle, and the security
// camera is nothing at all without something moving.
//
// `test/docs.test.js` round-trips every chain here through `buildChain` and
// `formatChain`, so a renamed filter or a re-defaulted property fails the build
// rather than silently loading a shorter chain than it claims.

/** @typedef {{ id: string, label: string, note: string, chain: string }} Preset */

/** @type {Preset[]} */
export const PRESETS = [
	{
		id: 'crt',
		label: 'CRT',
		note: 'A lens curve, scanlines and a corner falloff — three filters, not one',
		chain: 'landscape/FishEye,amount=0.35/HanoverBars,mode=scanlines/Vignette,amount=0.7,radius=0.4,softness=0.7'
	},
	{
		id: 'pixelart',
		label: 'Pixel art',
		note: 'Chunky pixels and six colours, the way a console with no memory did it',
		//Posteriser is doing the work here: a median cut to six colours per frame
		//is exactly the constraint an old palette was, and it is what makes the
		//result read as drawn rather than as a photo with big pixels. The
		//saturation lift is because a small palette always looks washed out.
		chain: 'landscape/Pixelate,size=8/Posteriser,colours=6/hsvShifter,saturation=1.4'
	},
	{
		id: 'composite',
		label: 'Composite video',
		note: 'Colour bleeding off its edges, fringing, and the dots that crawl along them',
		chain: 'books/Bleed,radius=24/ChromaticAberration,xdistance=16/DotCrawl,intensity=1'
	},
	{
		id: 'security',
		label: 'Security camera',
		note: 'Grainy monochrome, and a burn-in that only bright things leave',
		chain: 'box/Desaturate/Noise,intensity=12,monochromatic=true/ScreenBurn,decay=0.99'
	},
	{
		id: 'sketch',
		label: 'Pencil sketch',
		note: 'Edges, inverted, then pushed to paper white',
		chain: 'face/EdgeDetector/Invert/Levels,black=140,gamma=0.6'
	},
	{
		id: 'despeckle',
		label: 'Speckle removal',
		note: 'Open eats the specks and the hairlines; the thick shapes do not move',
		chain: 'rorschach/Morphology,mode=open,radius=3'
	},
	{
		id: 'lava',
		label: 'Flowing lava',
		note: 'Ridged noise read as heat, banded into a palette, and the palette rotating',
		//The whole point of the three together: Cloud makes a field, steps turns
		//it into bands, and cycle rotates the colours *through* those bands. The
		//bands hold still and the colour moves, which is what reads as flow -
		//exactly the trick pixel artists animated waterfalls with.
		chain: 'blank/Cloud,fold=ridged,iterations=6/GradientMap,steps=10,cycle=0.15'
	},
	{
		id: 'contour',
		label: 'Contour map',
		note: 'A height map read as heat - the same data a topographic map draws',
		chain: 'heightmap/GradientMap,ramp=thermal,steps=12'
	},
	{
		id: 'terrain',
		label: 'Terrain',
		note: 'Ridged noise read as a height map — a lit surface out of an empty frame',
		//A low persistence on purpose: at the default the fine octaves drown the
		//ridges and the normal map reads as crumpled foil rather than a surface.
		//`iterations` stays at its default, so it is not written here - the chain
		//format omits anything unchanged, and the drift test holds it to that.
		chain: 'blank/Cloud,fold=ridged,persistence=0.35/NormalGenerator/NormalIntensity,intensity=0.7'
	}
];
