
var CLARITY = {
	ctx: document.createElement('canvas').getContext('2d')
};
//Filter parent
CLARITY.Filter = function(options){
	var options = options || {};
	this.channel = options.channel || "grey";

	if(options.enabled === false){
		this.enabled = false;
	}
	else{
		this.enabled = true;
	}
};

CLARITY.Filter.prototype = {
	process: function(frame){
		if(!this.enabled){
			return frame;
		}
		if(frame.length){//if there are multiple frames in an array
			return this.doProcess(frame[0], frame[1]);
		}
		return this.doProcess(frame);
	},

	doProcess: function(frame){
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
	},

	setFloat: function(key, value){
		this.properties[key] = parseFloat(value);
	},

	setInt: function(key, value){
		this.properties[key] = parseInt(value);
	},

	toggleBool: function(key){
		this.properties[key] = !this.properties[key];
	},

	toggleEnabled: function(){
		this.enabled = !this.enabled;
	}
}

CLARITY.Filter.prototype.createControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createControlGroup(titleSet, this.enabled);
    controls.getElementsByTagName('input')[0].addEventListener('change', function(e){
        self.toggleEnabled();
    });

	
	var conts = this.doCreateControls();
	controls.appendChild(conts);

	return controls;
}

CLARITY.Filter.prototype.doCreateControls = function(titleSet){
	var self = this;
	
	label = CLARITY.Interface.createLabel('No options.');

	return label;
}

 /**************************************************************************
  * This file is part of median-cut.js                                     *
  *                                                                        *
  * median-cut.js is free software: you can redistribute it and/or modify  *
  * it under the terms of the GNU General Public License as published by   *
  * the Free Software Foundation, either version 3 of the License, or      *
  * (at your option) any later version.                                    *
  *                                                                        *
  * median-cut.js is distributed in the hope that it will be useful,       *
  * but WITHOUT ANY WARRANTY; without even the implied warranty of         *
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the          *
  * GNU General Public License for more details.                           *
  *                                                                        *
  * You should have received a copy of the GNU General Public License      *
  * along with median-cut.js.  If not, see <http://www.gnu.org/licenses/>. *
  **************************************************************************/

/* global define, module */
/* jshint browser: true */

//  This is the median-cut algorithm.
//
//  1. Find the smallest box which contains all the colors in the image.
//
//  2. Sort the enclosed colors along the longest axis of the box.
//
//  3. Split the box into 2 regions at median of the sorted list.
//
//  4. Repeat the above process until the original color space has been divided
//     into N regions where N is the number of colors you want.

// (function (undefined) {
CLARITY.MCut = function(){

    function Box() {

        // TODO: memoize all functions beginning with 'get_'.  Use for-in loop.
        // get_longest_axis gets called twice now, and others may also.

        var data; // it's all about the data
        var box;  // the bounding box of the data
        var dim;  // number of dimensions in the data

        function is_nan() {
            return isNaN(data[0]) || isNaN(data[1]) || isNaN(data[2]);
        }

        function calculate_bounding_box() {

            // keeps running tally of the min and max values on each dimension
            // initialize the min value to the highest number possible, and the
            // max value to the lowest number possible

            var i;
            var minmax = [ { min: Number.MAX_VALUE, max: Number.MIN_VALUE },
                           { min: Number.MAX_VALUE, max: Number.MIN_VALUE },
                           { min: Number.MAX_VALUE, max: Number.MIN_VALUE } ];

            for( i = data.length - 1; i >= 0; i -= 1 ) {

                minmax[0].min = ( data[i][0] < minmax[0].min ) ?
                                  data[i][0] : minmax[0].min; // r
                minmax[1].min = ( data[i][1] < minmax[1].min ) ?
                                  data[i][1] : minmax[1].min; // g
                minmax[2].min = ( data[i][2] < minmax[2].min ) ?
                                  data[i][2] : minmax[2].min; // b

                minmax[0].max = ( data[i][0] > minmax[0].max ) ?
                                  data[i][0] : minmax[0].max; // r
                minmax[1].max = ( data[i][1] > minmax[1].max ) ?
                                  data[i][1] : minmax[1].max; // g
                minmax[2].max = ( data[i][2] > minmax[2].max ) ?
                                  data[i][2] : minmax[2].max; // b
            }

            return minmax;

        }

        function init( _data ) {

            // Initializes the data values, number of dimensions in the data
            // (currently fixed to 3 to handle RGB, but may be genericized in
            // the future), and the bounding box of the data.

            data = _data;
            dim  = 3; // lock this to 3 (RGB pixels) for now.
            box  = calculate_bounding_box();

        }

        function get_data() {
            return data;
        }

        function get_longest_axis() {

            // Returns the longest (aka 'widest') axis of the data in this box.

            var longest_axis = 0;
            var longest_axis_size = 0;
            var i;
            var axis_size;

            for( i = dim - 1; i >= 0; i -= 1 ) {
                axis_size = box[i].max - box[i].min;
                if( axis_size > longest_axis_size ) {
                    longest_axis      = i;
                    longest_axis_size = axis_size;
                }
            }

            return { axis   : longest_axis,
                     length : longest_axis_size };
        }

        function get_comparison_func( _i ) {

            // Return a comparison function based on a given index (for median-cut,
            // sort on the longest axis) ie: sort ONLY on a single axis.
            // get_comparison_func( 1 ) would return a sorting function that sorts
            // the data according to each item's Green value.

            var sort_method = function ( a, b ) {
                return a[_i] - b[_i];
            };

            return sort_method;

        }

        function sort() {

            // Sorts all the elements in this box based on their values on the
            // longest axis.

            var a           = get_longest_axis().axis;
            var sort_method = get_comparison_func( a );

            Array.prototype.sort.call( data, sort_method );

            return data;

        }

        function mean_pos() {

            // Returns the position of the median value of the data in
            // this box.  The position number is rounded down, to deal
            // with cases when the data has an odd number of elements.

            var mean_i;
            var mean = 0;
            var smallest_diff = Number.MAX_VALUE;
            var axis = get_longest_axis().axis;
            var diff;
            var i;

            // sum all the data along the longest axis...
            for( i = data.length - 1; i >= 0; i -= 1 ) { mean += data[i][axis]; }
            mean /= data.length;

            // find the data point that is closest to the mean
            for( i = data.length - 1; i >= 0; i -= 1 ) {
                diff = Math.abs( data[i][axis] - mean );
                if( diff < smallest_diff ) {
                    smallest_diff = diff;
                    mean_i = i;
                }
            }

            // return the index of the data point closest to the mean

            return mean_i;

        }

        function split() {

            // Splits this box in two and returns two box objects. This function
            // represents steps 2 and 3 of the algorithm, as written at the top
            // of this file.

            sort();

            var med   = mean_pos();
            var data1 = Array.prototype.slice.call( data, 0, med ); // elements 0 through med
            var data2 = Array.prototype.slice.call( data, med );    // elements med through end
            var box1  = new Box();
            var box2  = new Box();

            box1.init( data1 );
            box2.init( data2 );

            return [ box1, box2 ];

        }

        function average() {

            // Returns the average value of the data in this box

            var avg_r = 0;
            var avg_g = 0;
            var avg_b = 0;
            var i;

            for( i = data.length - 1; i >= 0; i -= 1 ) {
                avg_r += data[i][0];
                avg_g += data[i][1];
                avg_b += data[i][2];
            }

            avg_r /= data.length;
            avg_g /= data.length;
            avg_b /= data.length;

            return [ parseInt( avg_r, 10 ),
                     parseInt( avg_g, 10 ),
                     parseInt( avg_b, 10 ) ];

        }

        function median_pos() {

            // Returns the position of the median value of the data in
            // this box.  The position number is rounded down, to deal
            // with cases when the data has an odd number of elements.

            return Math.floor( data.length / 2 );

        }

        function is_empty() {

            // Self-explanatory

            return data.length === 0;
        }

        function is_splittable() {

            // A box is considered splittable if it has two or more items.

            return data.length >= 2;
        }

        function get_bounding_box() {
            // Getter for the bounding box
            return box;
        }

        return {

            /**/ // these are private functions
            /**/
            get_data               : get_data,
            median_pos             : median_pos,
            get_bounding_box       : get_bounding_box,
            calculate_bounding_box : calculate_bounding_box,
            sort                   : sort,
            get_comparison_func    : get_comparison_func,

            // These are exposed (public) functions
            mean_pos         : mean_pos,
            split            : split,
            is_empty         : is_empty,
            is_splittable    : is_splittable,
            get_longest_axis : get_longest_axis,
            average          : average,
            init             : init
        };
    }

    function MCut() {

        'use strict';

        var boxes = [];
        var data  = [];

        function init_boxes( _data ) {

            var succeeded = false;

            if ( is_valid_data( _data ) ) {
                var box1 = new Box();
                box1.init( _data );
                boxes = [ box1 ];
                succeeded = true;
            }

            return succeeded;

        }

        function is_valid_data( _data ) {

            var has_length = _data.length > 0;

            return has_length;

        }

        function init( _data ) {

            var boxes_init_success = init_boxes( _data );

            if (boxes_init_success) {
                data = _data;
            }

        }

        function get_longest_box_index() {

            // find the box with the longest axis of them all...
            var longest_box_index = 0;
            var box_index;

            for( box_index = boxes.length - 1; box_index >= 0; box_index -= 1 ) {
                if( boxes[ box_index ] > longest_box_index ) {
                    longest_box_index = boxes[ box_index ];
                }
            }

            return longest_box_index;

        }

        function get_boxes() {
            return boxes;
        }

        function get_dynamic_size_palette( _threshold ) {

            // threshold is a value in (0,1] that influences how many colors
            // will be in the resulting palette.  lower values of threshold
            // will result in a smaller palette size.

            var value;
            var values;
            var i;
            var longest_box_index;
            var longest_axis;
            var min_box_length;
            var box_to_split;
            var split_boxes;
            var box1;
            var box2;

            init_boxes( data );

            // If there isn't any data, return early
            if (boxes.length === 0) {
                return [];
            }

            values            = [];
            longest_box_index = get_longest_box_index();
            longest_axis      = boxes[ longest_box_index ].get_longest_axis();

            // a rough calculation of how big the palette should be
            min_box_length    = longest_axis.length * ( 1 - _threshold );

            // but regardless of _threshold, the palette size should never
            // exceed number of input data points

            do {

                // remove the longest box and split it
                box_to_split = boxes.splice( longest_box_index, 1 )[0];
                split_boxes = box_to_split.split();

                box1 = split_boxes[0];
                box2 = split_boxes[1];

                // then push the resulting boxes into the boxes array
                boxes.push( box1 );
                boxes.push( box2 );

                longest_box_index = get_longest_box_index();
                longest_axis      = boxes[ longest_box_index ].get_longest_axis();

            }
            while( longest_axis.length > min_box_length );

            // palette is complete.  get the average colors from each box
            // and push them into the values array, then return.
            for( i = 0; i < boxes.length; i += 1 ) {
                // check for NaN values (the results of splitting where no
                // split should have been done)
                // TODO fix NaNs
                value = boxes[i].average();
                if (!isNaN(value[0]) || !isNaN(value[0]) || !isNaN(value[0])) {
                    values.push( boxes[i].average() );
                }
            }

            return values;

        }

        function get_fixed_size_palette( _number ) {

            var values = [];
            var i;
            var longest_box_index;
            var box_to_split;
            var split_boxes;

            init_boxes( data );

            // If there isn't any data, return early
            if (boxes.length === 0) {
                return [];
            }

            for( i = _number - 1; i >= 0; i -= 1 ) {

                longest_box_index = get_longest_box_index();

                // remove the longest box and split it
                box_to_split = boxes.splice( longest_box_index, 1 )[0];

                // TODO: If the box is large enough to be split, split it.
                // Otherwise, push the box itself onto the boxes stack.  This is
                // probably *non-desireable* behavior (i.e. it doesn't behave as
                // the median cut algorithm should), but it's a side effect of
                // requiring a fixed size palette.

                if( box_to_split.is_splittable() ) {

                    // split the box and push both new boxes
                    split_boxes = box_to_split.split();
                    boxes.push( split_boxes[0] );
                    boxes.push( split_boxes[1] );

                }
                else {
                    // else... the box is too small to be split.  Push it into the
                    // set of boxes twice in order to guarantee the fixed-size
                    // palette.
                    boxes.push( box_to_split );
                    boxes.push( box_to_split );
                }

            }

            // palette is complete.  get the average colors from each box
            // and push them into the values array, then return.
            for( i = _number - 1; i >= 0; i -= 1 ) {
                values.push( boxes[i].average() );
            }

            return values;

        }

        return {
            // This is a private function (listed here in case it needs to be made
            // public easily :)

            // These are exposed (public) functions
            get_boxes                : get_boxes,
            init                     : init,
            get_fixed_size_palette   : get_fixed_size_palette,
            get_dynamic_size_palette : get_dynamic_size_palette
        };
    }

    this.MCut = new MCut();

 /*   if ( typeof module !== 'undefined' ) {
        module.exports = MCut;
    } else if ( typeof define === 'function' && define.amd ) {
        define( MCut );
    } else {
        window.MCut = MCut;
    }
*/
// })();
}

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


