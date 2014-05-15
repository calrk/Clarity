//Creates the user interation elements
CLARITY.Interface = {

	createControlGroup: function(){
		var controls = document.createElement('div');
		controls.setAttribute('class', 'clarity-controlGroup');
		return controls;
	},

	createSlider: function(min, max, step, labelSet){
		var div = document.createElement('div');
		div.setAttribute('class', 'clarity-control');

		var slider = document.createElement('input');
		slider.setAttribute('class', 'clarity-slider');
		slider.setAttribute('type', 'range');
		slider.setAttribute('min', min || 0);
		slider.setAttribute('max', max || 1);
		slider.setAttribute('step', step || 1);

		if(labelSet){
			var label = document.createElement('label');
			label.setAttribute('class', 'clarity-label');
			label.innerHTML = labelSet;
			div.appendChild(label);
		}

		div.appendChild(slider);
		return div;
	},

	createBreak: function(){
		var br = document.createElement('br');
		return br;
	}
};

