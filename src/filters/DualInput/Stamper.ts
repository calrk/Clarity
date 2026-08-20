//Stamper object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { hashedRandom } from '../../helpers/hash.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

/**
 * How far out the neighbour scan may reach, in cells.
 *
 * A stamp is drawn by every pixel it covers asking which stamps are near
 * enough to reach it, so the cost of a frame is this squared. Four is already
 * eighty-one cells per pixel; past that a filter that was meant to scatter
 * sprites is really a very slow blur. A stamp wide enough to need more than
 * this is clipped, which is visible - and is the honest failure for a control
 * that has been asked for something the method cannot do.
 */
const MAX_REACH = 4;

export interface StamperOptions extends FilterOptions {
	seed?: number | null;
	count?: number;
	size?: number;
	sizeJitter?: number;
	shadeJitter?: number;
	rotation?: number;
	spread?: number;
	wrap?: boolean;
}

/**
 * Scatters copies of a second image over the frame - grass blades, flowers,
 * leaves, stars.
 *
 * The second frame is a **sprite** here rather than a picture, which is the one
 * thing that makes this different from every other two-input filter: it keeps
 * its own size and its own shape instead of being stretched to the frame first
 * (see `Filter.resamplesSecond`), and it is expected to carry alpha. Give it
 * something fully opaque and you get a field of rectangles.
 *
 * The frame underneath may carry alpha too. Stamps composite source-over onto
 * whatever is there, so stamping onto transparent ground leaves the ground
 * transparent and the stamps solid - which is how you scatter something into a
 * sprite rather than onto a picture.
 *
 * **Positions come from a jittered grid, not from a list of random points.**
 * That is the whole design, and it is what a fragment shader can do: a shader
 * cannot draw a sprite anywhere it likes, because it never gets to choose where
 * it writes - it is asked for one pixel at a time and can only read. So the
 * frame is divided into cells, each cell holds exactly one stamp, and every
 * pixel asks the handful of cells near it whether their stamp reaches this far.
 * Scattering becomes gathering, `count` becomes a density rather than a total,
 * and both backends land on identical positions because the jitter is hashed
 * from the cell's own coordinates rather than drawn from a random stream.
 *
 * The same choice bounds the work: without cells, every pixel would have to
 * consider every stamp. It also means the result **tiles**, since the cells
 * wrap - a stamp overhanging the left edge comes back in on the right. Turn
 * `wrap` off and those overhangs are simply cut at the frame edge instead,
 * which is what a picture that is not going to be laid out four across wants.
 *
 * Overlaps composite in cell order, top-left to bottom-right, so a stamp lower
 * down the frame is drawn over one above it. That reads correctly for anything
 * standing up out of the ground, which is most of what this is for.
 *
 * **An optional third frame is a probability map** - see `Filter.triple`. Each
 * cell reads it once, at its own stamp's centre, and the value there is the
 * chance that stamp is drawn at all: white always, black never, mid-grey about
 * half the time. Without one every cell stamps, which is what this always did.
 *
 * That is a different thing from masking the output, and it is the reason this
 * exists. Fading a finished field of stamps against a mask leaves half-erased
 * sprites at the boundary - grass that thins by going transparent, which is not
 * how grass thins. Gating the placement instead means every stamp that survives
 * is whole, so a hard-edged map gives a clump with a ragged edge of complete
 * blades, and a soft one gives density falling away. Neither can be expressed
 * by any arrangement of the other filters.
 *
 * Two things surprise people once each:
 *
 * - **It places centres, not coverage.** A clump comes out about one stamp
 *   radius larger than the shape drawn on the map, because a stamp whose centre
 *   is just inside the edge still reaches past it.
 * - **The effective count is `count` times the map's coverage.** A map that is
 *   white over a fifth of the frame needs five times the count for the same
 *   density inside it, and asking for too few reads as *sparse* rather than as
 *   faint - which is at least a failure that says what it is.
 *
 * The map is read through the filter's `channel` option, grey by default, and
 * is stretched to the frame like every other picture - it is only the sprite on
 * the second input that keeps its own size.
 */