//function with various image/pixel operations
CLARITY.Operations = {

	RGBtoHSV: function(input){
		var r, g, b;
		var h, s, v;

		r = input[0]/255;
		g = input[1]/255;
		b = input[2]/255;

		var minRGB = this.minimum([r, g, b]);
		var maxRGB = this.maximum([r, g, b]);

		if(minRGB == maxRGB) {
			computedV = minRGB;
			return [0,0,computedV];
		}

		// Colors other than black-gray-white:
		var d = (r == minRGB) ? g-b : ((b == minRGB) ? r-g : b-r);
		var h = (r == minRGB) ? 3 : ((b == minRGB) ? 1 : 5);
		computedH = 60*(h - d/(maxRGB - minRGB));
		computedS = (maxRGB - minRGB)/maxRGB;
		computedV = maxRGB;

		return [computedH, computedS, computedV];
	},

	HSVtoRGB: function(input){
		var i;
		var r, g, b;
		var h, s, v;
		var f, p, q, t;

		h = input[0];
		s = input[1];
		v = input[2];

		var i = h/60;

		var c = v * s;
		var x = c * (1- Math.abs(i%2 - 1))
		var m = v - c;

		i = Math.floor(i);

		switch(i){
			case 0:
			case 6:
				return [(c+m)*255, (x+m)*255, ( m )*255];
			case 1:
				return [(x+m)*255, (c+m)*255, ( m )*255];
			case 2:
				return [( m )*255, (c+m)*255, (x+m)*255];
			case 3:
				return [( m )*255, (x+m)*255, (c+m)*255];
			case 4:
				return [(x+m)*255, ( m )*255, (c+m)*255];
			default:
				return [(c+m)*255, ( m )*255, (x+m)*255];
		}
	},

	minimum: function(ins){
		var out = 10000000;
		for(var i = 0; i < ins.length; i++){
			if(ins[i] < out){
				out = ins[i];
			}
		}
		return out;
	},

	maximum: function(ins){
		var out = -1000000;
		for(var i = 0; i < ins.length; i++){
			if(ins[i] > out){
				out = ins[i];
			}
		}
		return out;
	},

	clamp: function(value, min, max){
		if(value < min){
			return min;
		}
		if(value > max){
			return max;
		}
		return value;
	},

	colorDistance: function(from, to){
		this.colourDistance(from, to);
	},
	colourDistance: function(from, to){
		return Math.pow(from[0]-to[0], 2) + Math.pow(from[1]-to[1], 2) + Math.pow(from[2]-to[2], 2);
	}

};


//function with various image/pixel operations
CLARITY.Pixel = function(r, g, b){
	this.r = 0;
	this.g = 0;
	this.b = 0;

	this.h = 0;
	this.s = 0;
	this.v = 0;

	this.setFromRGB(r, g, b);
};

CLARITY.Pixel.prototype = {
	getColourValue: function(channel){
		var channel = this.channel || channel || "grey";

		switch(channel){
			case 'grey':
				return this.r*0.2989+this.g*0.5870+this.b*0.1140;
			case 'red':
			case 'r':
				return this.r;
			case 'green':
			case 'g':
				return this.g;
			case 'blue':
			case 'b':
				return this.b;

			case 'hue':
			case 'h':
				return this.h;
			case 'saturation':
			case 's':
				return this.s;
			case 'value':
			case 'v':
				return this.v;
			default:
				return this.r*0.2989+this.g*0.5870+this.b*0.1140;
		}
	},

	setFromRGB: function(r, g, b){
		var min, max, delta;
		this.r = r;
		this.g = g;
		this.b = b;

		min = minimum([this.r, this.g, this.b]);
		max = maximum([this.r, this.g, this.b]);

		this.v = max;
		delta = max - min;

		if(max != 0){
			this.s = delta / max;
		}
		else{
			this.s = 0;
			this.h = -1;
			return;
		}

		if(this.r == max)
			this.h = (this.g - this.b) / delta;		// between yellow & magenta
		else if(this.g == max)
			this.h = 2 + (this.b - this.r) / delta;	// between cyan & yellow
		else
			this.h = 4 + (this.r - this.g) / delta;	// between magenta & cyan
		
		this.h *= 60;						// degrees
		if(this.h < 0)
			this.h += 360;
	},

	setFromHSV: function(h, s, v){
		var i;
		var f, p, q, t;
		
		this.h = h;
		this.s = s;
		this.v = v;

		if(this.s == 0){//grey
			this.r = this.g = this.b = this.v;
			return;
		}

		i =  Math.floor(this.h/60);
		f = this.h - i;			// factorial part of h
		p = this.v * (1 - this.s);
		q = this.v * (1 - this.s * f);
		t = this.v * (1 - this.s * (1 - f));

		switch(i){
			case 0:
				this.r = v;
				this.g = t;
				this.b = p;
				break;
			case 1:
				this.r = q;
				this.g = v;
				this.b = p;
				break;
			case 2:
				this.r = p;
				this.g = v;
				this.b = t;
				break;
			case 3:
				this.r = p;
				this.g = q;
				this.b = v;
				break;
			case 4:
				this.r = t;
				this.g = p;
				this.b = v;
				break;
			default:
				this.r = v;
				this.g = p;
				this.b = q;
				break;
		}
	}
}

