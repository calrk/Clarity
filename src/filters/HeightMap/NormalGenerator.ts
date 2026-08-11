//NormalGenerator object
//Contains a bit of vector maths, which may be pulled out in future if other filters require it

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface NormalGeneratorOptions extends FilterOptions {
	intensity?: number;
}

/**
 * Reads brightness as height and writes the surface normal at each pixel.
 *
 * **The encoding is OpenGL tangent space**, `[-1,1]` mapped onto `0-255` in all
 * three channels, so flat is `(128, 128, 255)`. Two details in it look like
 * mistakes and are not:
 *
 * - **Red is negated and green is not.** This filter works in image space,
 *   where y runs *down*, and a normal map is read in texture space, where v
 *   runs *up*. That flip is worth exactly one negation, and green is where it
 *   lands. The result is the OpenGL convention - a dome's right flank is
 *   red-bright, its top flank green-bright - and {@link NormalFlip} is there
 *   for consumers wanting DirectX's inverted green.
 * - **Blue is negated too**, because the four cross products below are wound so
 *   that they all come out pointing *into* the surface. Negating recovers the
 *   outward normal, and the same negation is already on red for that reason as
 *   well as the one above.
 *
 * Blue used to be written as `-n.z * 255`, mapping `[0,1]` rather than
 * `[-1,1]`. That is internally consistent - {@link NormalIntensity} decoded it
 * the same way - but it is not what anything outside this library reads. Under
 * the standard `2c - 1` decode it made every slope come back about 1.4x too
 * steep, and past 60 degrees it decoded to a *negative* z: a tangent-space
 * normal pointing into the surface, which is not a normal at all. At the
 * default intensity that threshold is an adjacent-pixel brightness difference
 * of about 3.5, so it was the common case in any textured photograph rather
 * than a corner of the range.
 *
 * Worth separating from the axis conventions {@link NormalFlip} exists to
 * absorb: those are sign differences on x and y, and every renderer picks one.
 * Nothing varies the z encoding, and no flip can reach a scale error anyway.
 */
export class NormalGenerator extends Filter {
	static override shader = /* glsl */ `
uniform float u_intensity;

vec3 normalise(vec3 v){
	return v / sqrt(abs(dot(v, v)));
}

/** The interior calculation: four cross products, averaged and normalised. */
vec3 normalAt(ivec2 p){
	float here  = u_intensity * luma(srcTexel(p));
	float left  = u_intensity * luma(srcTexel(p + ivec2(-1, 0)));
	float right = u_intensity * luma(srcTexel(p + ivec2( 1, 0)));
	float up    = u_intensity * luma(srcTexel(p + ivec2(0, -1)));
	float down  = u_intensity * luma(srcTexel(p + ivec2(0,  1)));

	vec3 c = vec3(float(p.x), float(p.y), here);
	vec3 l = vec3(float(p.x) - 1.0, float(p.y), left);
	vec3 r = vec3(float(p.x) + 1.0, float(p.y), right);
	vec3 u = vec3(float(p.x), float(p.y) - 1.0, up);
	vec3 d = vec3(float(p.x), float(p.y) + 1.0, down);

	vec3 sum = normalise(cross(c - u, c - l));
	sum += normalise(cross(c - l, c - d));
	sum += normalise(cross(c - d, c - r));
	sum += normalise(cross(c - r, c - u));

	return normalise(sum);
}

void main(){
	ivec2 size = ivec2(uSize);
	ivec2 p = outPixel();
	ivec2 q = p;

	//The CPU fixes its borders in two passes afterwards - columns first, then
	//rows, with the top row reading diagonally from (1, x+1). Resolving each
	//border pixel to the interior pixel it ends up copying reproduces that
	//without needing the passes.
	if(q.y == 0){
		q = ivec2(p.x + 1, 1);
	}
	else if(q.y == size.y - 1){
		q = ivec2(p.x, size.y - 2);
	}
	if(q.x < 1)             q.x = 1;
	if(q.x > size.x - 2)    q.x = size.x - 2;
	q = clamp(q, ivec2(1), size - 2);

	vec3 n = normalAt(q);
	writeRGB(vec3(
		(1.0 - (n.x / 2.0 + 0.5)) * 255.0,
		(n.y / 2.0 + 0.5) * 255.0,
		(1.0 - (n.z / 2.0 + 0.5)) * 255.0
	));
}
`;

	static override schema: FilterSchema = {
		intensity: { type: 'float', label: 'Intensity', min: 0, max: 3, step: 0.1, default: 0.5, description: 'How much the height differences tilt the normal.' }
	};

	override properties: {
		intensity: number;
	};

