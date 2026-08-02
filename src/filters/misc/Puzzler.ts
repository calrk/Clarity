//Scrambles the canvas scene

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { FilterData } from '../../gpu/GLBackend.js';

export interface PuzzlerOptions extends FilterOptions {
	horizontalSegs?: number;
	verticalSegs?: number;
}

export class Puzzler extends Filter {
	static override shader = /* glsl */ `
uniform float u_horizontalSegs;
uniform float u_verticalSegs;

void main(){
	int columns = int(u_horizontalSegs);
	int rows = int(u_verticalSegs);
	ivec2 frame = ivec2(uSize);
	//Math.round, matching the CPU - int division would truncate and the tiles
	//would drift a pixel out on most frame sizes
	int tileWidth = int(floor(float(frame.x) / u_horizontalSegs + 0.5));
	int tileHeight = int(floor(float(frame.y) / u_verticalSegs + 0.5));

	ivec2 p = outPixel();
	int tileX = p.x / tileWidth;
	int tileY = p.y / tileHeight;

	//the CPU writes only the tiles themselves, so a frame that does not divide
	//evenly keeps a transparent strip down the right and bottom edges
	if(tileX >= columns || tileY >= rows){
		fragColor = vec4(0.0);
		return;
	}

	//uData holds the shuffle: red is the source tile index for this slot, green
	//marks the tile waiting for a swap partner. Both travel in the data texture
	//rather than as uniforms because the selection changes on a click, and a
	//click is not a property change.
	vec4 slot = dataTexel(tileX, tileY);
	int source = int(slot.r);
	int sourceX = source - (source / columns) * columns;
	int sourceY = source / columns;

	ivec2 within = ivec2(p.x - tileX * tileWidth, p.y - tileY * tileHeight);
	vec3 colour = srcTexel(ivec2(sourceX * tileWidth, sourceY * tileHeight) + within).rgb;

	//the selected tile is tinted blue while it waits for a partner
	if(slot.g > 0.5){
		colour.b += 80.0;
	}

	writeRGB(colour);
}
`;

	/** The shuffle grid: red is the source tile, green marks the selection. */
	static override data(filter: any): FilterData {
		const columns = filter.properties.horizontalSegs;
		const rows = filter.properties.verticalSegs;
		const bytes = new Uint8Array(columns * rows * 4);
		const selected = filter.selected;

		for(let y = 0; y < rows; y++){
			for(let x = 0; x < columns; x++){
				const at = (y*columns + x)*4;
				bytes[at] = filter.swaps[y][x];
				bytes[at + 1] = selected && selected[0] === x && selected[1] === y ? 255 : 0;
			}
		}

		return { width: columns, height: rows, bytes };
	}

	static override schema: FilterSchema = {
		horizontalSegs: { type: 'int', label: 'Columns', min: 2, max: 16, step: 1, default: 4 },
		verticalSegs: { type: 'int', label: 'Rows', min: 2, max: 16, step: 1, default: 4 }
	};

	override properties: {
		horizontalSegs: number;
		verticalSegs: number;
	};
	/** `[column, row]` of the tile awaiting a swap partner, or null. */
	selected: [number, number] | null | undefined = null;
	/** `swaps[row][column]` holds the source tile index for that slot. */
	swaps: number[][] = [];
	/** Frame size, captured on the first `doProcess` so `setClick` can map coords. */
	width?: number;
	height?: number;

	constructor(options: PuzzlerOptions = {}) {
		super(options);
		this.selected = null;

		this.properties = {
			horizontalSegs: options.horizontalSegs || 4,
			verticalSegs: options.verticalSegs || 4
		};

		this.shuffle();
	}

	//The grid is sized by the segment counts, so changing either invalidates it.
	//Puzzler had no controls at all before, which is why nothing noticed - now
	//that the schema declares the two counts, a control for them has to actually
	//work.
	override propertyChanged(key: string): void {
		if(key === 'horizontalSegs' || key === 'verticalSegs'){
			this.selected = null;
			this.shuffle();
		}
	}

