
//Pixelate object
CLARITY.Pixelate = function(options){
	var options = options || {}
	this.properties = {
		size: options.size || 64
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Pixelate.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Pixelate.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	var size = this.properties.size;
	//makes sure the tile size is a multiple of the width/height
	while(frame.height%size != 0){
		size --;
	}
	var size2 = Math.round(size/2);
	for(var y = 0; y < frame.height; y += size){
		for(var x = 0; x < frame.width; x += size){

			var pos = ((y+size2)*frame.width + (x+size2))*4;
			for(var ypos = 0; ypos < size; ypos++){
				for(var xpos = 0; xpos < size; xpos++){
					var i = ((ypos+y)*frame.width + xpos+x)*4;
					output.data[i  ] = frame.data[pos  ];
					output.data[i+1] = frame.data[pos+1];
					output.data[i+2] = frame.data[pos+2];
					output.data[i+3] = 255;
				}
			}
		}
	}

	return output;
};

CLARITY.Pixelate.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 256, 1, 'size', this.properties.size);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('size', e.srcElement.value);
	});

	return controls;
}