//AddSub object
CLARITY.AddSub = function(options){
	var options = options || {};

	this.properties = {
		subtractive: options.subtractive || false
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.AddSub.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.AddSub.prototype.doProcess = function(frame1, frame2){
	var outPut = CLARITY.ctx.createImageData(frame1.width, frame1.height);

	for(var i = 0; i < frame1.width*frame1.height*4; i+=4){
		if(this.properties.subtractive){
			outPut.data[i  ] = frame1.data[i  ] - frame2.data[i  ];
			outPut.data[i+1] = frame1.data[i+1] - frame2.data[i+1];
			outPut.data[i+2] = frame1.data[i+2] - frame2.data[i+2];	
		}
		else{
			outPut.data[i  ] = frame1.data[i  ] + frame2.data[i  ];
			outPut.data[i+1] = frame1.data[i+1] + frame2.data[i+1];
			outPut.data[i+2] = frame1.data[i+2] + frame2.data[i+2];
		}
		outPut.data[i+3] = 255;
	}

	return outPut;
};


CLARITY.AddSub.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var toggle = CLARITY.Interface.createToggle('subtractive', this.properties.subtractive);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('subtractive');
	});

	return controls;
}

//Blend object
CLARITY.Blend = function(options){
	var options = options || {};

	this.properties = {
		ratio: CLARITY.Operations.clamp(options.ratio, 0, 1) || 0.5
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Blend.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Blend.prototype.doProcess = function(frame1, frame2){
	var outPut = CLARITY.ctx.createImageData(frame1.width, frame1.height);

	for(var i = 0; i < frame1.width*frame1.height*4; i+=4){
		outPut.data[i+0] = frame1.data[i  ]*this.properties.ratio + frame2.data[i  ]*(1-this.properties.ratio);
		outPut.data[i+1] = frame1.data[i+1]*this.properties.ratio + frame2.data[i+1]*(1-this.properties.ratio);
		outPut.data[i+2] = frame1.data[i+2]*this.properties.ratio + frame2.data[i+2]*(1-this.properties.ratio);
		outPut.data[i+3] = 255;
	}

	return outPut;
};


CLARITY.Blend.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 1, 0.01, 'ratio', this.properties.ratio);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('ratio', e.srcElement.value);
	});

	return controls;
}

//Mask object
CLARITY.Mask = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.Mask.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Mask.prototype.doProcess = function(frame1, frame2){
	var outPut = CLARITY.ctx.createImageData(frame1.width, frame1.height);

	for(var i = 0; i < frame1.width*frame1.height*4; i+=4){
		if(frame2[i].data < 128){
			outPut.data[i+0] = frame1.data[i  ];
			outPut.data[i+1] = frame1.data[i+1];
			outPut.data[i+2] = frame1.data[i+2];
		}
		else{
			outPut.data[i+0] = 0;
			outPut.data[i+1] = 0;
			outPut.data[i+2] = 0;
		}
		outPut.data[i+3] = 255;
	}

	return outPut;
};


/*CLARITY.Mask.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 1, 0.01, 'ratio', this.properties.ratio);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('ratio', e.srcElement.value);
	});

	return controls;
}
*/
//Multiply object
CLARITY.Multiply = function(options){
	var options = options || {};

	/*this.properties = {
		ratio: CLARITY.Operations.clamp(options.ratio, 0, 1) || 0.5
	};*/

	CLARITY.Filter.call( this, options );
};

CLARITY.Multiply.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Multiply.prototype.doProcess = function(frame1, frame2){
	var outPut = CLARITY.ctx.createImageData(frame1.width, frame2.height);

	for(var i = 0; i < frame1.width*frame1.height*4; i+=4){
		outPut.data[i+0] = ((frame1.data[i  ]/255) * (frame2.data[i  ])/255)*255;
		outPut.data[i+1] = ((frame1.data[i+1]/255) * (frame2.data[i+1])/255)*255;
		outPut.data[i+2] = ((frame1.data[i+2]/255) * (frame2.data[i+2])/255)*255;
		outPut.data[i+3] = 255;
	}

	return outPut;
};


/*CLARITY.Multiply.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 1, 0.01, 'ratio', this.properties.ratio);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('ratio', e.srcElement.value);
	});

	return controls;
}
*/

//Contourer object
CLARITY.Contourer = function(options){
	var options = options || {}
	this.properties = {
		contours: options.contours || 10
	}

	this.threshes = [128, 256];
	this.threshSets = [0, 256];
	this.difference = 128;
	this.maxValue = 0;
	this.minValue = 255;

	CLARITY.Filter.call( this, options );
};

CLARITY.Contourer.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Contourer.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.data.length; i+=4){
		if(frame.data[i] > this.maxValue){
			this.maxValue = frame.data[i];
		}
		else if(frame.data[i] < this.minValue){
			this.minValue = frame.data[i];
		}
	}
	this.setVar(this.properties.contours);

	for(var i = 0; i < frame.data.length; i++){
		if(!((i+1)%4 == 0)){
			for(var j = 0; j < this.threshes.length; j++){
				if(frame.data[i] < this.threshes[j]){
					outPut.data[i] = this.threshSets[j];
					break;
				}
			}
		}
		else{
			outPut.data[i] = 255;
		}
	}

	return outPut;
};

CLARITY.Contourer.prototype.setVar = function(newNo){
	this.threshes = [];
	this.difference = (this.maxValue-this.minValue)/newNo;

	var index = 0;
	for(var i = this.difference+this.minValue; i <= 256; i+= this.difference){
		this.threshes[index] = i;
		this.threshSets[index] = (i-this.difference-this.minValue)/(this.maxValue-this.minValue)*255;
		index ++;
	}
	this.threshes[index] = i;
	this.threshSets[index] = 255;
};

CLARITY.Contourer.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(1, 20, 1, 'contours', this.properties.contours);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('contours', e.srcElement.value);
	});

	return controls;
}


//NormalFlip object
CLARITY.NormalFlip = function(options){
	var options = options || {}
	this.properties = {
		red: options.red || false,
		green: options.green || false,
		swap: options.swap || false
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.NormalFlip.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.NormalFlip.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		if(this.properties.red){
			outPut.data[i] = 255-frame.data[i];
		}
		else{
			outPut.data[i] = frame.data[i];
		}

		if(this.properties.green){
			outPut.data[i+1] = 255-frame.data[i+1];
		}
		else{
			outPut.data[i+1] = frame.data[i+1];
		}

		if(this.properties.swap){
			var temp = outPut.data[i];
			outPut.data[i] = outPut.data[i+1];
			outPut.data[i+1] = temp;
		}

		outPut.data[i+2] = frame.data[i+2];
		outPut.data[i+3] = 255;
	}

	return outPut;
};

CLARITY.NormalFlip.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var toggle = CLARITY.Interface.createToggle('Red', this.properties.red);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('red');
	});

	toggle = CLARITY.Interface.createToggle('Green', this.properties.green);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('green');
	});

	toggle = CLARITY.Interface.createToggle('Swap', this.properties.swap);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('swap');
	});

	return controls;
}


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
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

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

			outPut.data[i] =   (1-(res.x/2+0.5))*255;
			outPut.data[i+1] = (1-(res.y/2+0.5))*255;
			outPut.data[i+2] = -res.z*255;

			outPut.data[i+3] = 255;
		}
	}

	//correcting horizontal edges
	for(var y = 0; y < frame.height; y++){
		var x = 0;
		var i = (y*frame.width + x)*4;
		var j = (y*frame.width + x+1)*4;

		outPut.data[i  ] = outPut.data[j  ];
		outPut.data[i+1] = outPut.data[j+1];
		outPut.data[i+2] = outPut.data[j+2];
		outPut.data[i+3] = 255;

		x = frame.width-1;
		i = (y*frame.width + x)*4;
		j = (y*frame.width + x-1)*4;

		outPut.data[i  ] = outPut.data[j  ];
		outPut.data[i+1] = outPut.data[j+1];
		outPut.data[i+2] = outPut.data[j+2];
		outPut.data[i+3] = 255;
	}

	//correcting vertical edges
	for(var x = 0; x < frame.width; x++){
		var y = 0;
		var i = (y*frame.width + x)*4;
		var j = ((y+1)*frame.width + x+1)*4;

		outPut.data[i  ] = outPut.data[j  ];
		outPut.data[i+1] = outPut.data[j+1];
		outPut.data[i+2] = outPut.data[j+2];
		outPut.data[i+3] = 255;

		y = frame.height-1;
		i = (y*frame.width + x)*4;
		j = ((y-1)*frame.width + x)*4;

		outPut.data[i  ] = outPut.data[j  ];
		outPut.data[i+1] = outPut.data[j+1];
		outPut.data[i+2] = outPut.data[j+2];
		outPut.data[i+3] = 255;
	}

	return outPut;
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