export class Stamper extends Filter {
	static override dual = true;

	//The probability map, which is optional - see the class comment, and
	//Filter.triple for why it is a third slot rather than a second use of the
	//second one.
	static override triple = true;

	//The sprite keeps its own pixels and its own aspect ratio. Stretching it to
	//the frame first - what every other two-input filter wants - would mean a
	//blade of grass on a 16:9 canvas arrived squashed, with nothing downstream
	//able to tell that it had been.
	static override resamplesSecond = false;

	static override shader = /* glsl */ `
uniform float u_count;
uniform float u_size;
uniform float u_sizeJitter;
uniform float u_shadeJitter;
uniform float u_rotation;
uniform float u_spread;
uniform float u_wrap;

const int MAX_REACH = ${MAX_REACH};

/** One sprite texel, colour scaled by its own alpha, alpha in 0-1. */
vec4 premultiplied(int x, int y){
	vec4 texel = src2Texel(ivec2(x, y));
	float a = texel.a / 255.0;
	return vec4(texel.rgb * a, a);
}

void main(){
	ivec2 frame = ivec2(uSize);
	ivec2 sprite = ivec2(uSrc2Size);
	ivec2 p = outPixel();

	vec4 under = srcTexel(p);

	if(sprite.x < 1 || sprite.y < 1){
		writePixel(under);
		return;
	}

	bool sown = hasSrc3();
	bool wrap = u_wrap > 0.5;

	int cols = max(1, int(u_count));
	//rounded, in integers, so the cells come out square on a non-square frame -
	//the same derivation Voronoi uses, and for the same reason
	int rows = max(1, (cols * frame.y + frame.x / 2) / frame.x);

	float cw = float(frame.x) / float(cols);
	float ch = float(frame.y) / float(rows);

	float stampW = u_size * 0.01 * float(frame.x);
	float stampH = stampW * float(sprite.y) / float(sprite.x);

	//How far a stamp can possibly reach, in cells: its own half-diagonal at the
	//largest scale the jitter allows, plus however far the spread may have
	//pushed it off centre. floor + 1 rather than ceil, so a value landing on a
	//whole number cannot round differently on the two backends.
	float maxScale = 1.0 + 0.5 * u_sizeJitter;
	float halfDiag = 0.5 * sqrt(stampW * stampW + stampH * stampH) * maxScale;
	int reachX = min(MAX_REACH, int(floor((halfDiag + 0.5 * u_spread * cw) / cw)) + 1);
	int reachY = min(MAX_REACH, int(floor((halfDiag + 0.5 * u_spread * ch) / ch)) + 1);

	//which cell this pixel is in, in integers so both backends agree exactly
	int remX = (p.x * cols) % frame.x;
	int remY = (p.y * rows) % frame.y;
	int cx = (p.x * cols - remX) / frame.x;
	int cy = (p.y * rows - remY) / frame.y;

	float px = float(p.x) + 0.5;
	float py = float(p.y) + 0.5;

	//Premultiplied, and accumulating an alpha rather than writing 255 - see
	//doProcess. Opaque ground carries alpha 1.0 the whole way through and comes
	//back out of the divide below untouched, which is why nothing that stamps
	//onto a photograph moved by a byte.
	float alphaOut = under.a / 255.0;
	vec3 colour = under.rgb * alphaOut;

	for(int dy = -reachY; dy <= reachY; dy++){
		int cellY = cy + dy;
		//Not wrapping means the cells outside the grid are simply not there, so
		//an edge stamp is cut off by the frame instead of its far-side copy
		//reaching in. The cells inside are untouched by this, which is why the
		//two modes differ only along the borders.
		if(!wrap && (cellY < 0 || cellY >= rows)){
			continue;
		}
		int ny = ((cellY % rows) + rows) % rows;

		for(int dx = -reachX; dx <= reachX; dx++){
			int cellX = cx + dx;
			if(!wrap && (cellX < 0 || cellX >= cols)){
				continue;
			}
			//the hash uses the wrapped cell and the geometry uses the unwrapped
			//one, which is what makes the pattern tile
			int nx = ((cellX % cols) + cols) % cols;

			float scale = 1.0 + (hashedRandom(nx, ny, 3, uSeed) - 0.5) * u_sizeJitter;
			float sw = stampW * scale;
			float sh = stampH * scale;

			float offX = (hashedRandom(nx, ny, 0, uSeed) - 0.5) * u_spread * cw;
			float offY = (hashedRandom(nx, ny, 1, uSeed) - 0.5) * u_spread * ch;

			float centreX = (float(cellX) + 0.5) * cw + offX;
			float centreY = (float(cellY) + 0.5) * ch + offY;

			//centred on upright, so a small rotation leans stamps both ways rather
			//than tipping the whole field one way - see the schema
			float angle = radians((hashedRandom(nx, ny, 2, uSeed) - 0.5) * u_rotation);
			float ca = cos(angle);
			float sa = sin(angle);

			//into the stamp's own frame: rotate the offset back, then scale it to
			//the sprite
			float rx = px - centreX;
			float ry = py - centreY;
			float u = ( rx * ca + ry * sa) / sw + 0.5;
			float v = (-rx * sa + ry * ca) / sh + 0.5;

			if(u < 0.0 || u >= 1.0 || v < 0.0 || v >= 1.0){
				continue;
			}

			//The placement gate, after the bounds check on purpose. It answers per
			//*cell*, not per pixel, so where it goes cannot change the picture -
			//but most of the cells this loop considers do not cover this pixel and
			//have already continued, so putting it here is one texture read per
			//cell that does rather than one per candidate.
			//
			//The map is sampled at the *wrapped* cell's centre. The geometry above
			//uses the unwrapped cell and the hashes use the wrapped one, which is
			//what makes the scatter tile; reading the map off the unwrapped centre
			//would give a stamp overhanging an edge a different answer from the
			//copy of it coming back in on the other side, and the tiling would go
			//with it.
			if(sown){
				ivec2 sample_ = ivec2(
					int(floor((float(nx) + 0.5) * cw + offX)),
					int(floor((float(ny) + 0.5) * ch + offY))
				);
				//>= rather than >, so black is never rather than almost never:
				//hashedRandom can return exactly 0, and a stamp appearing once in
				//sixteen million on ground the map said was bare is the kind of bug
				//that gets found years later.
				if(hashedRandom(nx, ny, 4, uSeed) >= channelValue(src3Texel(sample_)) / 255.0){
					continue;
				}
			}

			//Bilinear, and premultiplied before it is interpolated. Nearest would
			//quantise a stamp's edge to whole sprite texels and stair-step it,
			//which at any size above the sprite's own is the whole silhouette -
			//the same argument Displace makes. Premultiplying first is what stops
			//a transparent texel's colour bleeding into the blend: straight RGB
			//from a fully transparent pixel is meaningless, and interpolating it
			//puts a halo of it round every edge.
			float fx = u * float(sprite.x) - 0.5;
			float fy = v * float(sprite.y) - 0.5;
			int x0 = int(floor(fx));
			int y0 = int(floor(fy));
			float tx = fx - float(x0);
			float ty = fy - float(y0);

			vec4 s00 = premultiplied(x0,     y0);
			vec4 s10 = premultiplied(x0 + 1, y0);
			vec4 s01 = premultiplied(x0,     y0 + 1);
			vec4 s11 = premultiplied(x0 + 1, y0 + 1);

			vec4 texel = mix(mix(s00, s10, tx), mix(s01, s11, tx), ty);

			//The stamp's own shade, one draw per cell. It scales the premultiplied
			//colour and leaves the alpha alone, so a darker stamp is darker rather
			//than thinner - multiplying both would fade it into the background
			//instead, which is a different effect and the wrong one.
			float shade = 1.0 + (hashedRandom(nx, ny, 5, uSeed) - 0.5) * u_shadeJitter;

			colour = texel.rgb * shade + colour * (1.0 - texel.a);
			alphaOut = texel.a + alphaOut * (1.0 - texel.a);
		}
	}

	writePixel(vec4(alphaOut > 0.0 ? colour / alphaOut : vec3(0.0), alphaOut * 255.0));
}
`;

