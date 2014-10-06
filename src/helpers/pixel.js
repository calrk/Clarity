//function with various image/pixel operations
CLARITY.Pixel = function(r, g, b){
	this.r = 0;
	this.g = 0;
	this.b = 0;

	this.h = 0;
	this.s = 0;
	this.v = 0;

	this.setFromRGB(r, g, b);
};

CLARITY.Pixel.prototype = {
	getColourValue: function(channel){
		var channel = this.channel || channel || "grey";

		switch(channel){
			case 'grey':
				return this.r*0.2989+this.g*0.5870+this.b*0.1140;
			case 'red':
			case 'r':
				return this.r;
			case 'green':
			case 'g':
				return this.g;
			case 'blue':
			case 'b':
				return this.b;

			case 'hue':
			case 'h':
				return this.h;
			case 'saturation':
			case 's':
				return this.s;
			case 'value':
			case 'v':
				return this.v;
			default:
				return this.r*0.2989+this.g*0.5870+this.b*0.1140;
		}
	},

	setFromRGB: function(r, g, b){
		var min, max, delta;
		this.r = r;
		this.g = g;
		this.b = b;

		min = CLARITY.Operations.minimum([this.r, this.g, this.b]);
		max = CLARITY.Operations.maximum([this.r, this.g, this.b]);

		this.v = max/256;
		delta = max - min;

		if(max != 0){
			this.s = delta / max;
		}
		else{
			this.s = 0;
			this.h = -1;
			return;
		}

		if(this.r == max)
			this.h = (this.g - this.b) / delta;		// between yellow & magenta
		else if(this.g == max)
			this.h = 2 + (this.b - this.r) / delta;	// between cyan & yellow
		else
			this.h = 4 + (this.r - this.g) / delta;	// between magenta & cyan
		
		this.h *= 60;						// degrees
		if(this.h < 0)
			this.h += 360;
	},

	setFromHSV: function(h, s, v){
		var i;
		var f, p, q, t;
		
		this.h = h;
		this.s = s;
		this.v = v;

		if(this.s == 0){//grey
			this.r = this.g = this.b = this.v;
			return;
		}

		i =  Math.floor(this.h/60);
		f = this.h - i;			// factorial part of h
		p = this.v * (1 - this.s);
		q = this.v * (1 - this.s * f);
		t = this.v * (1 - this.s * (1 - f));

		switch(i){
			case 0:
				this.r = v;
				this.g = t;
				this.b = p;
				break;
			case 1:
				this.r = q;
				this.g = v;
				this.b = p;
				break;
			case 2:
				this.r = p;
				this.g = v;
				this.b = t;
				break;
			case 3:
				this.r = p;
				this.g = q;
				this.b = v;
				break;
			case 4:
				this.r = t;
				this.g = p;
				this.b = v;
				break;
			default:
				this.r = v;
				this.g = p;
				this.b = q;
				break;
		}
	},

	toRGBArray: function(){
		return [this.r, this.g, this.b];
	}
}
