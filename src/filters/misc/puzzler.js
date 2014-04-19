
//Scrambles the canvas scene
CLARITY.Puzzler = function(options){
	var options = options || {};
	this.width = options.width || 640;
	this.height = options.height || 480;

	this.selected = null;

	this.splits = options.splits || 8;
	this.swaps = [];
	var count = 0;
	for(var i = 0; i < this.splits; i++){
		this.swaps[i] = [];
		for(var j = 0; j < this.splits; j++){
			this.swaps[i][j] = count++;
		}
	}

	for(var i = 0; i < 10*this.splits; i++){
		var a = Math.floor(Math.random()*this.splits);
		var b = Math.floor(Math.random()*this.splits);
		var c = Math.floor(Math.random()*this.splits);
		var d = Math.floor(Math.random()*this.splits);
		var temp = this.swaps[a][b];
		this.swaps[a][b] = this.swaps[c][d];
		this.swaps[c][d] = temp;
	}

	CLARITY.Filter.call( this, options );
};

CLARITY.Puzzler.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Puzzler.prototype.process = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	var minHeight = this.height/this.splits;
	var minWidth = this.width/this.splits;

	for(var y = 0; y < this.splits; y++){
		for(var x = 0; x < this.splits; x++){
			var pos = this.numToPos(this.swaps[x][y]);
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
		for(var y = 0; y < this.height/this.splits; y++){
			for(var x = 0; x < this.width/this.splits; x++){
				var pos1 = ((this.selected[1]*(this.height/this.splits)+y)*this.width + (this.selected[0]*(this.width/this.splits)+x))*4;
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
	var x = Math.floor(pos[0]/(this.width/this.splits));
	var y = Math.floor(pos[1]/(this.height/this.splits));

	if(this.selected){
		var temp = this.swaps[this.selected[0]][this.selected[1]];
		this.swaps[this.selected[0]][this.selected[1]] = this.swaps[x][y];
		this.swaps[x][y] = temp;

		this.selected = undefined;
	}
	else{
		this.selected = [x,y];
	}
}

CLARITY.Puzzler.prototype.numToPos = function(num){
	var x = 0;
	var y = 0;
	while(num > this.splits-1){
		num -= this.splits;
		x++;
	}
	y = num;
	return [x,y];
}
