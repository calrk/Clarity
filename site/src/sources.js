// What the pipeline is pointed at: bundled samples, your own file, or a webcam.
//
// The old examples were eight separate pages, one per source, each with its own
// copy of the render loop. `Renderer.source()` takes an image, a video or a
// canvas and works out the rest, so they collapse into one list of things to
// point it at.

import landscape from './samples/landscape.jpg';
import colours from './samples/colours.jpg';
import heightmap from './samples/heightmap.png';
import face from './samples/face.jpg';
import books from './samples/books.jpg';
import rorschach from './samples/rorschach.jpg';
import blade from './samples/blade.png';
import faceVideo from './samples/face.mp4';
import face2Video from './samples/face2.mp4';
import crystal from './samples/crystal.mp4';
import box from './samples/box.mp4';
//A video cannot be its own thumbnail without decoding it first, so each has a
//poster still. `videoThumbnail` covers the dropped-file case, where there is no
//poster to ship.
import faceVideoThumb from './samples/face-thumbnail.jpg';
import face2VideoThumb from './samples/face2-thumbnail.jpg';
import crystalThumb from './samples/crystal-thumbnail.jpg';
import boxThumb from './samples/box-thumbnail.jpg';

/** @typedef {{ id: string, label: string, kind: 'image'|'video'|'camera'|'blank', thumb?: string, glyph?: string }} SourceSpec */

/**
 * Everything the chain can be pointed at.
 *
 * Mutable, because a file you drop stays in the list for the session - see
 * `addSource`. Nothing is uploaded anywhere; the entry holds an object URL that
 * lives and dies with the tab.
 */
export const SOURCES = [
	// First in the list is what loads when the address bar names no source, so it
	// is the picture most people will judge the library by. It wants both halves:
	// saturated colour for the chroma filters, and fine texture - grass, rock,
	// branches - for everything that sharpens, blurs, finds edges or destroys
	// detail. `colours` has only the first half, and a blur of a smooth ramp is a
	// smooth ramp, so for most of the Process family it showed nothing at all.
	{ id: 'landscape', label: 'Landscape', kind: 'image', url: landscape, thumb: landscape },
	{ id: 'colours', label: 'Colours', kind: 'image', url: colours, thumb: colours },
	{ id: 'face', label: 'Face', kind: 'image', url: face, thumb: face },
	// Small text is the hardest thing to put through a filter and the easiest to
	// judge the result of - sharpening bites, blur and pixelation visibly cost
	// you something.
	{ id: 'books', label: 'Books', kind: 'image', url: books, thumb: books },
	// Near-binary, with speckle and hairline tendrils: what dilate, erode, open
	// and close were built for, and a stencil for the dual-input filters, whose
	// second frame can only come from a still image.
	{ id: 'rorschach', label: 'Inkblot', kind: 'image', url: rorschach, thumb: rorschach },
	{ id: 'heightmap', label: 'Height map', kind: 'image', url: heightmap, thumb: heightmap },
	// The only source with an alpha channel, and the only one that is a *sprite*
	// rather than a picture: Stamper scatters copies of its second frame and
	// reads the alpha for their shape, so with any of the others selected it
	// stamps opaque rectangles and looks broken. Every sample here was a
	// photograph until this filter existed, which is why it needed adding rather
	// than picking.
	//
	// It is in the list as a main source too, which is odd but harmless - and it
	// is the quickest way to see what a sprite has to look like before you
	// supply your own.
	{ id: 'blade', label: 'Blade (sprite)', kind: 'image', url: blade, thumb: blade },
	// The temporal filters - MotionDetector, Ghoster, DifferenceDetector,
	// ScreenBurn, ShotDetector - have nothing to compare on a still frame. Before
	// these, the only moving source was the webcam, so every one of them opened
	// with a permission prompt.
	{ id: 'facevideo', label: 'Face (video)', kind: 'video', url: faceVideo, thumb: faceVideoThumb, glyph: '▶' },
	// SkinDetector thresholds a fixed box in Cb/Cr, and chroma is an un-normalised
	// offset from neutral grey - so the same hue at a lower luminance sits closer
	// to the middle of that box's edge. Dark skin clears the Cr > 133 bound by
	// about 2, which is inside what chroma subsampling alone moves it by, where
	// the lighter face above clears it by 15. One face is not a test suite, but
	// with only the one you cannot see the filter fail at all.
	{ id: 'face2video', label: 'Face 2 (video)', kind: 'video', url: face2Video, thumb: face2VideoThumb, glyph: '▶' },
	{ id: 'crystal', label: 'Crystal', kind: 'video', url: crystal, thumb: crystalThumb, glyph: '▶' },
	// Bright object, dark ground, camera held still. ScreenBurn takes the
	// age-weighted maximum, so it needs something bright to leave a scar, and
	// DifferenceDetector compares every frame against the first one it saw, which
	// only means anything if the background stays put.
	{ id: 'box', label: 'Box', kind: 'video', url: box, thumb: boxThumb, glyph: '▶' },
	// The starters - Cloud, Fill, Gradient, Voronoi - ignore their input and generate a
	// frame from nothing, so they need something to be handed. This is that
	// something: an empty frame of a sensible size.
	{ id: 'blank', label: 'Blank', kind: 'blank', glyph: '▦', width: 960, height: 720 },
	{ id: 'camera', label: 'Webcam', kind: 'camera', glyph: '📷' }
];

