
//NormalEditor object
CLARITY.NormalEditor = function(options){
	var options = options || {}
	this.intensity = options.intensity || 0.5;

	CLARITY.Filter.call( this, options );
};

CLARITY.NormalEditor.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.NormalEditor.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 1; y < frame.height-1; y++){
		for(var x = 1; x < frame.width-1; x++){
			var i = (y*frame.width + x)*4;
			
			var vector = {  x: (frame.data[i  ]-128)/128,
							y: (frame.data[i+1]-128)/128,
							z:  frame.data[i+2]/255
						 };

			vector = this.normalise(vector);
			vector.x *= this.intensity;
			vector.y *= this.intensity;
			vector = this.normalise(vector);

			outPut.data[i] =   (vector.x+1)*128;
			outPut.data[i+1] = (vector.y+1)*128;
			outPut.data[i+2] = vector.z*255;

			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};

CLARITY.NormalEditor.prototype.normalise = function(v){
	var mag = Math.sqrt(Math.abs(v.x*v.x + v.y*v.y + v.z*v.z));
	return{
		x: v.x/mag,
		y: v.y/mag,
		z: v.z/mag
	}
}