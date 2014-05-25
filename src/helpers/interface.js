//Creates the user interation elements
CLARITY.Interface = {

	createControlGroup: function(titleSet, enabledFlag){
		var controls = document.createElement('div');
		controls.setAttribute('class', 'clarity-controlGroup');

		var title;;
		title = document.createElement('h3');
		title.setAttribute('class', 'clarity-title');
		title.innerHTML = titleSet || 'Clarity Filter';
		controls.appendChild(title);

		var toggle = document.createElement('input');
		toggle.setAttribute('class', 'clarity-checkbox');
		toggle.setAttribute('type', 'checkbox');
		if(enabledFlag){
			toggle.setAttribute('checked', enabledFlag || false);
		}
		title.appendChild(toggle);

		return controls;
	},

	createSlider: function(min, max, step, labelSet, valueSet){
		var div = document.createElement('div');
		div.setAttribute('class', 'clarity-control');

		var slider = document.createElement('input');
		slider.setAttribute('class', 'clarity-slider');
		slider.setAttribute('type', 'range');
		slider.setAttribute('min', min || 0);
		slider.setAttribute('max', max || 1);
		slider.setAttribute('step', step || 1);
		if(valueSet){
			slider.setAttribute('value', valueSet);
		}

		if(labelSet){
			var label = document.createElement('label');
			label.setAttribute('class', 'clarity-label');
			label.innerHTML = labelSet;
			div.appendChild(label);
		}

		div.appendChild(slider);
		return div;
	},

	createToggle: function(labelSet, checked){
		var div = document.createElement('div');
		div.setAttribute('class', 'clarity-control');

		var toggle = document.createElement('input');
		toggle.setAttribute('class', 'clarity-checkbox');
		toggle.setAttribute('type', 'checkbox');
		if(checked){
			toggle.setAttribute('checked', true);
		}
		
		if(labelSet){
			var label = document.createElement('label');
			label.setAttribute('class', 'clarity-label');
			label.innerHTML = labelSet;
			div.appendChild(label);
		}
		div.appendChild(toggle);
		return div;
	},

	createBreak: function(){
		var br = document.createElement('br');
		return br;
	},

	createDiv: function(){
		var div = document.createElement('div');
		return div;
	},

	createLabel: function(labelSet){
		var div = document.createElement('div');
		div.setAttribute('class', 'clarity-control');
		
		var label = document.createElement('label');
		label.setAttribute('class', 'clarity-label');
		label.innerHTML = labelSet;
		
		div.appendChild(label);
		return div;
	},
};