let customCount = 0;

/** Adds a dropped file to the list, and returns its id. */
export function addSource(spec) {
	const id = `custom${++customCount}`;
	SOURCES.push({ ...spec, id });
	return id;
}

/** Loads a sample into an <img>, resolving once it can actually be drawn. */
export function loadImage(url) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.crossOrigin = 'anonymous';
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`could not load ${url}`));
		image.src = url;
	});
}

/** A transparent frame for the starters to fill. */
export function blankFrame(width, height) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas.getContext('2d').getImageData(0, 0, width, height);
}

/** A still from a video, for its entry in the source list. */
export function videoThumbnail(video) {
	const canvas = document.createElement('canvas');
	canvas.width = 160;
	canvas.height = Math.round((160 * video.videoHeight) / video.videoWidth) || 120;
	canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL('image/jpeg', 0.7);
}

/**
 * The webcam, the way current browsers actually do it.
 *
 * The 2014 examples used the callback form of `navigator.getUserMedia` plus
 * `URL.createObjectURL(stream)`, both of which every browser has since removed
 * - which is a large part of why the old examples stopped working at all.
 * It is `mediaDevices.getUserMedia()` into `srcObject` now, and it needs a
 * secure context, so localhost or HTTPS.
 */
export async function openCamera() {
	if (!navigator.mediaDevices?.getUserMedia) {
		throw new Error('This browser has no camera API. It needs HTTPS or localhost.');
	}

	const stream = await navigator.mediaDevices.getUserMedia({
		video: { width: { ideal: 960 }, height: { ideal: 720 } },
		audio: false
	});

	const video = document.createElement('video');
	video.srcObject = stream;
	video.muted = true;
	video.playsInline = true;
	await video.play();

	video.stop = () => {
		for (const track of stream.getTracks()) track.stop();
	};
	return video;
}

/**
 * A dropped or chosen file, as something a Renderer can take.
 *
 * The object URL is deliberately *not* revoked when the source is swapped away
 * from - the file stays in the list for the session, so it has to stay
 * loadable. It dies with the tab, and nothing leaves the machine.
 */
export async function loadFile(file) {
	const url = URL.createObjectURL(file);
	const label = file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Dropped file';

	if (file.type.startsWith('video/')) {
		const video = document.createElement('video');
		video.src = url;
		video.loop = true;
		video.muted = true;
		video.playsInline = true;
		await video.play();

		return { element: video, live: true, spec: { label, kind: 'video', url, thumb: videoThumbnail(video), glyph: '▶' } };
	}

	const image = await loadImage(url);
	return { element: image, live: false, spec: { label, kind: 'image', url, thumb: url } };
}

/** Re-opens a source that is already in the list. */
export async function openSource(spec) {
	if (spec.kind === 'camera') {
		return { element: await openCamera(), live: true };
	}
	if (spec.kind === 'blank') {
		return { element: blankFrame(spec.width, spec.height), live: false };
	}
	if (spec.kind === 'video') {
		const video = document.createElement('video');
		video.src = spec.url;
		video.loop = true;
		video.muted = true;
		video.playsInline = true;
		await video.play();
		return { element: video, live: true };
	}
	return { element: await loadImage(spec.url), live: false };
}
