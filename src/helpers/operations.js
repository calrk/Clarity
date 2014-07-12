//function with various image/pixel operations
CLARITY.Operations = {

	RGBtoHSV: function(input){
		var r, g, b;
		var h, s, v;

		r = input[0]/255;
		g = input[1]/255;
		b = input[2]/255;

		var minRGB = this.minimum([r, g, b]);
		var maxRGB = this.maximum([r, g, b]);

		if(minRGB == maxRGB) {
			computedV = minRGB;
			return [0,0,computedV];
		}

		// Colors other than black-gray-white:
		var d = (r == minRGB) ? g-b : ((b == minRGB) ? r-g : b-r);
		var h = (r == minRGB) ? 3 : ((b == minRGB) ? 1 : 5);
		computedH = 60*(h - d/(maxRGB - minRGB));
		computedS = (maxRGB - minRGB)/maxRGB;
		computedV = maxRGB;

		return [computedH, computedS, computedV];
	},

	HSVtoRGB: function(input){
		var i;
		var r, g, b;
		var h, s, v;
		var f, p, q, t;

		h = input[0];
		s = input[1];
		v = input[2];

		var i = h/60;

		var c = v * s;
		var x = c * (1- Math.abs(i%2 - 1))
		var m = v - c;

		i = Math.floor(i);

		switch(i){
			case 0:
			case 6:
				return [(c+m)*255, (x+m)*255, ( m )*255];
			case 1:
				return [(x+m)*255, (c+m)*255, ( m )*255];
			case 2:
				return [( m )*255, (c+m)*255, (x+m)*255];
			case 3:
				return [( m )*255, (x+m)*255, (c+m)*255];
			case 4:
				return [(x+m)*255, ( m )*255, (c+m)*255];
			default:
				return [(c+m)*255, ( m )*255, (x+m)*255];
		}
	},

	RGBtoYUV: function(rgb){
		return{
			y: 0.299*rgb.r + 0.587*rgb.g + 0.114*rgb.b,
			u: -0.14713*rgb.r - 0.28886*rgb.g + 0.436*rgb.b,
			v: 0.615*rgb.r - 0.51499*rgb.g - 0.10001*rgb.b
		}
	},

	YUVtoRGB: function(yuv){
		return{
			r: 1*yuv.y + 0*yuv.u + 1.13983*yuv.v,
			g: 1*yuv.y - -0.39465*yuv.u + -0.5806*yuv.v,
			b: 1*yuv.y + 2.03211*yuv.u - 0*yuv.v
		}
	},

	minimum: function(ins){
		var out = 10000000;
		for(var i = 0; i < ins.length; i++){
			if(ins[i] < out){
				out = ins[i];
			}
		}
		return out;
	},

	maximum: function(ins){
		var out = -1000000;
		for(var i = 0; i < ins.length; i++){
			if(ins[i] > out){
				out = ins[i];
			}
		}
		return out;
	},

	clamp: function(value, min, max){
		if(value < min){
			return min;
		}
		if(value > max){
			return max;
		}
		return value;
	},

	colorDistance: function(from, to){
		this.colourDistance(from, to);
	},
	colourDistance: function(from, to){
		return Math.pow(from[0]-to[0], 2) + Math.pow(from[1]-to[1], 2) + Math.pow(from[2]-to[2], 2);
	}

};

