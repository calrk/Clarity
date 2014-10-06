
//NormalGenerator object
//Contains a bit of vector maths, which may be pulled out in future if other filters require it
CLARITY.NormalGenerator = function(options){
	var options = options || {}
	this.properties = {
		intensity: options.intensity || 0.5
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.NormalGenerator.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.NormalGenerator.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 1; y < frame.height-1; y++){
		for(var x = 1; x < frame.width-1; x++){
			var i = (y*frame.width + x)*4;
			var up    = ((y-1)*frame.width + x)*4;
			var down  = ((y+1)*frame.width + x)*4;
			var left  = (y*frame.width + (x-1))*4;
			var right = (y*frame.width + (x+1))*4;

			var veci =     {x:x, y:y,   z: this.properties.intensity*this.getColourValue(frame, i, 'grey')};
			var vecleft =  {x:x-1, y:y, z: this.properties.intensity*this.getColourValue(frame, left, 'grey')};
			var vecright = {x:x+1, y:y, z: this.properties.intensity*this.getColourValue(frame, right, 'grey')};
			var vecup =    {x:x, y:y-1, z: this.properties.intensity*this.getColourValue(frame, up, 'grey')};
			var vecdown =  {x:x, y:y+1, z: this.properties.intensity*this.getColourValue(frame, down, 'grey')};

			var res = this.generateNormal(veci, vecleft, vecright, vecup, vecdown)

			output.data[i] =   (1-(res.x/2+0.5))*255;
			output.data[i+1] = (res.y/2+0.5)*255;
			output.data[i+2] = -res.z*255;

			output.data[i+3] = 255;
		}
	}

	//correcting horizontal edges
	for(var y = 0; y < frame.height; y++){
		var x = 0;
		var i = (y*frame.width + x)*4;
		var j = (y*frame.width + x+1)*4;

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
	for(var x = 0; x < frame.width; x++){
		var y = 0;
		var i = (y*frame.width + x)*4;
		var j = ((y+1)*frame.width + x+1)*4;

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
};

CLARITY.NormalGenerator.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 3, 0.1, 'intensity', this.properties.intensity);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('intensity', e.srcElement.value);
	});

	return controls;
}


CLARITY.NormalGenerator.prototype.generateNormal = function(centreIn, leftIn, rightIn, upIn, downIn){
	var vecs = [];
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

    var avg = this.average(vecs);

    return avg;
}

CLARITY.NormalGenerator.prototype.calcNormal = function(vcentre, v1, v2){
	var res1 = this.vectorSub(vcentre, v1);
	var res2 = this.vectorSub(vcentre, v2);
    var cross = this.crossProduct(res1, res2);
    cross = this.normalise(cross);
    return cross
}

CLARITY.NormalGenerator.prototype.vectorSub = function(v1, v2){
	return {
		x: v1.x-v2.x, 
		y: v1.y-v2.y, 
		z: v1.z-v2.z
	};
}

CLARITY.NormalGenerator.prototype.vectorAdd = function(v1, v2){
	return {
		x: v1.x+v2.x, 
		y: v1.y+v2.y, 
		z: v1.z+v2.z
	};
}

CLARITY.NormalGenerator.prototype.crossProduct = function(v1, v2){
	return {
		x:   v1.y*v2.z - v1.z*v2.y,
		y: -(v1.x*v2.z - v1.z*v2.x),
		z:   v1.x*v2.y - v1.y*v2.x
	}
}

CLARITY.NormalGenerator.prototype.normalise = function(v){
	var mag = Math.sqrt(Math.abs(v.x*v.x + v.y*v.y + v.z*v.z));
	return{
		x: v.x/mag,
		y: v.y/mag,
		z: v.z/mag
	}
}

CLARITY.NormalGenerator.prototype.average = function(ins){
	var res = ins[0];
	for(var i = 1; i < ins.length; i++){
		res = this.vectorAdd(res, ins[i]);
	}

	res = this.normalise(res);
	return {
		x: res.x,
		y: res.y,
		z: res.z
	}
}