
CLARITY.Ghoster = function(options){
	var options = options || {};

	this.properties = {
		length: options.length || 10
	};

	this.frames = new Array();

	CLARITY.Filter.call( this, options );
};

CLARITY.Ghoster.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Ghoster.prototype.doProcess = function(frame){
	//keeps its own copy so a later filter mutating the frame can't corrupt the trail
	var kept = CLARITY.ctx.createImageData(frame.width, frame.height);
	kept.data.set(frame.data);

	this.frames.unshift(kept);
	while(this.frames.length > this.properties.length){
		this.frames.pop();
	}

	var output = CLARITY.ctx.createImageData(frame.width, frame.height);
	var count = this.frames.length;

	for(var i = 0; i < frame.data.length; i+=4){
		var r = 0, g = 0, b = 0;
		for (var j = 0; j < count; j++) {
			//frames[0] is the newest, so it gets the heaviest weight.
			//weights sum to (count+1)/count, i.e. ~1.
			var weight = 2*(count-j)/(count*count);
			r += this.frames[j].data[i  ]*weight;
			g += this.frames[j].data[i+1]*weight;
			b += this.frames[j].data[i+2]*weight;
		};
		//accumulated in floats first - writing into the clamped array each
		//pass would round every partial sum
		output.data[i  ] = r;
		output.data[i+1] = g;
		output.data[i+2] = b;
		output.data[i+3] = 255;
	}

	return output;
};

CLARITY.Ghoster.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();

	var slider = CLARITY.Interface.createSlider(1, 30, 1, 'length', this.properties.length);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setInt('length', e.target.value);
	});

	return controls;
}