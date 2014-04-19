//Filter parent
CLARITY.Filter = function(options){
	var options = options || {};
	this.channel = options.channel || "grey";
};

CLARITY.Filter.prototype = {
	ctx: document.createElement('canvas').getContext('2d'),

	process: function(frame){
		return frame;
	},

	//gets the pixel value depending on which colour as a parameter
	getColourValue: function(data, pos, channel){
		var channel = this.channel || channel || "grey";

		switch(channel){
			case 'grey':
				return data.data[pos+0]*0.2989+data.data[pos+1]*0.5870+data.data[pos+2]*0.1140;
			case 'red':
				return data.data[pos+0];
			case 'green':
				return data.data[pos+1];
			case 'blue':
				return data.data[pos+2];
			default:
				// console.log('Unrecognised channel.');
				return data.data[pos+2];
		}
	}
}
