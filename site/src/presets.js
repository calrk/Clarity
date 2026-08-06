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
		id: 'dots',
		label: 'Dot painting',
		note: 'Coloured dots on white paper, each one sized by how dark the picture is beneath it',
		//The saturation lift is doing the same job it does in the pixel-art
		//preset, for the same reason: most of the frame ends up as white ground,
		//so what colour there is has to carry the whole picture on its own and
		//reads washed out at the source's own saturation.
		//
		//`scale` stays at 1.3 rather than going higher on purpose. The dots can
		//only fill their cell's corners past 1.41, and the moment they do the
		//paper stops showing through and it turns back into a photograph.
		chain: 'landscape/hsvShifter,saturation=1.5/Halftone,spacing=12,scale=1.3'
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
		note: 'Ridged noise read as heat, banded into a palette, and the whole crust creeping',
		//The core of it is Cloud into GradientMap: the field makes the shapes,
		//`steps` turns them into bands, and `cycle` rotates the colours *through*
		//those bands. The bands hold still and the colour moves, which is the
		//trick pixel artists animated waterfalls with.
		//
		//The last two are what make it read as molten rather than as a pattern.
		//`Glow` bleeds the bright seams into the dark rock, so the bands stop
		//looking like contour lines, and a slow `Translator` drags the whole crust
		//in a direction the palette is not moving in - two motions at different
		//rates, which is much harder to read as a loop than one.
		chain: 'blank/Cloud,fold=ridged,iterations=6/GradientMap,steps=17,cycle=0.15/Glow,radius=20/Translator,horizontal=0.3,vertical=0.1,speed=0.1'
	},
	{
		id: 'fog',
		label: 'Drifting fog',
		note: 'A noise field scrolling slowly under its own steam, and curling as it goes',
		//Two things had to land before this worked at all: Cloud holding its seed
		//instead of redrawing itself every frame, and Translator being able to
		//scroll. Before either, translating a cloud moved a picture that was
		//already a different picture.
		//
		//The Wave is at speed 0 on purpose - it is a *fixed* distortion, not a
		//second animation. The long wavelength curls the fog into something that
		//looks blown around rather than slid sideways, and because the field
		//underneath is the thing moving, the curl stays put while the fog runs
		//through it.
		chain: 'blank/Cloud,persistence=0.6,iterations=6/Translator,horizontal=0.06,vertical=0.02,speed=1/Wave,speed=0,frequency=45'
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
