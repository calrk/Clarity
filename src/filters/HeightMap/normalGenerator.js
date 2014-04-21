
//NormalGenerator object
//Contains a bit of vector maths, which may be pulled out in future if other filters require it
CLARITY.NormalGenerator = function(options){
	var options = options || {}
	this.heightMod = options.heightMod || 0.15;

	CLARITY.Filter.call( this, options );
};

CLARITY.NormalGenerator.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.NormalGenerator.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 1; y < frame.height-1; y++){
		for(var x = 1; x < frame.width-1; x++){
			var i = (y*frame.width + x)*4;
			var up    = ((y-1)*frame.width + x)*4;
			var down  = ((y+1)*frame.width + x)*4;
			var left  = (y*frame.width + (x-1))*4;
			var right = (y*frame.width + (x+1))*4;

			var veci =     {x:x, y:y,   z: this.heightMod*frame.data[i]};
			var vecup =    {x:x, y:y-1, z: this.heightMod*frame.data[up]};
			var vecdown =  {x:x, y:y+1, z: this.heightMod*frame.data[down]};
			var vecleft =  {x:x-1, y:y, z: this.heightMod*frame.data[left]};
			var vecright = {x:x+1, y:y, z: this.heightMod*frame.data[right]};

			var res = this.generateNormal(veci, vecleft, vecright, vecup, vecdown)

			outPut.data[i] =   255-(res.x/2+128);
			outPut.data[i+1] = 255-(res.y/2+128);
			outPut.data[i+2] = -res.z;

			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};

CLARITY.NormalGenerator.prototype.generateNormal = function(centreIn, leftIn, rightIn, upIn, downIn){
	var left  = this.calcNormal(centreIn, upIn,    leftIn);
    var right = this.calcNormal(centreIn, leftIn,  downIn);
    var up    = this.calcNormal(centreIn, downIn,  rightIn);
    var down  = this.calcNormal(centreIn, rightIn, upIn);

    var avg = this.average(left, right, up, down);

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

CLARITY.NormalGenerator.prototype.average = function(v1, v2, v3, v4){
	var res = this.vectorAdd(v1, v2);
	res = this.vectorAdd(res, v3);
	res = this.vectorAdd(res, v4);

	res = this.normalise(res);
	return {
		x: res.x*255,
		y: res.y*255,
		z: res.z*255
	}
}