//NormalIntensity object
CLARITY.NormalIntensity = function(options){
	var options = options || {}
	this.properties = {
		intensity: options.intensity || 0.5
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.NormalIntensity.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.NormalIntensity.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 0; y < frame.height; y++){
		for(var x = 0; x < frame.width; x++){
			var i = (y*frame.width + x)*4;
			
			var vector = {  x: (frame.data[i  ]-128)/128,
							y: (frame.data[i+1]-128)/128,
							z:  frame.data[i+2]/255
						 };

			vector = this.normalise(vector);
			vector.x *= this.properties.intensity;
			vector.y *= this.properties.intensity;
			vector = this.normalise(vector);

			outPut.data[i] =   (vector.x+1)*128;
			outPut.data[i+1] = (vector.y+1)*128;
			outPut.data[i+2] = vector.z*255;

			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};

CLARITY.NormalIntensity.prototype.normalise = function(v){
	var mag = Math.sqrt(Math.abs(v.x*v.x + v.y*v.y + v.z*v.z));
	return{
		x: v.x/mag,
		y: v.y/mag,
		z: v.z/mag
	}
}

CLARITY.NormalIntensity.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 2, 0.1, 'intensity', this.properties.intensity);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('intensity', e.srcElement.value);
	});

	return controls;
}

//Brickulate object
CLARITY.Brickulate = function(options){
	var options = options || {};

	this.properties = {
		horizontalSegs: options.horizontalSegs || 4,
		verticalSegs: options.verticalSegs || 4,
		grooveSize: options.grooveSize || 5,
		offset: options.offset || false
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Brickulate.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Brickulate.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	var widthSegs = Math.round(frame.width/this.properties.horizontalSegs);
	var heightSegs = Math.round(frame.height/this.properties.verticalSegs);

	var grooveSize = this.properties.grooveSize;
	for(var y = 0; y < frame.height*4; y++){
		for(var x = 0; x < frame.width*4; x++){
			var i = (y*frame.width + x)*4;

			var xasd = x%widthSegs;
			var yasd = y%heightSegs;
			if(this.properties.offset){
				if(y%(heightSegs*2) < heightSegs){
					xasd += widthSegs*0.5;
					if(xasd > widthSegs){
						xasd -= widthSegs;
					}
				}
			}
			if((xasd <= grooveSize || xasd >= widthSegs-5) && (yasd <= grooveSize || yasd >= heightSegs-5)){
				outPut.data[i  ] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
				outPut.data[i+1] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
				outPut.data[i+2] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
			}
			else if(xasd <= grooveSize){
				outPut.data[i  ] = 255*(grooveSize-xasd)/grooveSize;
				outPut.data[i+1] = 255*(grooveSize-xasd)/grooveSize;
				outPut.data[i+2] = 255*(grooveSize-xasd)/grooveSize;
			}
			else if(xasd >= widthSegs-5){
				outPut.data[i  ] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
				outPut.data[i+1] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
				outPut.data[i+2] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
			}
			else if(yasd <= grooveSize){
				outPut.data[i  ] = 255*(grooveSize-yasd)/grooveSize;
				outPut.data[i+1] = 255*(grooveSize-yasd)/grooveSize;
				outPut.data[i+2] = 255*(grooveSize-yasd)/grooveSize;
			}
			else if(yasd >= heightSegs-5){
				outPut.data[i  ] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
				outPut.data[i+1] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
				outPut.data[i+2] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
			}
			else{
				outPut.data[i  ] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
			}

			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};


CLARITY.Brickulate.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	

	return controls;
}

//TODO: Make work properly
//Difference detector object
CLARITY.DifferenceDetector = function(options){
	var options = options || {};
	this.original = null;

	CLARITY.Filter.call( this, options );
};

CLARITY.DifferenceDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.DifferenceDetector.prototype.doProcess = function(frame){
		if(!this.original){
			this.original = frame;
			return frame;
		}

		var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

		for(var i = 0; i < frame.width*frame.height*4; i+=4){
			/*if(frame.data[i] != this.original.data[i] &&
					frame.data[i+1] != this.original.data[i+1] &&
					frame.data[i+2] != this.original.data[i+2]){*/
			var colour1 = [this.original.data[i], this.original.data[i+1], this.original.data[i+2]];
			var colour2 = [frame.data[i], frame.data[i+1], frame.data[i+2]];
			if(findDifference(colour2, colour1)){
				outPut.data[i]   = frame.data[i];
				outPut.data[i+1] = frame.data[i+1];
				outPut.data[i+2] = frame.data[i+2];
				outPut.data[i+3] = 255;
			}
			else{
				outPut.data[i]   = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
				outPut.data[i+3] = 255;
			}
		}

		return outPut;
	};

CLARITY.DifferenceDetector.prototype.resetOriginal = function(){
	this.original = null;
};

CLARITY.DifferenceDetector.prototype.findDifference = function(pix1, pix2){
	if(pix1[0] < pix2[0] + 75 && pix1[0] > pix2[0] - 75){
		if(pix1[1] < pix2[1] + 75 && pix1[1] > pix2[1] - 75){
			if(pix1[2] < pix2[2] + 75 && pix1[2] > pix2[2] - 75){
				return false;
			}
		}
	}
	return true;
};


CLARITY.Ghoster = function(options){
	var options = options || {};
	this.length = options.length || 10;
	this.frames = new Array();
	
	CLARITY.Filter.call( this, options );
};

CLARITY.Ghoster.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Ghoster.prototype.doProcess = function(frame){
	this.frames.unshift(frame);
	if(this.frames.length > this.length){
		this.frames.pop();
	}

	var output = CLARITY.ctx.createImageData(width, height);

	for(var i = 0; i < frame.data.length; i+=4){
		for (var j = 0; j < this.frames.length; j++) {
			output.data[i]   += this.frames[j].data[i]  /this.frames.length*(j/this.frames.length*2);
			output.data[i+1] += this.frames[j].data[i+1]/this.frames.length*(j/this.frames.length*2);
			output.data[i+2] += this.frames[j].data[i+2]/this.frames.length*(j/this.frames.length*2);
		};
		output.data[i+3] = 255;
	}

	return output;
};

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

/*
//Shot Detector object
CLARITY.ShotDetector = function(options){
	var count = [];
	var postCount = [];
	var frames = [];
	var dilateFrames = [];
	var index = 1;
	var prevECR = 0;
	var cutTime = 0;

	CLARITY.Filter.call( this, options );
};

CLARITY.ShotDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.ShotDetector.prototype.doProcess = function(frame){
	var outPut = cxt.createImageData(frame.width, frame.height);
	cxt2.putImageData(outPut, 0, 0);
	
	this.pushFrame(frame);

	//waits until the buffer is full before trying to do stuff
	if(frames.length < 2 || dilateFrames.length < 2){
		log("returning");
		return outPut;
	}

	//create new image data
	var postProcess = cxt.createImageData(frame.width, frame.height);

	//does the first compare, first frame times second dilation
	for(var i = 0; i < frames[index].data.length; i+=4){
		postProcess.data[i+0] = dilateFrames[1].data[i+0] * frames[0].data[i+0];
		postProcess.data[i+1] = dilateFrames[1].data[i+1] * frames[0].data[i+1];
		postProcess.data[i+2] = dilateFrames[1].data[i+2] * frames[0].data[i+2];
		postProcess.data[i+3] = 255;
	}
	//counts how many pixels are on after this
	for(var i = 0; i < frames[index].data.length; i+=4){
		if(postProcess.data[i] > 128){
			postCount[index] ++;
		}
	}

	//does the second compare, second frame times first dilation
	for(var i = 0; i < frames[index].data.length; i+=4){
		postProcess.data[i+0] = dilateFrames[0].data[i+0] * frames[1].data[i+0];
		postProcess.data[i+1] = dilateFrames[0].data[i+1] * frames[1].data[i+1];
		postProcess.data[i+2] = dilateFrames[0].data[i+2] * frames[1].data[i+2];
		postProcess.data[i+3] = 255;
	}

	//counts how many pixels are on after this
	for(var i = 0; i < frames[index].data.length; i+=4){
		if(postProcess.data[i] > 128){
			postCount[!index] ++;
		}
	}

	//calculate the edge change ratio between the two frames
	var ECR = maximum([postCount[0]/count[0], postCount[1]/count[1]]);
	ECR = postCount[0]/count[0] + postCount[1]/count[1];
	
	//compares the previous ECR with the current ECR to see if theres much difference
	var shot = false;
	if(Math.abs(ECR - prevECR) > 0.2){
		shot = true;
	}
	prevECR = ECR;
	log(ECR);

	if(cutTime > 0){
		cutTime --;
		shot = false;
	}
	//shows white if it detects a shot, black if not
	for(var i = 0; i < outPut.data.length; i++){
		if(shot){
			cutTime = 3;
			log("shot detected");
			outPut.data[i] = 255;
		}
		else{
			outPut.data[i] = 0;
		}
	}

	return outPut;
};

	//used for analysis, to push frames on without processing them
	this.pushFrame = function(frame){
		//gets the edges of the new frame
		var edgeDetector = new EdgeDetector();
		var threshOld = thresheld;
		thresheld = true;
		var outPut = edgeDetector.process(frame);
		thresheld = threshOld;

		//increments and bounds checks the index
		index ++;
		if(index > 1){
			index = 0;
		}
		//makes a new frame, then copies the edge data into it
		frames[index] = cxt.createImageData(frame.width, frame.height);
		for(var i = 0; i < outPut.data.length; i++){
			frames[index].data[i] = outPut.data[i];
		}

		//resets the counts
		count[index] = 0;
		postCount[index] = 0;

		//dilates the image
		for(var y = 0; y < frame.height*4; y+=4){
			for(var x = 0; x < frame.width*4; x+=4){
				var i = y*frame.width + x;
				if(frames[index].data[i] > 128){
					cxt2.fillStyle = "#FFFFFF";
					cxt2.beginPath();
					cxt2.arc(x/4, y/4, 5, 5, Math.PI*2, true); 
					cxt2.closePath();
					cxt2.fill();
					count[index] ++;
				}
			}
		}

		//gets dilate image data, and sets alpha channel to 255
		dilateFrames[index] = cxt2.getImageData(0, 0, frame.width, frame.height);
		for(var i = 3; i < dilateFrames[index].data.length; i+=4){
			dilateFrames[index].data[i] = 255;
		}
	};

//returns the maximum value of the inputs in ins
	function maximum(ins){
		var out = 0;
		for(var i = 0; i < ins.length; i++){
			if(ins[i] > out){
				out = ins[i];
			}
		}
		return out;
	}
}
*/
//Desaturate object
CLARITY.Desaturate = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.Desaturate.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Desaturate.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		var colour = this.getColourValue(frame, i, 'grey');
		
		outPut.data[i+0] = colour;
		outPut.data[i+1] = colour;
		outPut.data[i+2] = colour;
		outPut.data[i+3] = 255;
	}

	return outPut;
};

