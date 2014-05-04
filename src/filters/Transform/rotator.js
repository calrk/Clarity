//Rotator
//Rotates the image clockwise by the number of turns * 90 degrees
//If width/height are not the same, will crap the image to be square
CLARITY.Rotator = function(options){
	var options = options || {};
	this.turns = options.turns || 3;

	while(this.turns < 0){
		this.turns += 4;
	}
	while(this.turns >= 4){
		this.turns -= 4;
	}

	CLARITY.Filter.call( this, options );
};

CLARITY.Rotator.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Rotator.prototype.process = function(frame){
	if(this.turns == 0){
		return frame;
	}
	var width = frame.width;
	var height = frame.height;
	var offset = 0;

	if(this.turns == 1 || this.turns == 3 && frame.width != frame.height){
		var smallest = CLARITY.Operations.minimum([frame.width, frame.height]);
		if(smallest == frame.width){
			offset = Math.floor((frame.height-frame.width)/2);
			height = smallest;
		}
		else{
			offset = Math.floor((frame.width-frame.height)/2);
			width = smallest;
		}
	}

	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = offset; y < height+offset; y++){
		for(var x = 0; x < width; x++){
			var from = ((y-offset)*frame.width + (x+offset))*4;
			var toX;
			var toY;
			if(this.turns == 1){
				toX = -y;
				toY = x;
			}
			else if(this.turns == 2){
				toX = -x;
				toY = -y;
			}
			else if(this.turns == 3){
				toX = y;
				toY = -x;
			}
			if(toX > frame.width){
				toX -= frame.width;
			}
			else if(toX < 0){
				toX += frame.width;
			}
			if(toY > frame.height){
				toY -= frame.height;
			}
			else if(toY < 0){
				toY += frame.height;
			}
			var to = ((toY)*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from];
			outPut.data[to+1] = frame.data[from+1];
			outPut.data[to+2] = frame.data[from+2];

			outPut.data[to+3] = 255;
		}
	}

	return outPut;
};