	constructor(options: NormalGeneratorOptions = {}) {
		super(options);
		this.properties = {
			intensity: options.intensity || 0.5
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let y = 1; y < frame.height-1; y++){
			for(let x = 1; x < frame.width-1; x++){
				let i = (y*frame.width + x)*4;
				let up    = ((y-1)*frame.width + x)*4;
				let down  = ((y+1)*frame.width + x)*4;
				let left  = (y*frame.width + (x-1))*4;
				let right = (y*frame.width + (x+1))*4;

				let veci =     {x:x, y:y,   z: this.properties.intensity*this.getColourValue(frame, i, 'grey')};
				let vecleft =  {x:x-1, y:y, z: this.properties.intensity*this.getColourValue(frame, left, 'grey')};
				let vecright = {x:x+1, y:y, z: this.properties.intensity*this.getColourValue(frame, right, 'grey')};
				let vecup =    {x:x, y:y-1, z: this.properties.intensity*this.getColourValue(frame, up, 'grey')};
				let vecdown =  {x:x, y:y+1, z: this.properties.intensity*this.getColourValue(frame, down, 'grey')};

				let res = this.generateNormal(veci, vecleft, vecright, vecup, vecdown)

				output.data[i] =   (1-(res.x/2+0.5))*255;
				output.data[i+1] = (res.y/2+0.5)*255;
				output.data[i+2] = (1-(res.z/2+0.5))*255;

				output.data[i+3] = 255;
			}
		}

		//correcting horizontal edges
		for(let y = 0; y < frame.height; y++){
			let x = 0;
			let i = (y*frame.width + x)*4;
			let j = (y*frame.width + x+1)*4;

			output.data[i  ] = output.data[j  ];
			output.data[i+1] = output.data[j+1];
			output.data[i+2] = output.data[j+2];
			output.data[i+3] = 255;

			x = frame.width-1;
			i = (y*frame.width + x)*4;
			j = (y*frame.width + x-1)*4;

			output.data[i  ] = output.data[j  ];
			output.data[i+1] = output.data[j+1];
			output.data[i+2] = output.data[j+2];
			output.data[i+3] = 255;
		}

		//correcting vertical edges
		for(let x = 0; x < frame.width; x++){
			let y = 0;
			let i = (y*frame.width + x)*4;
			let j = ((y+1)*frame.width + x+1)*4;

			output.data[i  ] = output.data[j  ];
			output.data[i+1] = output.data[j+1];
			output.data[i+2] = output.data[j+2];
			output.data[i+3] = 255;

			y = frame.height-1;
			i = (y*frame.width + x)*4;
			j = ((y-1)*frame.width + x)*4;

			output.data[i  ] = output.data[j  ];
			output.data[i+1] = output.data[j+1];
			output.data[i+2] = output.data[j+2];
			output.data[i+3] = 255;
		}

		return output;
	}


	generateNormal(centreIn: any, leftIn: any, rightIn: any, upIn: any, downIn: any) {
		let vecs = [];
		if(leftIn && upIn){
			vecs.push(this.calcNormal(centreIn, upIn, leftIn));
		}
		if(leftIn && downIn){
			vecs.push(this.calcNormal(centreIn, leftIn,  downIn));
		}
		if(rightIn && downIn){
			vecs.push(this.calcNormal(centreIn, downIn,  rightIn));
		}
		if(rightIn && upIn){
			vecs.push(this.calcNormal(centreIn, rightIn, upIn));
		}

		    let avg = this.average(vecs);

		    return avg;
	}

	calcNormal(vcentre: any, v1: any, v2: any) {
		let res1 = this.vectorSub(vcentre, v1);
		let res2 = this.vectorSub(vcentre, v2);
		    let cross = this.crossProduct(res1, res2);
		    cross = this.normalise(cross);
		    return cross
	}

	vectorSub(v1: any, v2: any) {
		return {
			x: v1.x-v2.x, 
			y: v1.y-v2.y, 
			z: v1.z-v2.z
		};
	}

	vectorAdd(v1: any, v2: any) {
		return {
			x: v1.x+v2.x, 
			y: v1.y+v2.y, 
			z: v1.z+v2.z
		};
	}

	crossProduct(v1: any, v2: any) {
		return {
			x:   v1.y*v2.z - v1.z*v2.y,
			y: -(v1.x*v2.z - v1.z*v2.x),
			z:   v1.x*v2.y - v1.y*v2.x
		}
	}

	normalise(v: any) {
		let mag = Math.sqrt(Math.abs(v.x*v.x + v.y*v.y + v.z*v.z));
		return{
			x: v.x/mag,
			y: v.y/mag,
			z: v.z/mag
		}
	}

	average(ins: any) {
		let res = ins[0];
		for(let i = 1; i < ins.length; i++){
			res = this.vectorAdd(res, ins[i]);
		}

		res = this.normalise(res);
		return {
			x: res.x,
			y: res.y,
			z: res.z
		}
	}
}
