
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
		for(var y = 0; y < this.height/this.properties.verticalSegs; y++){
			for(var x = 0; x < this.width/this.properties.horizontalSegs; x++){
				var pos1 = ((this.selected[1]*(this.height/this.properties.verticalSegs)+y)*this.width + (this.selected[0]*(this.width/this.properties.horizontalSegs)+x))*4;
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
	var x = Math.floor(pos[0]/(this.width/this.properties.horizontalSegs));
	var y = Math.floor(pos[1]/(this.height/this.properties.verticalSegs));

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
	while(num > this.properties.horizontalSegs-1){
		num -= this.properties.horizontalSegs;
		x++;
	}
	y = num;
	return [x,y];
}