//Dot Remover object
CLARITY.DotRemover = function(options){
	var options = options || {};
	this.neighboursReq = options.neighboursReq || 1;
	
	CLARITY.Filter.call( this, options );
}

CLARITY.DotRemover.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.DotRemover.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 1; y < frame.height - 1; y++){
		for(var x = 1; x < frame.width - 1; x++){
			var i = (y*frame.width + x)*4;
			
			var up = ((y-1)*frame.width + x)*4;
			var down = ((y+1)*frame.width + x)*4;
			var left = (y*frame.width + (x-1))*4;
			var right = (y*frame.width + (x+1))*4;
			
			var col = frame.data[i];
			var count = 0;
			if(frame.data[up] == col) count++;
			if(frame.data[down] == col) count++;
			if(frame.data[left] == col) count++;
			if(frame.data[right] == col) count++;

			if(count <= this.neighboursReq){
				if(col > 138){
					outPut.data[i] = 0;
					outPut.data[i+1] = 0;
					outPut.data[i+2] = 0;
				}
				else{
					outPut.data[i] = 255;
					outPut.data[i+1] = 255;
					outPut.data[i+2] = 255;
				}
			}
			else{
				outPut.data[i] = col;
				outPut.data[i+1] = col;
				outPut.data[i+2] = col;
			}
			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};

//hsvShifter object
CLARITY.hsvShifter = function(options){
	var options = options || {};

	this.properties = {
		hue: options.hue || 0,
		saturation: options.saturation || 1,
		value: options.value || options.lightness || 1
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.hsvShifter.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.hsvShifter.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		var col = CLARITY.Operations.RGBtoHSV([frame.data[i], frame.data[i+1], frame.data[i+2]]);
		
		col[0] += this.properties.hue;
		if(col[0] > 360){
			col[0] -= 360;
		}
		col[1] *= this.properties.saturation;
		col[2] *= this.properties.value;
		
		col = CLARITY.Operations.HSVtoRGB([col[0], col[1], col[2]]);
		
		outPut.data[i+0] = col[0];
		outPut.data[i+1] = col[1];
		outPut.data[i+2] = col[2];
		outPut.data[i+3] = 255;
	}

	return outPut;
};

CLARITY.hsvShifter.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 360, 1, 'hue', this.properties.hue);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('hue', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 2, 0.1, 'saturation', this.properties.saturation);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('saturation', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 2, 0.1, 'lightness', this.properties.lightness);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('value', e.srcElement.value);
	});

	return controls;
}

//Invert object
CLARITY.Invert = function(options){
	var options = options || {};

	this.properties = {
		dynamic: options.dynamic || false,
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Invert.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Invert.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	if(!this.properties.dynamic){
		for(var i = 0; i < frame.width*frame.height*4; i+=4){
			outPut.data[i  ] = 255-frame.data[i  ];
			outPut.data[i+1] = 255-frame.data[i+1];
			outPut.data[i+2] = 255-frame.data[i+2];
			outPut.data[i+3] = 255;
		}
	}
	else{
		var min = 255;
		var max = 0;

		for(var i = 0; i < frame.width*frame.height*4; i+=4){
			var colour = this.getColourValue(frame, i, this.channel);

			if(colour < min){
				min = colour;
			}
			if(colour > max){
				max = colour;
			}
		}

		for(var i = 0; i < frame.width*frame.height*4; i+=4){
			outPut.data[i  ] = max-min-(frame.data[i  ])+min;
			outPut.data[i+1] = max-min-(frame.data[i+1])+min;
			outPut.data[i+2] = max-min-(frame.data[i+2])+min;
			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};

//Noise object
CLARITY.Noise = function(options){
	var options = options || {};

	this.properties = {
		intensity: options.intensity || 1,
		monochromatic: options.monochromatic || false
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Noise.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Noise.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		if(this.properties.monochromatic){
			var random = 2*(Math.random()-0.5)*this.properties.intensity;
			// var col = CLARITY.Operations.RGBtoHSV([frame.data[i], frame.data[i+1], frame.data[i+2]]);
			// col[2] += CLARITY.Operations.clamp((Math.random()-0.5)*2, 0, 1);
			// col = CLARITY.Operations.HSVtoRGB([col[0], col[1], col[2]]);
			outPut.data[i  ] = frame.data[i  ] + random;
			outPut.data[i+1] = frame.data[i+1] + random;
			outPut.data[i+2] = frame.data[i+2] + random;
		}
		else{
			outPut.data[i  ] = frame.data[i  ] + 2*(Math.random()-0.5)*this.properties.intensity;
			outPut.data[i+1] = frame.data[i+1] + 2*(Math.random()-0.5)*this.properties.intensity;
			outPut.data[i+2] = frame.data[i+2] + 2*(Math.random()-0.5)*this.properties.intensity;
		}
		
		outPut.data[i+3] = 255;
	}

	return outPut;
};

CLARITY.Noise.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 10, 0.1, 'intensity', this.properties.intensity);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('intensity', e.srcElement.value);
	});

	var toggle = CLARITY.Interface.createToggle('monochromatic', this.properties.monochromatic);
	controls.appendChild(toggle);
	toggle.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.toggleBool('monochromatic');
	});

	return controls;
}


//Pixelate object
CLARITY.Pixelate = function(options){
	var options = options || {}
	this.properties = {
		size: options.size || 64
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Pixelate.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Pixelate.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	var size = this.properties.size;
	//makes sure the tile size is a multiple of the width/height
	while(frame.height%size != 0){
		size --;
	}
	var size2 = Math.round(size/2);
	for(var y = 0; y < frame.height; y += size){
		for(var x = 0; x < frame.width; x += size){

			var pos = ((y+size2)*frame.width + (x+size2))*4;
			for(var ypos = 0; ypos < size; ypos++){
				for(var xpos = 0; xpos < size; xpos++){
					var i = ((ypos+y)*frame.width + xpos+x)*4;
					outPut.data[i  ] = frame.data[pos  ];
					outPut.data[i+1] = frame.data[pos+1];
					outPut.data[i+2] = frame.data[pos+2];
					outPut.data[i+3] = 255;
				}
			}
		}
	}

	return outPut;
};

CLARITY.Pixelate.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 256, 1, 'size', this.properties.size);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('size', e.srcElement.value);
	});

	return controls;
}

//Posterise object
CLARITY.Posteriser = function(options){
	var options = options || {};

	this.properties = {};

	this.method = options.method;
	if(this.method == 'fast'){
		this.threshes = [128, 256];
		this.difference = 32;
		this.setThresh(64);
	}
	else{
		this.properties.colours = options.colours || 5;
		this.MCut = new CLARITY.MCut().MCut;
	}

	CLARITY.Filter.call( this, options );

};

