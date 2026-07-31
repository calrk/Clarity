export type RGBTriplet = [number, number, number];

export interface MedianCutOptions {
	/** Maximum number of palette entries to produce. */
	colours: number;
	/**
	 * Ignore pixels whose alpha is below this. Defaults to 1, so fully
	 * transparent pixels don't drag the palette towards black.
	 */
	alphaThreshold?: number;
}

/** One region of colour space, held as indices into the unique-colour table. */
interface Box {
	indices: number[];
	/** Total pixels represented, not the number of distinct colours. */
	population: number;
	/** Widest channel: 0 = red, 1 = green, 2 = blue. */
	axis: 0 | 1 | 2;
	/** How wide that channel is across the box. */
	extent: number;
}

/**
 * Median-cut colour quantisation: picks the `colours` most representative
 * colours in an image.
 *
 *   1. Take the smallest RGB box enclosing every colour in the image.
 *   2. Sort the enclosed colours along the box's longest axis.
 *   3. Split at the median, so each half holds about the same number of
 *      *pixels* - splitting at the midpoint instead would waste palette
 *      entries on sparse corners of the colour space.
 *   4. Repeat until there are `colours` boxes; each box averages to one entry.
 *
 * Works on a histogram of distinct colours rather than on every pixel, which
 * is what keeps it usable at video resolutions - a 1080p frame is 2 million
 * pixels but usually far fewer distinct colours.
 */
export function medianCut(
	data: Uint8ClampedArray,
	options: MedianCutOptions
): RGBTriplet[] {
	const colours = Math.floor(options.colours);
	const alphaThreshold = options.alphaThreshold ?? 1;

	if (!(colours >= 1)) {
		return [];
	}

	// 1. histogram, collapsing duplicates
	const counts = new Map<number, number>();
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] < alphaThreshold) {
			continue;
		}
		const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	const size = counts.size;
	if (size === 0) {
		return [];
	}

	const red = new Uint8Array(size);
	const green = new Uint8Array(size);
	const blue = new Uint8Array(size);
	const population = new Float64Array(size);

	let n = 0;
	for (const [key, count] of counts) {
		red[n] = (key >> 16) & 255;
		green[n] = (key >> 8) & 255;
		blue[n] = key & 255;
		population[n] = count;
		n++;
	}

	const channel = (axis: 0 | 1 | 2, index: number): number =>
		axis === 0 ? red[index] : axis === 1 ? green[index] : blue[index];

	// fewer distinct colours than asked for - there is nothing to quantise
	if (size <= colours) {
		const exact: RGBTriplet[] = [];
		for (let i = 0; i < size; i++) {
			exact.push([red[i], green[i], blue[i]]);
		}
		return exact;
	}

	const measure = (indices: number[]): Box => {
		let rMin = 255, rMax = 0;
		let gMin = 255, gMax = 0;
		let bMin = 255, bMax = 0;
		let total = 0;

		for (const i of indices) {
			if (red[i] < rMin) rMin = red[i];
			if (red[i] > rMax) rMax = red[i];
			if (green[i] < gMin) gMin = green[i];
			if (green[i] > gMax) gMax = green[i];
			if (blue[i] < bMin) bMin = blue[i];
			if (blue[i] > bMax) bMax = blue[i];
			total += population[i];
		}

		const spans: [number, number, number] = [rMax - rMin, gMax - gMin, bMax - bMin];
		let axis: 0 | 1 | 2 = 0;
		if (spans[1] > spans[axis]) axis = 1;
		if (spans[2] > spans[axis]) axis = 2;

		return { indices, population: total, axis, extent: spans[axis] };
	};

	// 2-4. split until we have enough boxes
	let boxes: Box[] = [measure(range(size))];

	while (boxes.length < colours) {
		// widest box first; ties go to the one covering more pixels
		let target = -1;
		for (let i = 0; i < boxes.length; i++) {
			if (boxes[i].extent === 0 || boxes[i].indices.length < 2) {
				continue;
			}
			if (
				target === -1 ||
				boxes[i].extent > boxes[target].extent ||
				(boxes[i].extent === boxes[target].extent &&
					boxes[i].population > boxes[target].population)
			) {
				target = i;
			}
		}

		// every remaining box is a single colour - the image simply has no
		// more distinct colours to give
		if (target === -1) {
			break;
		}

		const box = boxes[target];
		const sorted = [...box.indices].sort(
			(a, b) => channel(box.axis, a) - channel(box.axis, b)
		);

		// walk to the weighted median: the point where half the box's pixels
		// lie on each side
		const half = box.population / 2;
		let running = 0;
		let cut = 0;
		for (; cut < sorted.length - 1; cut++) {
			running += population[sorted[cut]];
			if (running >= half) {
				break;
			}
		}

		// both halves must be non-empty, or the loop would never terminate
		const at = Math.min(Math.max(cut + 1, 1), sorted.length - 1);

		boxes.splice(
			target,
			1,
			measure(sorted.slice(0, at)),
			measure(sorted.slice(at))
		);
	}

	// each box averages to one palette entry, weighted by pixel population
	return boxes.map((box) => {
		let r = 0;
		let g = 0;
		let b = 0;
		let total = 0;

		for (const i of box.indices) {
			const weight = population[i];
			r += red[i] * weight;
			g += green[i] * weight;
			b += blue[i] * weight;
			total += weight;
		}

		return [
			Math.round(r / total),
			Math.round(g / total),
			Math.round(b / total)
		] as RGBTriplet;
	});
}

/** Index of the closest entry in `palette` to `colour`, by squared RGB distance. */
export function nearestColourIndex(
	colour: ArrayLike<number>,
	palette: readonly RGBTriplet[]
): number {
	let best = 0;
	let bestDistance = Infinity;

	for (let i = 0; i < palette.length; i++) {
		const dr = colour[0] - palette[i][0];
		const dg = colour[1] - palette[i][1];
		const db = colour[2] - palette[i][2];
		const distance = dr * dr + dg * dg + db * db;

		if (distance < bestDistance) {
			bestDistance = distance;
			best = i;
		}
	}

	return best;
}

function range(length: number): number[] {
	const out = new Array<number>(length);
	for (let i = 0; i < length; i++) {
		out[i] = i;
	}
	return out;
}
