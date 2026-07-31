
//Scrambles the canvas scene
CLARITY.Puzzler = function(options){
	var options = options || {};

	this.selected = null;

	this.properties = {
		horizontalSegs: options.horizontalSegs || 4,
		verticalSegs: options.verticalSegs || 4
	};

	this.swaps = [];
	var count = 0;
	for(var i = 0; i < this.properties.verticalSegs; i++){
		this.swaps[i] = [];
		for(var j = 0; j < this.properties.horizontalSegs; j++){
			this.swaps[i][j] = count++;
		}
	}

	for(var i = 0; i < 10*(this.properties.verticalSegs+this.properties.horizontalSegs)/2; i++){
		var a = Math.floor(Math.random()*this.properties.verticalSegs);
		var b = Math.floor(Math.random()*this.properties.horizontalSegs);
		var c = Math.floor(Math.random()*this.properties.verticalSegs);
		var d = Math.floor(Math.random()*this.properties.horizontalSegs);
		var temp = this.swaps[a][b];
		this.swaps[a][b] = this.swaps[c][d];
		this.swaps[c][d] = temp;
	}

	CLARITY.Filter.call( this, options );
};

CLARITY.Puzzler.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Puzzler.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	//setClick and the highlight below both need the frame size, and nothing else
	//ever set them - they were plain undefined, so every click resolved to NaN
	this.width = frame.width;
	this.height = frame.height;

	var minHeight = Math.round(frame.height/this.properties.verticalSegs);
	var minWidth = Math.round(frame.width/this.properties.horizontalSegs);

	for(var y = 0; y < this.properties.verticalSegs; y++){
		for(var x = 0; x < this.properties.horizontalSegs; x++){
			var pos = this.numToPos(this.swaps[y][x]);
			for(var newy = 0; newy < minHeight; newy++){
				for(var newx = 0; newx < minWidth; newx++){
					var pos1 = ((y*minHeight+newy)*frame.width + (x*minWidth+newx))*4;
					var pos2 = ((pos[1]*minHeight+newy)*frame.width + (pos[0]*minWidth+newx))*4;
					var pix2 = this.getPixel(frame.data, pos2);

					output.data[pos1]   = pix2[0];
					output.data[pos1+1] = pix2[1];
					output.data[pos1+2] = pix2[2];
					output.data[pos1+3] = 255;
				}
			}
		}
	}

	if(this.selected != undefined){
		for(var y = 0; y < minHeight; y++){
			for(var x = 0; x < minWidth; x++){
				var pos1 = ((this.selected[1]*minHeight+y)*frame.width + (this.selected[0]*minWidth+x))*4;
				output.data[pos1+2] += 80;
			}
		}
	}

	return output;
}

CLARITY.Puzzler.prototype.getPixel = function(picture, pos){
	return [picture[pos], picture[pos+1], picture[pos+2]];
};

CLARITY.Puzzler.prototype.setPixel = function(picture, xPos, yPos, newCol){
	var pos = (yPos*this.width + xPos)*4;

	picture.data[pos] = newCol[0];
	picture.data[pos+1] = newCol[1];
	picture.data[pos+2] = newCol[2];
}

CLARITY.Puzzler.prototype.setClick = function(pos){
	if(!this.width || !this.height){
		return;	//nothing has been processed yet, so the tile size isn't known
	}

	var x = Math.floor(pos[0]/(this.width/this.properties.horizontalSegs));
	var y = Math.floor(pos[1]/(this.height/this.properties.verticalSegs));

	if(this.selected){
		//swaps is indexed [row][column], and selected/x/y are [column, row] -
		//these were indexed the wrong way round
		var temp = this.swaps[this.selected[1]][this.selected[0]];
		this.swaps[this.selected[1]][this.selected[0]] = this.swaps[y][x];
		this.swaps[y][x] = temp;

		this.selected = undefined;
	}
	else{
		this.selected = [x,y];
	}
}

//swaps[row][column] holds row*horizontalSegs + column, so this returns
//[column, row] to match how doProcess indexes the result. It used to return
//them the other way round, which only looked right on a square frame with an
//equal number of segments on both axes.
CLARITY.Puzzler.prototype.numToPos = function(num){
	return [num % this.properties.horizontalSegs, Math.floor(num / this.properties.horizontalSegs)];
}
