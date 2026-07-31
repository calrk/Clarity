//Scrambles the canvas scene

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface PuzzlerOptions extends FilterOptions {
	horizontalSegs?: number;
	verticalSegs?: number;
}

export class Puzzler extends Filter {
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

		this.swaps = [];
		let count = 0;
		for(let i = 0; i < this.properties.verticalSegs; i++){
			this.swaps[i] = [];
			for(let j = 0; j < this.properties.horizontalSegs; j++){
				this.swaps[i][j] = count++;
			}
		}

		for(let i = 0; i < 10*(this.properties.verticalSegs+this.properties.horizontalSegs)/2; i++){
			let a = Math.floor(Math.random()*this.properties.verticalSegs);
			let b = Math.floor(Math.random()*this.properties.horizontalSegs);
			let c = Math.floor(Math.random()*this.properties.verticalSegs);
			let d = Math.floor(Math.random()*this.properties.horizontalSegs);
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

		let x = Math.floor(pos[0]/(this.width/this.properties.horizontalSegs));
		let y = Math.floor(pos[1]/(this.height/this.properties.verticalSegs));

		if(this.selected){
			//swaps is indexed [row][column], and selected/x/y are [column, row] -
			//these were indexed the wrong way round
			let temp = this.swaps[this.selected[1]][this.selected[0]];
			this.swaps[this.selected[1]][this.selected[0]] = this.swaps[y][x];
			this.swaps[y][x] = temp;

			this.selected = undefined;
		}
		else{
			this.selected = [x,y];
		}
	}

	numToPos(num: number): [number, number] {
		return [num % this.properties.horizontalSegs, Math.floor(num / this.properties.horizontalSegs)];
	}
}