	/** Builds the tile grid in order, then scrambles it. */
	shuffle(): void {
		this.swaps = [];
		let count = 0;
		for(let i = 0; i < this.properties.verticalSegs; i++){
			this.swaps[i] = [];
			for(let j = 0; j < this.properties.horizontalSegs; j++){
				this.swaps[i][j] = count++;
			}
		}

		for(let i = 0; i < 10*(this.properties.verticalSegs+this.properties.horizontalSegs)/2; i++){
			let a = Math.floor(this.random()*this.properties.verticalSegs);
			let b = Math.floor(this.random()*this.properties.horizontalSegs);
			let c = Math.floor(this.random()*this.properties.verticalSegs);
			let d = Math.floor(this.random()*this.properties.horizontalSegs);
			let temp = this.swaps[a][b];
			this.swaps[a][b] = this.swaps[c][d];
			this.swaps[c][d] = temp;
		}
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//setClick and the highlight below both need the frame size, and nothing else
		//ever set them - they were plain undefined, so every click resolved to NaN
		this.width = frame.width;
		this.height = frame.height;

		let minHeight = Math.round(frame.height/this.properties.verticalSegs);
		let minWidth = Math.round(frame.width/this.properties.horizontalSegs);

		for(let y = 0; y < this.properties.verticalSegs; y++){
			for(let x = 0; x < this.properties.horizontalSegs; x++){
				let pos = this.numToPos(this.swaps[y][x]);
				for(let newy = 0; newy < minHeight; newy++){
					for(let newx = 0; newx < minWidth; newx++){
						let pos1 = ((y*minHeight+newy)*frame.width + (x*minWidth+newx))*4;
						let pos2 = ((pos[1]*minHeight+newy)*frame.width + (pos[0]*minWidth+newx))*4;
						let pix2 = this.getPixel(frame.data, pos2);

						output.data[pos1]   = pix2[0];
						output.data[pos1+1] = pix2[1];
						output.data[pos1+2] = pix2[2];
						output.data[pos1+3] = 255;
					}
				}
			}
		}

		if(this.selected != undefined){
			for(let y = 0; y < minHeight; y++){
				for(let x = 0; x < minWidth; x++){
					let pos1 = ((this.selected[1]*minHeight+y)*frame.width + (this.selected[0]*minWidth+x))*4;
					output.data[pos1+2] += 80;
				}
			}
		}

		return output;
	}

	getPixel(picture: Uint8ClampedArray, pos: number): [number, number, number] {
		return [picture[pos], picture[pos+1], picture[pos+2]];
	}

	setPixel(picture: ImageData, xPos: number, yPos: number, newCol: number[]): void {
		let pos = (yPos*picture.width + xPos)*4;

		picture.data[pos] = newCol[0];
		picture.data[pos+1] = newCol[1];
		picture.data[pos+2] = newCol[2];
	}

	/** @param pos `[x, y]` in frame pixels. */
	setClick(pos: [number, number]): void {
		if(!this.width || !this.height){
			return;	//nothing has been processed yet, so the tile size isn't known
		}

		this.select(
			Math.floor(pos[0]/(this.width/this.properties.horizontalSegs)),
			Math.floor(pos[1]/(this.height/this.properties.verticalSegs))
		);
	}

	/**
	 * Picks a tile by grid position: the first call selects it, the second swaps
	 * the two.
	 *
	 * Separate from `setClick` because that has to map pixels to tiles and so
	 * cannot do anything until a frame has been through - which makes it useless
	 * to a caller that already knows the grid, and untestable before the first
	 * render.
	 */
	select(column: number, row: number): void {
		if(this.selected){
			//swaps is indexed [row][column], and selected/column/row are
			//[column, row] - these were indexed the wrong way round
			let temp = this.swaps[this.selected[1]][this.selected[0]];
			this.swaps[this.selected[1]][this.selected[0]] = this.swaps[row][column];
			this.swaps[row][column] = temp;

			this.selected = undefined;
		}
		else{
			this.selected = [column, row];
		}
	}

	numToPos(num: number): [number, number] {
		return [num % this.properties.horizontalSegs, Math.floor(num / this.properties.horizontalSegs)];
	}
}
