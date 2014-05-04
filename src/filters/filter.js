//Filter parent
CLARITY.Filter = function(options){
	var options = options || {};
	this.channel = options.channel || "grey";
};

CLARITY.Filter.prototype = {
	process: function(frame){
		return frame;
	},

	//gets the pixel value depending on which colour as a parameter
	getColourValue: function(data, pos, channel){
		var channel = channel || this.channel || "grey";

		switch(channel){
			case 'grey':
				return data.data[pos+0]*0.2989+data.data[pos+1]*0.5870+data.data[pos+2]*0.1140;
			case 'red':
			case 'r':
				return data.data[pos+0];
			case 'green':
			case 'g':
				return data.data[pos+1];
			case 'blue':
			case 'b':
				return data.data[pos+2];
			default:
				return data.data[pos+0]*0.2989+data.data[pos+1]*0.5870+data.data[pos+2]*0.1140;
		}
	}
}