CLARITY.Posteriser.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Posteriser.prototype.doProcess = function(frame){
	if(this.method == 'fast'){
		return this.oldMethod(frame);
	}
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	var data = [];
	for(var i = 0; i < frame.data.length; i+=4){
		data.push([frame.data[i],frame.data[i+1],frame.data[i+2]]);
	}

	this.MCut.init(data);
	var palette = this.MCut.get_fixed_size_palette(this.properties.colours);

	var prevDistance;
	var prevColour;
	var count = 0;
	var total = 0;
	for(var i = 0; i < frame.data.length; i+=4){
		var pix = [frame.data[i],frame.data[i+1],frame.data[i+2]];
		var tempDist;

		//attempts to improve performance by assuming that this colour might
		//be similar to the previous one, and thus don't search through
		//whole colour array.
		if(prevColour && tempDist < prevDistance + 5 && tempDist > prevDistance - 5){
			tempDist = CLARITY.Operations.colourDistance(pix, prevColour);
			col = prevColour;
		}
		else{
			var col = palette[0];
			var dist = CLARITY.Operations.colourDistance(pix, col);
			for(var j = 1; j < palette.length; j++){
				tempDist = CLARITY.Operations.colourDistance(pix, palette[j]);
				if(tempDist < dist){
					dist = tempDist;
					col = palette[j];
				}
			}
			prevColour = col;
			prevDistance = dist;
		}

		outPut.data[i]   = col[0];
		outPut.data[i+1] = col[1];
		outPut.data[i+2] = col[2];
		outPut.data[i+3] = 255;
	}

	return outPut;
};

//The old way i used to posterise, which is not accurate but is fast
CLARITY.Posteriser.prototype.oldMethod = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);
	this.setThresh(Math.round(255/this.properties.colours));

	for(var i = 0; i < frame.data.length; i+=4){
		if(!((i+1)%4 == 0)){
			for(var j = 0; j < this.threshes.length; j++){
				if(frame.data[i] < this.threshes[j]){
					outPut.data[i] = this.threshes[j] - this.difference/2;
					break;
				}
			}
		}
		else{
			outPut.data[i] = 255;
		}
	}

	return outPut;
};

CLARITY.Posteriser.prototype.setThresh = function(newNo){
	this.threshes = [];
	this.difference = newNo;
	var index = 0;
	for(var i = this.difference; i <= 256; i+= this.difference){
		this.threshes[index] = i;
		index ++;
	}
	this.threshes[index] = i;
};

CLARITY.Posteriser.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(1, 20, 1, 'Colours', this.properties.colours);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('colours', e.srcElement.value);
	});

	return controls;
}

//Sharpen object
CLARITY.Sharpen = function(options){
	var options = options || {};

	this.properties = {
		intensity: options.intensity || 1
	};

	this.makeKernel(this.properties.intensity);

	CLARITY.Filter.call( this, options );
};

CLARITY.Sharpen.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Sharpen.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	// for(var y = frame.height*4-4; y > 4; y -= 4){
		// for(var x = frame.width*4-4; x > 4; x -= 4){
	for(var y = 4; y < frame.height*4-4; y+=4){
		for(var x = 4; x < frame.width*4-4; x+=4){
			var sumr = 0;
			var sumg = 0;
			var sumb = 0;
			for(var ky = -1; ky <= 1; ky++){
				for(var kx = -1; kx <= 1; kx++){
					var pos = (y + ky*4)*frame.width + (x + kx*4);
					
					var valr = this.getColourValue(frame, pos, 'red');
					var valg = this.getColourValue(frame, pos, 'green');
					var valb = this.getColourValue(frame, pos, 'blue');

					sumr += this.kernel[ky+1][kx+1] * valr;
					sumg += this.kernel[ky+1][kx+1] * valg;
					sumb += this.kernel[ky+1][kx+1] * valb;
				}
			}
			outPut.data[y*frame.width + x]   = sumr;
			outPut.data[y*frame.width + x+1] = sumg;
			outPut.data[y*frame.width + x+2] = sumb;
			outPut.data[y*frame.width + x+3] = 255;
		}
	}

	return outPut;
};

CLARITY.Sharpen.prototype.makeKernel = function(intensity){
	this.kernel = [ [ -intensity, -intensity, -intensity],
				    [ -intensity,  8*intensity+1, -intensity],
				    [ -intensity, -intensity, -intensity]];
}

CLARITY.Sharpen.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 3, 0.1, 'Intensity', this.properties.intensity);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('intensity', e.srcElement.value);
		self.makeKernel(self.properties.intensity);
	});

	return controls;
}

//Smoother object
CLARITY.Smoother = function(options){
	var options = options || {};
	// this.distance = options.distance || 1;
	this.iterations = options.iterations || 1;
	this.properties = {
		iterations: options.iterations || 1
	};

	CLARITY.Filter.call( this, options );
}

CLARITY.Smoother.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Smoother.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var z = 0; z < this.properties.iterations; z++){
		for(var y = 0; y < frame.height; y++){
			for(var x = 0; x < frame.width; x++){
				var i = (y*frame.width + x)*4;

				var up = ((y-1)*frame.width + x)*4;
				var down = ((y+1)*frame.width + x)*4;
				var left = (y*frame.width + (x-1))*4;
				var right = (y*frame.width + (x+1))*4;

				var count = 0;
				var col = [0, 0, 0];

				if(x != 0){
					col[0] += frame.data[left];
					col[1] += frame.data[left+1];
					col[2] += frame.data[left+2];
					count ++;
				}
				if(x != frame.width-1){
					col[0] += frame.data[right];
					col[1] += frame.data[right+1];
					col[2] += frame.data[right+2];
					count ++;
				}
				if(y != 0){
					col[0] += frame.data[up];
					col[1] += frame.data[up+1];
					col[2] += frame.data[up+2];
					count ++;
				}
				if(y != frame.height-1){
					col[0] += frame.data[down];
					col[1] += frame.data[down+1];
					col[2] += frame.data[down+2];
					count ++;
				}

				outPut.data[i  ] = col[0]/count;
				outPut.data[i+1] = col[1]/count;
				outPut.data[i+2] = col[2]/count;
				outPut.data[i+3] = 255;
			}
		}
	}

	return outPut;
};

CLARITY.Smoother.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(1, 5, 1, 'iterations', this.properties.iterations);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('iterations', e.srcElement.value);
	});

	return controls;
}

//Edge detector object
CLARITY.EdgeDetector = function(options){
	var options = options || {};

	this.properties = {
		fast: options.fast || false
	}

	this.kernel = [ [ -1, -1, -1],
				   [ -1,  8, -1],
				   [ -1, -1, -1]];
	/*this.kernel = [ [ 0, 0, 0],
				   [ 0, 3, 0],
				   [ 0, 0, -3]];*/

	CLARITY.Filter.call( this, options );
};

CLARITY.EdgeDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.EdgeDetector.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	if(!this.properties.fast){
		for(var y = 4; y < frame.height*4-4; y+=4){
			for(var x = 4; x < frame.width*4-4; x+=4){
				var sum = 0; // Kernel sum for this pixel
				for(var ky = -1; ky <= 1; ky++){
					for(var kx = -1; kx <= 1; kx++){
						// Calculate the adjacent pixel for this kernel point
						var pos = (y + ky*4)*frame.width + (x + kx*4);
						// Image is grayscale, red/green/blue are identical
						var val = this.getColourValue(frame, pos);
						// Multiply adjacent pixels based on the kernel values
						sum += this.kernel[ky+1][kx+1] * val;
					}
				}
				outPut.data[y*frame.width + x] = sum;
				outPut.data[y*frame.width + x+1] = sum;
				outPut.data[y*frame.width + x+2] = sum;
				outPut.data[y*frame.width + x+3] = 255;
			}
		}
	}
	else{//a more fast edge detection, between 2 points only
		for(var y = 4; y < frame.height*4-4; y+=4){
			for(var x = 4; x < frame.width*4-4; x+=4){
				var i = y*frame.width + x;
				outPut.data[i]   = Math.abs(this.getColourValue(frame, i+4)-this.getColourValue(frame, i))*5;
				outPut.data[i+1] = Math.abs(this.getColourValue(frame, i+4)-this.getColourValue(frame, i))*5;
				outPut.data[i+2] = Math.abs(this.getColourValue(frame, i+4)-this.getColourValue(frame, i))*5;
			
				outPut.data[i+3] = 255;
			}
		}
	}

	return outPut;
};

CLARITY.EdgeDetector.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var toggle = CLARITY.Interface.createToggle('fast', this.properties.fast);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('fast');
	});

	return controls;
}


//Motion Detector object
CLARITY.MotionDetector = function(options){
	this.frames = [];
	this.index = 0;
	var options = options || {};
	
	this.properties = {
		frameCount: options.frameCount || 1
	}
	this.preindex = this.properties.frameCount;

	CLARITY.Filter.call( this, options );
};

