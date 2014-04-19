//function with various image/pixel operations
CLARITY.Operations = {

	RGBtoHSV: function(input){
		var r, g, b;
		var h, s, v;
		var min, max, delta;

		for(var i = 0; i < input.data.length; i+=4){
			r = input.data[i];
			g = input.data[i+1];
			b = input.data[i+2];
			min = minimum([r, g, b]);
			max = maximum([r, g, b]);

			// console.log("min: " + min + "   max: " + max);

			v = max;
			delta = max - min;

			if(max != 0){
				s = delta / max;
			}
			else{
				s = 0;
				h = -1;
				return;
			}

			if(r == max)
				h = (g - b) / delta;		// between yellow & magenta
			else if(g == max)
				h = 2 + (b - r) / delta;	// between cyan & yellow
			else
				h = 4 + (r - g) / delta;	// between magenta & cyan
			
			h *= 60;						// degrees
			if(h < 0)
				h += 360;

			input.data[i]   = h; 
			input.data[i+1] = s;
			input.data[i+2] = v;
		}
	},

	HSVtoRGB: function(input){
		var i;
		var r, g, b;
		var h, s, v;
		var f, p, q, t;

		for(var j = 0; j < input.data.length; j+=4){
			h = input.data[j];
			s = input.data[j+1];
			v = input.data[j+2];

			if(s == 0){
				// achromatic (grey)
				r = g = b = v;
				continue;
			}
			h /= 60;			// sector 0 to 5
			i = Math.floor(h);
			f = h - i;			// factorial part of h
			p = v * (1 - s);
			q = v * (1 - s * f);
			t = v * (1 - s * (1 - f));
			switch(i){
				case 0:
					r = v;
					g = t;
					b = p;
					break;
				case 1:
					r = q;
					g = v;
					b = p;
					break;
				case 2:
					r = p;
					g = v;
					b = t;
					break;
				case 3:
					r = p;
					g = q;
					b = v;
					break;
				case 4:
					r = t;
					g = p;
					b = v;
					break;
				default:
					r = v;
					g = p;
					b = q;
					break;
			}
			input.data[j]   = r; 
			input.data[j+1] = g;
			input.data[j+2] = b;
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
	}

};

