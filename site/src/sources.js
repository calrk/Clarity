// What the pipeline is pointed at: bundled samples, your own file, or a webcam.
//
// The old examples were eight separate pages, one per source, each with its own
// copy of the render loop. `Renderer.source()` takes an image, a video or a
// canvas and works out the rest, so they collapse into one list of things to
// point it at.

import colours from './samples/colours.jpg';
import heightmap from './samples/heightmap.png';

/** @typedef {{ id: string, label: string, kind: 'image'|'video'|'camera', thumb?: string }} SourceSpec */

/** @type {SourceSpec[]} */
export const SAMPLES = [
	{ id: 'colours', label: 'Colours', kind: 'image', url: colours, thumb: colours },
	{ id: 'heightmap', label: 'Height map', kind: 'image', url: heightmap, thumb: heightmap },
	{ id: 'camera', label: 'Webcam', kind: 'camera' }
];

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

/** A dropped or chosen file, as something a Renderer can take. */
export async function loadFile(file) {
	const url = URL.createObjectURL(file);

	if (file.type.startsWith('video/')) {
		const video = document.createElement('video');
		video.src = url;
		video.loop = true;
		video.muted = true;
		video.playsInline = true;
		await video.play();
		video.stop = () => {
			video.pause();
			URL.revokeObjectURL(url);
		};
		return { element: video, live: true };
	}

	const image = await loadImage(url);
	return { element: image, live: false };
}