CLARITY.MotionDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.MotionDetector.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	this.pushFrame(frame);
	
	//waits until the buffer is full before trying to do stuff
	if(this.frames.length < this.properties.frameCount+1){
		return outPut;
	}

	//does motion detecting
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		outPut.data[i+0] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
		outPut.data[i+1] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
		outPut.data[i+2] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
		outPut.data[i+3] = 255;
	}
	return outPut;
};

CLARITY.MotionDetector.prototype.pushFrame = function(frame){
	//makes a new frame, then copies current frame data into it
	this.frames[this.index] = CLARITY.ctx.createImageData(frame.width, frame.height);
	for(var i = 0; i < frame.data.length; i++){
		this.frames[this.index].data[i] = frame.data[i];
	}
	//increments and bounds checks the index
	this.index ++;
	if(this.index > this.properties.frameCount){
		this.index = 0;
	}
	//increments and bounds the preindex
	this.preindex ++;
	if(this.preindex > this.properties.frameCount){
		this.preindex = 0;
	}
};

CLARITY.MotionDetector.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(1, 24, 1, 'Frame Count', this.properties.frameCount);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('frameCount', e.srcElement.value);

		self.index = 0;
		self.preindex = e.srcElement.value-1;
		self.frames = [];
	});

	return controls;
}

//Skin Detector object
CLARITY.SkinDetector = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.SkinDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.SkinDetector.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);
	this.RGBAtoYCbCr(outPut, frame);
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		if(outPut.data[i] > 30 && 
				80 < outPut.data[i+1] && outPut.data[i+1] < 121 && 
				133 < outPut.data[i+2] && outPut.data[i+2] < 173){
			outPut.data[i+0] = 255;
			outPut.data[i+1] = 255;
			outPut.data[i+2] = 255;
		}
		else{
			outPut.data[i+0] = 0;
			outPut.data[i+1] = 0;
			outPut.data[i+2] = 0;
		}
		
		outPut.data[i+3] = 255;
	}

	return outPut;
};

//converts RGBA into YCbCr values for skin detection
//conversion functions sourced from lecture notes
CLARITY.SkinDetector.prototype.RGBAtoYCbCr = function(outPut, frame){
	var Y, Cb, Cr;
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		Y = 16 + (66*frame.data[i] + 129*frame.data[i+1] + 25*frame.data[i+2])/256;
		Cb = 128 + (-38*frame.data[i] - 74*frame.data[i+1] + 112*frame.data[i+2])/256;
		Cr = 128 + (112*frame.data[i] - 94*frame.data[i+1] - 18*frame.data[i+2])/256;

		outPut.data[i] = Y;
		outPut.data[i+1] = Cb;
		outPut.data[i+2] = Cr;
	}
};


//Cloud object
CLARITY.Cloud = function(options){
	var options = options || {}
	this.properties = {
		red: options.red || 0,
		green: options.green || 0,
		blue: options.blue || 0,
		linear: options.linear || false,
		iterations: options.iterations || 4,
		initialSize: options.initialSize || 4
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Cloud.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Cloud.prototype.doProcess = function(frame){
	var size = this.properties.initialSize;
	var iterations = 0;

	var data = [];
	for(var i = 0; i < frame.height*frame.width*3; i++){
		data[i] = 0;
	}
	for(var z = 0; z < this.properties.iterations; z++){
		size *= (z+1);
		if(size > frame.width){
			break;
		}
		iterations ++;

		var values = [];
		for(var i = 0; i < size; i++){
			values[i] = [];
			for(var j = 0; j < size; j++){
				values[i][j] = Math.round(Math.random()*255);
			}
		}

		for(var y = 0; y < frame.height; y++){
			for(var x = 0; x < frame.width; x++){
				var i = (y*frame.width + x)*3;

				var xpercent = (x%(frame.width/size))/(frame.width/size);
				var ypercent = (y%(frame.height/size))/(frame.height/size);
				var x1 = Math.floor(x/frame.width*size);
				var x2 = Math.ceil(x/frame.width*size);
				if(x2 >= size){
					x2 = 0;
				}

				var y1 = Math.floor(y/frame.height*size);
				var y2 = Math.ceil(y/frame.height*size);
				if(y2 >= size){
					y2 = 0;
				}

				var xval1; //interpolate in x(top) first
				var xval2; //interpolate in x(bottom) second
				var yval2; //interpolate between x(top) and x(bottom) using y

				if(!this.properties.linear){
					xpercent = this.smoothStep(xpercent);
					ypercent = this.smoothStep(ypercent);
				}
				
				xval1 = this.linearInterpolate(values[y1][x1], values[y1][x2], xpercent);
				xval2 = this.linearInterpolate(values[y2][x1], values[y2][x2], xpercent);
				yval2 = this.linearInterpolate(xval1, xval2, ypercent);

				data[i  ] += yval2/(z+1);
				data[i+1] += yval2/(z+1);
				data[i+2] += yval2/(z+1);
			}
		}
	}

	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);
	for(var k = 0; k < data.length; k ++){
		var i = k * 3;
		var j = k * 4;
		outPut.data[j  ] = data[i  ]/iterations * this.properties.red/255;
		outPut.data[j+1] = data[i+1]/iterations * this.properties.green/255;
		outPut.data[j+2] = data[i+2]/iterations * this.properties.blue/255;
		outPut.data[j+3] = 255;
	}
	return outPut;
};

CLARITY.Cloud.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 255, 1, 'red', this.properties.red);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('red', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 255, 1, 'green', this.properties.green);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('green', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 255, 1, 'blue', this.properties.blue);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('blue', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 10, 1, 'iterations', this.properties.iterations);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('iterations', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 16, 1, 'Initial Size', this.properties.initialSize);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('initialSize', e.srcElement.value);
	});

	var toggle = CLARITY.Interface.createToggle('linear', this.properties.linear);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('linear');
	});

	return controls;
}

CLARITY.Cloud.prototype.linearInterpolate = function(min, max, x){
	return min+(max-min)*x;
}

CLARITY.Cloud.prototype.smoothStep = function(x){
	return x*x*(3 - 2*x);
}

CLARITY.Cloud.prototype.smootherStep = function(x){
	return x*x*x*(x*(x*6 - 15) + 10);
}


//FillHSV object
CLARITY.FillHSV = function(options){
	var options = options || {}
	this.properties = {
		hue: options.hue || 0,
		saturation: options.saturation || 0,
		value: options.value || options.lightness || 0
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.FillHSV.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.FillHSV.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	var col = CLARITY.Operations.HSVtoRGB([this.properties.hue, this.properties.saturation, this.properties.value]);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		outPut.data[i  ] = col[0];
		outPut.data[i+1] = col[1];
		outPut.data[i+2] = col[2];
		outPut.data[i+3] = 255;
	}

	return outPut;
};

CLARITY.FillHSV.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 360, 1, 'hue', this.properties.hue);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('hue', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 2, 0.1, 'saturation', this.properties.saturation);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('saturation', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 2, 0.1, 'lightness', this.properties.value);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('value', e.srcElement.value);
	});

	return controls;
}


//FillRGB object
CLARITY.FillRGB = function(options){
	var options = options || {}
	this.properties = {
		red: options.red || 0,
		green: options.green || 0,
		blue: options.blue || 0
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.FillRGB.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.FillRGB.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);
        // color: Math.floor(Math.random()*16777215).toString(16)

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		outPut.data[i  ] = this.properties.red;
		outPut.data[i+1] = this.properties.green;
		outPut.data[i+2] = this.properties.blue;
		outPut.data[i+3] = 255;
	}

	return outPut;
};

CLARITY.FillRGB.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 255, 1, 'red', this.properties.red);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('red', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 255, 1, 'green', this.properties.green);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('green', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 255, 1, 'blue', this.properties.blue);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('blue', e.srcElement.value);
	});

	return controls;
}


//Gradient Threshold object
CLARITY.GradientThreshold = function(options){
	var options = options || {};

	this.properties = {
		threshold: options.threshold || 20,
		distance: options.distance || 1
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.GradientThreshold.prototype = Object.create( CLARITY.Filter.prototype );

//The main function to do all the thresholding from
CLARITY.GradientThreshold.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	var found = false;
	for(var y = this.properties.distance; y < frame.height - this.properties.distance; y++){
		for(var x = this.properties.distance; x < frame.width - this.properties.distance; x++){
			found = false;
			var i = (y*frame.width + x)*4;
			var up = ((y-this.properties.distance)*frame.width + x)*4;
			var down = ((y+this.properties.distance)*frame.width + x)*4;
			var left = (y*frame.width + (x-this.properties.distance))*4;
			var right = (y*frame.width + (x+this.properties.distance))*4;
			
			if(frame.data[i] < frame.data[left] - this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] > frame.data[left] + this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] < frame.data[right] - this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] > frame.data[right] + this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] < frame.data[up] - this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] > frame.data[up] + this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] < frame.data[down] - this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] > frame.data[down] + this.properties.threshold){
				found = true;
			}
			if(found){
				outPut.data[i+0] = 255;
				outPut.data[i+1] = 255;
				outPut.data[i+2] = 255;
				outPut.data[i+3] = 255;
			}
			else{
				outPut.data[i+0] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
				outPut.data[i+3] = 255;	
			}
			
		}
	}
	return outPut;
};

