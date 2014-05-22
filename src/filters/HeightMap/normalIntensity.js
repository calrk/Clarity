
//NormalIntensity object
CLARITY.NormalIntensity = function(options){
	var options = options || {}
	this.properties = {
		intensity: options.intensity || 0.5
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.NormalIntensity.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.NormalIntensity.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 1; y < frame.height-1; y++){
		for(var x = 1; x < frame.width-1; x++){
			var i = (y*frame.width + x)*4;
			
			var vector = {  x: (frame.data[i  ]-128)/128,
							y: (frame.data[i+1]-128)/128,
							z:  frame.data[i+2]/255
						 };

			vector = this.normalise(vector);
			vector.x *= this.properties.intensity;
			vector.y *= this.properties.intensity;
			vector = this.normalise(vector);

			outPut.data[i] =   (vector.x+1)*128;
			outPut.data[i+1] = (vector.y+1)*128;
			outPut.data[i+2] = vector.z*255;

			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};

CLARITY.NormalIntensity.prototype.normalise = function(v){
	var mag = Math.sqrt(Math.abs(v.x*v.x + v.y*v.y + v.z*v.z));
	return{
		x: v.x/mag,
		y: v.y/mag,
		z: v.z/mag
	}
}

CLARITY.NormalIntensity.prototype.createControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createControlGroup(titleSet);
	
	var slider = CLARITY.Interface.createSlider(0, 20, 0.1, 'intensity');
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('intensity', e.srcElement.value);
	});

	return controls;
}
