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
				return [(c+m)*255, (x+m)*255, (0+m)*255];
			case 1:
				return [(x+m)*255, (c+m)*255, (0+m)*255];
			case 2:
				return [(0+m)*255, (c+m)*255, (x+m)*255];
			case 3:
				return [(0+m)*255, (x+m)*255, (c+m)*255];
			case 4:
				return [(x+m)*255, (0+m)*255, (c+m)*255];
			default:
				return [(c+m)*255, (0+m)*255, (x+m)*255];
		}
	},

	minimum: function(ins){
		var out = 256;
		for(var i = 0; i < ins.length; i++){
			if(ins[i] < out){
				out = ins[i];
			}
		}
		return out;
	},

	maximum: function(ins){
		var out = 0;
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
	}

};

