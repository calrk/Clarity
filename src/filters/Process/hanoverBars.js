//Hanover Bars object
CLARITY.HanoverBars = function(options){
	var options = options || {};

	this.properties = {
		// dynamic: options.dynamic || false,
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.HanoverBars.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.HanoverBars.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 0; y < frame.height; y++){
		var asd = y%4;
		for(var x = 0; x < frame.width; x++){
			var i = (y*frame.width + x)*4;
			
			if(asd == 0 || asd == 1){
				output.data[i  ] = frame.data[i];
				output.data[i+1] = frame.data[i+1];
				output.data[i+2] = frame.data[i+2];
				output.data[i+3] = 255;
			}
			else{
				var pix = {
					r: frame.data[i]/255,
					g: frame.data[i+1]/255,
					b: frame.data[i+2]/255
				};
				pix = RGBtoYUV(pix);
				pix = calcPair(pix);
				pix = YUVtoRGB(pix);
				output.data[i  ] = pix.r*255;
				output.data[i+1] = pix.g*255;
				output.data[i+2] = pix.b*255;
				output.data[i+3] = 255;
			}
		}
	}

	return output;
};

CLARITY.HanoverBars.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();

	var toggle = CLARITY.Interface.createToggle('dynamic', this.properties.dynamic);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('dynamic');
	});

	return controls;
}

function calcPair(A){
	var B = {u: A.v, v: -A.u};
	B = scale(normalise(B), 0.75 * mod(A));
	var C = add(A, B);

	var alpha = Math.atan(mod(A)/mod(B));

	var D = scale(normalise(C), mod(C) * Math.cos(alpha));
	var E = sub(C, D);
	var E2 = scale(E, 0.5);

	var F = sub(C, E2);

	// var N = normalise(F);
	// var N = scale(N, -1);

	// console.log(dot(N, F));

	// var G = sub(scale(N, (2*(dot(N, F)))), F);
	return {
		y: A.y,
		u: F.u,
		v: F.v
	};
}

function RGBtoYUV(rgb){
	return{
		y: 0.299*rgb.r + 0.587*rgb.g + 0.114*rgb.b,
		u: -0.14713*rgb.r - 0.28886*rgb.g + 0.436*rgb.b,
		v: 0.615*rgb.r - 0.51499*rgb.g - 0.10001*rgb.b
	}
}

function YUVtoRGB(yuv){
	return{
		r: 1*yuv.y + 0*yuv.u + 1.13983*yuv.v,
		g: 1*yuv.y - -0.39465*yuv.u + -0.5806*yuv.v,
		b: 1*yuv.y + 2.03211*yuv.u - 0*yuv.v
	}
}

function mod(a){
	return Math.sqrt(a.u*a.u+a.v*a.v);
}

function normalise(a){
	var len = mod(a);
	return {
		u: a.u/len,
		v: a.v/len
	}
}

function scale(a, len){
	return {
		u: a.u*len,
		v: a.v*len
	}
}

function add(a, b){
	return {
		u: a.u + b.u,
		v: a.v + b.v
	}
}

function sub(a, b){
	return {
		u: a.u - b.u,
		v: a.v - b.v
	}
}

function dot(a, b){
	return a.u * b.u + a.v * b.v;
}