CLARITY.GradientThreshold.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 100, 1, 'Threshold', this.properties.threshold);
	controls.appendChild(slider);
		slider.addEventListener('change', function(e){
		self.setFloat('threshold', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 10, 1, 'Distance', this.properties.distance);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('distance', e.srcElement.value);
	});

	return controls;
}

//Median Threshold object
CLARITY.MedianThreshold = function(options){
	var threshes;

	CLARITY.Filter.call( this, options );
};

CLARITY.MedianThreshold.prototype = Object.create( CLARITY.Filter.prototype );

//The main function to do all the thresholding from
CLARITY.MedianThreshold.prototype.doProcess = function(frame, thresh){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	//gets the threshold value
	this.threshes = this.getThresholdValues(frame);
	this.threshes.push(256);
	//performs the thresholding on the data
	for(var i = 0; i < frame.data.length; i++){
		if(!((i+1)%4 == 0)){
			for(var j = 0; j < this.threshes.length; j++){
				if(frame.data[i] < this.threshes[j]){
					outPut.data[i] = this.threshes[j];
					break;
				}
			}
		}
		else{
			outPut.data[i] = 255;
		}
	}

	return outPut;
};

//gets the threshold values
CLARITY.MedianThreshold.prototype.getThresholdValues = function(data){
	var values = new Array();
	var median = [0,0,0];

	for(var i = 0; i < 256; i++){
		values[i] = 0;
	}

	for(var i = 0; i < data.data.length; i+=4){
		// if(data.data[i] != 0)
			values[data.data[i]] ++;
	}

	var cumulative = 0;
	var maximum = data.data.length/4/4;
	var pos = 0;
	for(var i = 0; i < 256; i++){
		cumulative += values[i];
		if(cumulative > maximum){
			maximum += data.data.length/4/4;
			median[pos] = i;
			pos++;
		}
	}

	return median;
}

//Value Threshold object
CLARITY.ValueThreshold = function(options){
	var options = options || {};

	this.properties = {
		inverted: options.inverted || false,
		threshold: options.threshold || null		
	}
	
	CLARITY.Filter.call( this, options );
};

CLARITY.ValueThreshold.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.ValueThreshold.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	//gets the threshold value
	var threshold = this.properties.threshold || this.getThresholdValue(frame);
	//performs the thresholding on the data
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		var colour = this.getColourValue(frame, i, this.channel);
		if(this.properties.inverted){
			if(colour < threshold){
				outPut.data[i+0] = 255;
				outPut.data[i+1] = 255;
				outPut.data[i+2] = 255;
			}
			else{
				outPut.data[i+0] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
			}
		}
		else{
			if(colour > threshold){
				outPut.data[i+0] = 255;
				outPut.data[i+1] = 255;
				outPut.data[i+2] = 255;
			}
			else{
				outPut.data[i+0] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
			}
		}
		outPut.data[i+3] = 255;
	}

	return outPut;
};

//used to get an iterative average threshold value
CLARITY.ValueThreshold.prototype.getThresholdValue = function(data){
	var average;
	average = this.getColourValue(data, 0);
	//finds the intial average of all the data
	for(var i = 4; i < data.width*data.height*4; i+=4){
		var colour = this.getColourValue(data, i);
		average = (average+colour)/2;
	}

	var lower = 0;
	var upper = 0;
	var previous = 0;
	var current = average;
	//checks to see if the new average is near the old average
	while(!(previous > current - 1 && previous < current + 1)){
		previous = current;
		//splits the data up depending on the current threshold, and finds an average of each
		for(var i = 0; i < data.width*data.height*4; i+=4){
			var colour = this.getColourValue(data, i);
			if(colour < previous){
				if(lower == 0){
					lower = colour;
				}
				else{
					lower = (lower + colour)/2;
				}
			}
			else{
				if(upper == 0){
					upper = colour;
				}
				else{
					upper = (upper + colour)/2;
				}
			}
		}
		//averages the two averages
		current = (upper+lower)/2;
		lower = 0;
		upper = 0;
	}
	return current;
}

CLARITY.ValueThreshold.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var toggle = CLARITY.Interface.createToggle('Inverted', this.properties.inverted);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('inverted');
	});

	var slider = CLARITY.Interface.createSlider(0, 255, 1, 'Threshold', this.properties.threshold);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('threshold', e.srcElement.value);
	});

	return controls;
}
//Mirror
//Mirrors the image in x or y
CLARITY.Mirror = function(options){
	var options = options || {};

	this.properties = {
		Horizontal: options.Horizontal || true,
		Vertical: options.Vertical || false
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Mirror.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Mirror.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 0; y < frame.height; y++){
		for(var x = 0; x < frame.width; x++){
			var from = (y*frame.width + x)*4;
			var toX = x;
			var toY = y;
			if(this.properties.Horizontal){
				toX = frame.width-x;
			}
			if(this.properties.Vertical){
				toY = frame.height-y;
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

CLARITY.Mirror.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var toggle = CLARITY.Interface.createToggle('Vertical', this.properties.Vertical);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('Vertical');
	});

	toggle = CLARITY.Interface.createToggle('Horizontal', this.properties.Horizontal);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('Horizontal');
	});

	return controls;
}
//Rotator
//Rotates the image clockwise by the number of turns * 90 degrees
//If width/height are not the same, will crap the image to be square
CLARITY.Rotator = function(options){
	var options = options || {};
	this.properties = {
		turns: options.turns || 0
	};

	while(this.properties.turns < 0){
		this.properties.turns += 4;
	}
	while(this.properties.turns >= 4){
		this.properties.turns -= 4;
	}

	CLARITY.Filter.call( this, options );
};

CLARITY.Rotator.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Rotator.prototype.doProcess = function(frame){
	if(this.properties.turns == 0){
		return frame;
	}
	var width = frame.width;
	var height = frame.height;
	var offset = 0;

	if(this.properties.turns == 1 || this.properties.turns == 3 && frame.width != frame.height){
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
			if(this.properties.turns == 1){
				toX = -y;
				toY = x;
			}
			else if(this.properties.turns == 2){
				toX = -x;
				toY = -y;
			}
			else if(this.properties.turns == 3){
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

CLARITY.Rotator.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(-3, 3, 1, 'Turns', this.properties.turns);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('turns', e.srcElement.value);
	});

	return controls;
}
//Tiler
//Tiles the image
CLARITY.Tiler = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.Tiler.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Tiler.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 0; y < frame.height; y+=2){
		for(var x = 0; x < frame.width; x+=2){
			var from1 = (y*frame.width + x)*4;
			var from2 = (y*frame.width + x+1)*4;
			var from3 = ((y+1)*frame.width + x)*4;
			var from4 = ((y+1)*frame.width + x+1)*4;

			//Top Left
			var toX = x/2;
			var toY = y/2;

			var to = (toY*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from1];
			outPut.data[to+1] = frame.data[from1+1];
			outPut.data[to+2] = frame.data[from1+2];
			outPut.data[to+3] = 255;

			//Top Right
			toX = frame.width - x/2-1;
			toY = y/2;
			to = (toY*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from2];
			outPut.data[to+1] = frame.data[from2+1];
			outPut.data[to+2] = frame.data[from2+2];
			outPut.data[to+3] = 255;

			//Bottom Left
			toX = x/2;
			toY = frame.height - y/2-1;
			to = (toY*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from3];
			outPut.data[to+1] = frame.data[from3+1];
			outPut.data[to+2] = frame.data[from3+2];
			outPut.data[to+3] = 255;

			//Bottom Right
			toX = frame.width - x/2-1;
			toY = frame.height - y/2-1;
			to = (toY*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from4];
			outPut.data[to+1] = frame.data[from4+1];
			outPut.data[to+2] = frame.data[from4+2];
			outPut.data[to+3] = 255;
		}
	}

	return outPut;
};

//Translator
//Translates the image by the percentages specified
CLARITY.Translator = function(options){
	var options = options || {};

	this.properties = {
		horizontal: CLARITY.Operations.clamp(options.horizontal || 0.5, -1, 1),
		verticle: CLARITY.Operations.clamp(options.verticle || 0.5, -1, 1)
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Translator.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Translator.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);
	var xTranslate = Math.ceil(frame.width * this.properties.horizontal);
	var yTranslate = Math.ceil(frame.height * this.properties.verticle);

	for(var y = 0; y < frame.height; y++){
		for(var x = 0; x < frame.width; x++){
			var from = (y*frame.width + x)*4;
			var toX = x + xTranslate;
			var toY = y + yTranslate;
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

CLARITY.Translator.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 1, 0.01, 'Vertical', this.properties.vertical);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('verticle', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 1, 0.01, 'Horizontal', this.properties.horizontal);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('horizontal', e.srcElement.value);
	});

	return controls;
}