	static override schema: FilterSchema = {
		seed: {
			type: 'int',
			label: 'Seed',
			min: 0,
			max: 16777215,
			step: 1,
			default: null,
			nullable: true,
			nullLabel: 'random',
			description: 'Which scattering. Left empty it picks one when the filter is made and keeps it; set, the same number always gives the same arrangement - which is what makes a link reproduce.'
		},
		count: {
			type: 'int',
			label: 'Count',
			min: 1,
			max: 64,
			step: 1,
			default: 12,
			description: 'How many stamps across the frame. Rows follow from the aspect so the spacing stays even, so a square frame gets this many squared.'
		},
		size: {
			type: 'float',
			label: 'Size',
			min: 1,
			max: 100,
			step: 1,
			default: 12,
			description: "How wide a stamp is drawn, as a percentage of the frame. Its height follows from the sprite's own proportions."
		},
		sizeJitter: {
			type: 'float',
			label: 'Size jitter',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.3,
			description: 'How much stamps vary in size. 0 draws every one the same, which nothing in nature does; 1 runs from half size to half again.'
		},
		shadeJitter: {
			type: 'float',
			label: 'Shade jitter',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.2,
			description: "How much stamps vary in brightness, each one drawn a shade lighter or darker than the sprite. Centred like the size, so 1 runs from half as bright to half again - and it is a gain, so a bright sprite pushed above 1 washes towards white. Brightness rather than hue because a hue shift does nothing at all to a grey sprite, and half the things worth scattering are grey."
		},
		rotation: {
			type: 'float',
			label: 'Rotation jitter',
			min: 0,
			max: 360,
			step: 5,
			default: 0,
			description: 'How much stamps may turn, in degrees, centred on upright: 0 leaves them all straight, 30 leans them up to 15 either way, 360 faces them any which way. Centred rather than one-sided so that a small amount reads as a breeze rather than as the whole field falling over.'
		},
		spread: {
			type: 'float',
			label: 'Spread',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.8,
			description: 'How far a stamp may wander from the middle of its cell. 0 is a dead-straight grid; 1 lets it reach the cell wall, which is as scattered as one-per-cell gets.'
		},
		wrap: {
			type: 'bool',
			label: 'Wrap at the edges',
			default: true,
			description: 'Whether a stamp hanging over one edge comes back in on the opposite one. On, the result tiles, which is what a texture wants. Off, it is cut at the frame edge instead - which is what a single picture wants, since a blade of grass leaning in from nowhere along the top is hard to explain. Only the borders differ either way.'
		}
	};

