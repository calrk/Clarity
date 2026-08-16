// SkinDetector across the skin-tone range.
//
// The golden test pins SkinDetector's output on a fixture with no skin in it, so
// it would happily stay green while the filter stopped detecting half the people
// who pointed a webcam at it. This is the test that would have caught that.
//
// The failure it guards against is not a tuning wobble - it is structural. Cb and
// Cr measure an offset from neutral grey, and that offset scales with the signal
// carrying it, so darker skin sits nearer the middle of the chroma plane than
// lighter skin of the same hue. Any fixed Cb/Cr box therefore has a wide margin
// at one end of the tone range and no margin at the other. Before the
// luminance-normalising gain went in, MST 9 and 10 were never detected at any
// exposure and MST 1 and 2 fared no better at the pale end.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SkinDetector, setImageDataFactory } from '../dist/clarity.js';

class NodeImageData {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.data = new Uint8ClampedArray(width * height * 4);
	}
}
setImageDataFactory((w, h) => new NodeImageData(w, h));

/**
 * The Monk Skin Tone scale, 1 (palest) to 10 (deepest).
 *
 * Ten swatches is not a dataset and this is not an accuracy benchmark - it is a
 * tripwire. It answers "does this still work across the range at all", which is
 * the question the golden fixture cannot ask. Real numbers want a tone-annotated
 * photographic set.
 */
const MST = [
	'f6ede4', 'f3e7db', 'f7ead0', 'eadaba', 'd7bd96',
	'a07e56', '825c43', '604134', '3a312a', '292420'
];

/** Exposure multipliers: the same skin in full light and in deepening shadow. */
const EXPOSURES = [1.0, 0.85, 0.7, 0.55, 0.45];

function swatch(hex, scale) {
	const frame = new NodeImageData(4, 4);
	const r = parseInt(hex.slice(0, 2), 16) * scale;
	const g = parseInt(hex.slice(2, 4), 16) * scale;
	const b = parseInt(hex.slice(4, 6), 16) * scale;
	for (let i = 0; i < frame.data.length; i += 4) {
		frame.data[i] = r;
		frame.data[i + 1] = g;
		frame.data[i + 2] = b;
		frame.data[i + 3] = 255;
	}
	return frame;
}

/** True when the filter called the whole patch skin. */
function detects(frame) {
	const out = new SkinDetector().process(frame);
	for (let i = 0; i < out.data.length; i += 4) if (out.data[i] !== 255) return false;
	return true;
}

test('detects every Monk Skin Tone swatch in full light', () => {
	const missed = MST.filter((hex) => !detects(swatch(hex, 1)));

	assert.deepEqual(missed, [], `skin tones not detected: ${missed.join(', ')}`);
});

test('detects every Monk Skin Tone swatch down to 45% exposure', () => {
	const missed = [];
	for (const [n, hex] of MST.entries()) {
		for (const exposure of EXPOSURES) {
			if (!detects(swatch(hex, exposure))) missed.push(`MST${n + 1}@${exposure}`);
		}
	}

	assert.deepEqual(missed, [], `skin tones not detected in shadow: ${missed.join(', ')}`);
});

// The point of the filter is a decision, so recall alone can be met by returning
// white everywhere. These are the things it has to keep saying no to.
test('rejects neutrals, foliage and sky', () => {
	const notSkin = {
		black: '000000',
		'mid grey': '808080',
		white: 'ffffff',
		'blue sky': '5a8cd2',
		'green leaf': '467832',
		'deep blue': '1e2d6e'
	};

	const wrong = Object.entries(notSkin)
		.filter(([, hex]) => detects(swatch(hex, 1)))
		.map(([name]) => name);

	assert.deepEqual(wrong, [], `non-skin colours detected as skin: ${wrong.join(', ')}`);
});

// Detection is pass/fail, so the tests above go green the moment a tone scrapes
// in by a hundredth of a unit. These two look at *how far* inside the bounds each
// tone sits, because that margin is the filter's tolerance for everything the
// tests do not simulate - JPEG chroma subsampling, white balance, sensor noise.
// It is the margin, not the verdict, that was the real defect: the previous
// bounds put a shadowed neck 0.4 units outside the Cb ceiling while its lit cheek
// cleared every bound comfortably.

/** How far inside the chroma bounds a colour sits. Negative means rejected. */
function margin(hex, scale) {
	const r = parseInt(hex.slice(0, 2), 16) * scale;
	const g = parseInt(hex.slice(2, 4), 16) * scale;
	const b = parseInt(hex.slice(4, 6), 16) * scale;
	const Y = 16 + (66 * r + 129 * g + 25 * b) / 256;
	const Cb = 128 + (-38 * r - 74 * g + 112 * b) / 256;
	const Cr = 128 + (112 * r - 94 * g - 18 * b) / 256;
	const gain = Math.min(160 / Math.max(Y, 1), 3);
	const cb = 128 + (Cb - 128) * gain;
	const cr = 128 + (Cr - 128) * gain;
	return Math.min(cb - 77, 127 - cb, cr - 129, 177 - cr);
}

const worstMargin = (tones) =>
	Math.min(...tones.flatMap((hex) => EXPOSURES.map((e) => margin(hex, e))));

test('no tone sits on a chroma boundary at any exposure', () => {
	const thin = [];
	for (const [n, hex] of MST.entries()) {
		for (const exposure of EXPOSURES) {
			const m = margin(hex, exposure);
			if (m < 1.5) thin.push(`MST${n + 1}@${exposure} (${m.toFixed(1)})`);
		}
	}

	assert.deepEqual(thin, [], `tones within 1.5 units of a bound: ${thin.join(', ')}`);
});

// The margin is U-shaped across the range - widest through the middle tones,
// narrowing at both ends, because both very pale and very deep skin carry less
// chroma than the tones between them. That shape is inherent. What is not
// inherent, and what this asserts, is that the narrowing be roughly even: the
// deep end must not be paying for the filter's accuracy in the middle. Under the
// bounds this replaced the dark half's worst margin was negative while the light
// half's was 9.9, and no test in the suite noticed.
test('the dark half is not held to a tighter margin than the light half', () => {
	const light = worstMargin(MST.slice(0, 5));
	const dark = worstMargin(MST.slice(5));

	assert.ok(
		dark >= light * 0.5,
		`dark tones clear the bounds by ${dark.toFixed(1)} at worst against ${light.toFixed(1)} for light tones`
	);
});
