//Voronoi object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { hashedRandom, hashedByte } from '../../helpers/hash.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

/** Twins of the shader constants of the same name. */
const DISTANCE_SCALE = 1.15;
const BORDER_SCALE = 3;

export type VoronoiMode = 'distance' | 'borders' | 'cells';

export interface VoronoiOptions extends FilterOptions {
	seed?: number | null;
	cells?: number;
	mode?: VoronoiMode;
}

/**
 * Cellular noise: one hashed feature point per cell, shaded by how far each
 * pixel is from the nearest of them.
 *
 * The sibling of `Cloud`, and it reuses the same hashing for the same reason -
 * a fragment shader has no random source, so the feature points are hashed from
 * their own cell coordinates and both backends land on identical positions.
 * Cells wrap at the frame edge, so the result tiles.
 *
 * Unlike `Cloud`, the grid is **not** square. `Cloud` lays `grid x grid` cells
 * over the frame whatever its shape, which stretches its noise; that is
 * invisible in fog and glaring in cells, where a stretched Voronoi reads as a
 * bug. The row count is derived from the aspect ratio instead, in integer
 * arithmetic so the two backends agree, which keeps the cells square.
 *
 * The three modes are three different textures from one distance field:
 * `distance` is dark at cell centres and bright at their edges, `borders` draws
 * the seams between neighbours - cracked ground, stained glass - and `cells`
 * fills each with a flat hashed value, for stone or scales.
 */
export class Voronoi extends Filter {
	//Pure, now that the seed is fixed per instance rather than drawn on every
	//call. It used to be varying, which meant a single Cloud produced a new
	//field every time it ran - invisible while a still rendered once, and a
	//strobe as soon as anything drove a loop. See Filter.seed.

	static override shader = /* glsl */ `
uniform float u_cells;
uniform float u_mode;

//Chosen from the measured distributions, so the modes use the range rather
//than crowding one end: F1 reaches about 1.0 and averages 0.44, while the gap
//between the two nearest averages 0.25 and wants a much harder stretch to read
//as a seam rather than a smear.
const float DISTANCE_SCALE = 1.15;
const float BORDER_SCALE = 3.0;

void main(){
	ivec2 p = outPixel();
	ivec2 frame = ivec2(uSize);

	int cols = max(1, int(u_cells));
	//rounded, in integers, so the cells come out square on a non-square frame
	int rows = max(1, (cols * frame.y + frame.x / 2) / frame.x);

	//same integer cell arithmetic as Cloud: which cell, and how far through it
	int remX = (p.x * cols) % frame.x;
	int remY = (p.y * rows) % frame.y;
	int cx = (p.x * cols - remX) / frame.x;
	int cy = (p.y * rows - remY) / frame.y;
	float fx = float(remX) / float(frame.x);
	float fy = float(remY) / float(frame.y);

	float best = 1e9;
	float second = 1e9;
	float nearest = 0.0;

	for(int dy = -1; dy <= 1; dy++){
		for(int dx = -1; dx <= 1; dx++){
			int nx = (cx + dx + cols) % cols;
			int ny = (cy + dy + rows) % rows;

			//the feature point's position inside its own cell, hashed
			float ox = float(dx) + hashedRandom(nx, ny, 0, uSeed) - fx;
			float oy = float(dy) + hashedRandom(nx, ny, 1, uSeed) - fy;
			float d2 = ox * ox + oy * oy;

			if(d2 < best){
				second = best;
				best = d2;
				nearest = hashedByte(nx, ny, 2, uSeed);
			} else if(d2 < second){
				second = d2;
			}
		}
	}

	float value;
	if(u_mode > 1.5){
		value = nearest;
	} else if(u_mode > 0.5){
		//zero exactly on the seam between two cells, growing inwards
		value = clamp((sqrt(second) - sqrt(best)) * BORDER_SCALE, 0.0, 1.0) * 255.0;
	} else {
		value = clamp(sqrt(best) * DISTANCE_SCALE, 0.0, 1.0) * 255.0;
	}

	writeRGB(vec3(value));
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
			description: 'Which arrangement of cells. Left empty it picks one when the filter is made and keeps it; set, the same number always gives the same result - which is what makes a link reproduce.'
		},
		cells: {
			type: 'int',
			label: 'Cells',
			min: 2,
			max: 64,
			step: 1,
			default: 8,
			description: 'How many cells across the frame. Rows are derived from the aspect so the cells stay square.'
		},
		mode: {
			type: 'select',
			label: 'Mode',
			default: 'distance',
			description: 'Three textures from one distance field.',
			//order matters: a select reaches the shader as its index
			options: [
				{ value: 'distance', label: 'Distance - blobs' },
				{ value: 'borders', label: 'Borders - cracks' },
				{ value: 'cells', label: 'Cells - flat stone' }
			]
		}
	};

	override properties: {
		seed: number | null;
		cells: number;
		mode: VoronoiMode;
	};

	constructor(options: VoronoiOptions = {}) {
		super(options);
		this.properties = {
			seed: options.seed === undefined || options.seed === null ? null : Math.round(options.seed),
			cells: options.cells || 8,
			mode: options.mode ?? 'distance'
		};
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const seed = this.seed;
		const width = frame.width;
		const height = frame.height;

		const cols = Math.max(1, this.properties.cells);
		const rows = Math.max(1, Math.floor((cols*height + Math.floor(width/2)) / width));
		const mode = this.properties.mode;

		for(let y = 0; y < height; y++){
			const remY = (y*rows) % height;
			const cy = (y*rows - remY) / height;
			const fy = remY / height;

			for(let x = 0; x < width; x++){
				const remX = (x*cols) % width;
				const cx = (x*cols - remX) / width;
				const fx = remX / width;

				let best = 1e9;
				let second = 1e9;
				let nearest = 0;

				for(let dy = -1; dy <= 1; dy++){
					for(let dx = -1; dx <= 1; dx++){
						const nx = (cx + dx + cols) % cols;
						const ny = (cy + dy + rows) % rows;

						const ox = dx + hashedRandom(nx, ny, 0, seed) - fx;
						const oy = dy + hashedRandom(nx, ny, 1, seed) - fy;
						const d2 = ox*ox + oy*oy;

						if(d2 < best){
							second = best;
							best = d2;
							nearest = hashedByte(nx, ny, 2, seed);
						} else if(d2 < second){
							second = d2;
						}
					}
				}

				let value;
				if(mode === 'cells'){
					value = nearest;
				} else if(mode === 'borders'){
					value = Math.min(1, Math.max(0, (Math.sqrt(second) - Math.sqrt(best)) * BORDER_SCALE)) * 255;
				} else {
					value = Math.min(1, Math.max(0, Math.sqrt(best) * DISTANCE_SCALE)) * 255;
				}

				const i = (y*width + x)*4;
				output.data[i  ] = value;
				output.data[i+1] = value;
				output.data[i+2] = value;
				output.data[i+3] = 255;
			}
		}

		return output;
	}
}