	override properties: {
		seed: number | null;
		count: number;
		size: number;
		sizeJitter: number;
		shadeJitter: number;
		rotation: number;
		spread: number;
		wrap: boolean;
	};

	constructor(options: StamperOptions = {}) {
		super(options);
		this.properties = {
			seed: options.seed === undefined || options.seed === null ? null : Math.round(options.seed),
			count: options.count ?? 12,
			size: options.size ?? 12,
			//`??` throughout rather than `||`: 0 is a legal value for all four and
			//means "off" - no size variation, no shade variation, no rotation, a
			//perfect grid
			sizeJitter: options.sizeJitter ?? 0.3,
			shadeJitter: options.shadeJitter ?? 0.2,
			rotation: options.rotation ?? 0,
			spread: options.spread ?? 0.8,
			//`!== false` rather than `??`, so an explicit false is honoured and
			//anything else - including undefined - leaves the tiling on
			wrap: options.wrap !== false
		};
	}

	override doProcess(frame: ImageData, sprite?: ImageData, probabilityMap?: ImageData): ImageData {
		const { width, height } = frame;
		const output = createImageData(width, height);
		output.data.set(frame.data);

		//A two-input filter with nothing on its second input, or a sprite with no
		//pixels in it. Pipeline will not call it that way, but a filter used on its
		//own can be.
		if (!sprite || sprite.width < 1 || sprite.height < 1) {
			return output;
		}

		const seed = this.seed;
		const { count, size, sizeJitter, shadeJitter, rotation, spread, wrap } = this.properties;

		const cols = Math.max(1, count);
		const rows = Math.max(1, Math.floor((cols*height + Math.floor(width/2)) / width));

		const cw = width / cols;
		const ch = height / rows;

		const stampW = size * 0.01 * width;
		const stampH = stampW * sprite.height / sprite.width;

		const maxScale = 1 + 0.5*sizeJitter;
		const halfDiag = 0.5 * Math.sqrt(stampW*stampW + stampH*stampH) * maxScale;
		const reachX = Math.min(MAX_REACH, Math.floor((halfDiag + 0.5*spread*cw) / cw) + 1);
		const reachY = Math.min(MAX_REACH, Math.floor((halfDiag + 0.5*spread*ch) / ch) + 1);

		//Each cell's stamp worked out once instead of once per pixel that can see
		//it. The shader has no such luxury and recomputes these per fragment, which
		//is fine there and would be tens of millions of sines here - the
		//expressions are identical, so the two still agree.
		//Hoisted out of the pixel loop: the last index of each axis of the sprite,
		//and a scratch triple for the premultiplied sample.
		const sw2 = sprite.width - 1;
		const sh2 = sprite.height - 1;
		const premul = [0, 0, 0];

		const CELL = 8;
		const cells = new Float64Array(cols*rows*CELL);
		for(let ny = 0; ny < rows; ny++){
			for(let nx = 0; nx < cols; nx++){
				const at = (ny*cols + nx)*CELL;
				const scale = 1 + (hashedRandom(nx, ny, 3, seed) - 0.5)*sizeJitter;
				const angle = (hashedRandom(nx, ny, 2, seed) - 0.5) * rotation * Math.PI / 180;

				const offX = (hashedRandom(nx, ny, 0, seed) - 0.5) * spread * cw;
				const offY = (hashedRandom(nx, ny, 1, seed) - 0.5) * spread * ch;

				cells[at  ] = offX;
				cells[at+1] = offY;
				cells[at+2] = Math.cos(angle);
				cells[at+3] = Math.sin(angle);
				cells[at+4] = stampW * scale;
				cells[at+5] = stampH * scale;
				cells[at+7] = 1 + (hashedRandom(nx, ny, 5, seed) - 0.5)*shadeJitter;

				//The placement gate. One lookup per cell, decided here rather than in
				//the pixel loop - which is the whole reason this is cheap: a 32x32
				//grid is a thousand reads for the frame, against a per-pixel mask
				//that is a read for every pixel and cannot answer this question
				//anyway.
				//
				//Sampled at the *wrapped* cell's centre; the shader carries the
				//reasoning, and the two must agree or the two backends scatter
				//differently.
				if(probabilityMap){
					const mx = clampTo(Math.floor((nx + 0.5)*cw + offX), width - 1);
					const my = clampTo(Math.floor((ny + 0.5)*ch + offY), height - 1);
					const chance = this.getColourValue(probabilityMap, (my*width + mx)*4) / 255;
					cells[at+6] = hashedRandom(nx, ny, 4, seed) >= chance ? 0 : 1;
				}
				else{
					cells[at+6] = 1;
				}
			}
		}

		for(let y = 0; y < height; y++){
			const remY = (y*rows) % height;
			const cy = (y*rows - remY) / height;
			const py = y + 0.5;

			for(let x = 0; x < width; x++){
				const remX = (x*cols) % width;
				const cx = (x*cols - remX) / width;
				const px = x + 0.5;

				//Premultiplied, and carrying an alpha of its own rather than writing
				//255 at the end. This is `Filter.dual`'s rule read one step further,
				//and it has to be: the whole filter is a source-over composite, so
				//refusing to touch the alpha would mean a stamp laid on transparent
				//ground was drawn and then not shown. Alpha only ever goes up here -
				//`a + under*(1-a)` cannot fall below either - so opaque in is still
				//opaque out and the filter needs no `alpha-out` trait.
				//
				//Opaque ground is the identity case: alpha stays exactly 1, the
				//premultiply and the divide below are both by 1, and not one of the
				//six Stamper goldens moved.
				const to = (y*width + x)*4;
				let a = output.data[to+3] / 255;
				let r = output.data[to]*a;
				let g = output.data[to+1]*a;
				let b = output.data[to+2]*a;

				for(let dy = -reachY; dy <= reachY; dy++){
					const cellY = cy + dy;
					//not wrapping means the cells outside the grid are not there at all
					//- see the shader, and the schema for what that is for
					if(!wrap && (cellY < 0 || cellY >= rows)){
						continue;
					}
					const ny = ((cellY % rows) + rows) % rows;

					for(let dx = -reachX; dx <= reachX; dx++){
						const cellX = cx + dx;
						if(!wrap && (cellX < 0 || cellX >= cols)){
							continue;
						}
						//the hash uses the wrapped cell and the geometry the unwrapped
						//one, which is what makes the pattern tile
						const nx = ((cellX % cols) + cols) % cols;
						const at = (ny*cols + nx)*CELL;

						//the probability map said no for this cell - see the table above
						if(cells[at+6] === 0){
							continue;
						}

						const sw = cells[at+4];
						const sh = cells[at+5];
						const ca = cells[at+2];
						const sa = cells[at+3];

						const rx = px - ((cellX + 0.5)*cw + cells[at]);
						const ry = py - ((cellY + 0.5)*ch + cells[at+1]);
						const u = ( rx*ca + ry*sa) / sw + 0.5;
						const v = (-rx*sa + ry*ca) / sh + 0.5;

						if(u < 0 || u >= 1 || v < 0 || v >= 1){
							continue;
						}

						//Bilinear, premultiplied - see the shader, which carries the
						//reasoning. The four reads are why this is the expensive line
						//in the filter, and why the per-cell table above exists.
						const fx = u*sprite.width - 0.5;
						const fy = v*sprite.height - 0.5;
						const x0 = Math.floor(fx);
						const y0 = Math.floor(fy);
						const tx = fx - x0;
						const ty = fy - y0;

						const left = clampTo(x0, sw2);
						const right = clampTo(x0 + 1, sw2);
						const top = clampTo(y0, sh2)*sprite.width;
						const bottom = clampTo(y0 + 1, sh2)*sprite.width;

						const i00 = (top + left)*4;
						const i10 = (top + right)*4;
						const i01 = (bottom + left)*4;
						const i11 = (bottom + right)*4;

						const a00 = sprite.data[i00+3] / 255;
						const a10 = sprite.data[i10+3] / 255;
						const a01 = sprite.data[i01+3] / 255;
						const a11 = sprite.data[i11+3] / 255;

						const alpha = lerp(lerp(a00, a10, tx), lerp(a01, a11, tx), ty);

						for(let channel = 0; channel < 3; channel++){
							const upper = lerp(sprite.data[i00+channel]*a00, sprite.data[i10+channel]*a10, tx);
							const lower = lerp(sprite.data[i01+channel]*a01, sprite.data[i11+channel]*a11, tx);
							premul[channel] = lerp(upper, lower, ty);
						}

						//the cell's own shade, on the colour and not the alpha - see the
						//shader
						const shade = cells[at+7];

						r = premul[0]*shade + r*(1 - alpha);
						g = premul[1]*shade + g*(1 - alpha);
						b = premul[2]*shade + b*(1 - alpha);
						a = alpha + a*(1 - alpha);
					}
				}

				//back to straight colour, which is what an ImageData holds
				output.data[to  ] = a > 0 ? r/a : 0;
				output.data[to+1] = a > 0 ? g/a : 0;
				output.data[to+2] = a > 0 ? b/a : 0;
				output.data[to+3] = a*255;
			}
		}

		return output;
	}
}

/** GLSL `mix`, so the two paths interpolate identically. */
function lerp(from: number, to: number, at: number): number {
	return from + (to - from) * at;
}

/** GLSL `clamp` against a texture's last index. */
function clampTo(value: number, last: number): number {
	return value < 0 ? 0 : value > last ? last : value;
}
