Clarity
=======

Canvas image filter library

Current Filters
===============

Height Map
----------
### Contourer
Shows the contours in a height map
### Normal Generator
Generates a normal based on a height map
### Normal Editor
Edits properties of normal maps

Misc
----
	Difference Detector
		Will detect differences in a scene, based on the first shot (not working)
	Ghoster
		Adds a ghosting/onion skin effect to a video
	Puzzler
		Scrambles up the image like a puzzle

Process
-------
	De-saturate
		Removes colour from an image
	Dot Remover
		Cleans up outlying pixels in a binary image
	HSV Shifter
		Allows editing an images hue/saturation/lightness values
	Posterise
		Reduces an image into a fixed number of colours
	Sharpen
		Applies a sharpening mask to an image, to enhance edges/detail
	Smoother
		Simple neighbouring blur function

Salience
--------
	Edge Detector
		Detects the edges in a scene
	Motion Detector
		Detects any motion between a series of frames
	Skin Detection
		Detects skin in a scene. Relies on correct lighting.

Thresholders
------------
	Average Thresholder
		Thresholds the image based on a calculated or given pixel value
	Gradient Thresholder
		Thresholds over changes in gradient in an image, resulting in edge detection
	Median Thresholder
		Colour quantisation over median and quartile pixel values

Transform
---------
	Mirror
		Flips the image in horizontal or vertical axis
	Rotator
		Rotates an image in 90 degree increments. Will crop a rectangular image to be square
	Tiler
		Will tile an image so it's edges all line up
	Translator
		Will move an image in horizontal or vertical axis based on a percentage


Filters to be made
==================

Skeletiser
	Will draw the skeleton of the image
Histogram
	Will output a visual histogram of an image, or just the histogram values
Bloat/Erode
	Will expand/reduce blobs in a binary image
Fill
	Will fill a canvas with a blank colour, based on RGB or HSV input
Noise
	Adds noise to an image, with monochromatic flag
Brickulate
	Will draw a grid pattern over an image, to turn it into bricks/tiles
Brickulate Normal
	Will output a normal map for a brickulated image
Laplace Edge
	Implement edge detection with a faster algorithm
Sobel Edge
	Implement edge detection with another more complex algorithm
Custom kernel
	Allow a custom 3x3 kernel to be used over an image.
Shot Detector
	Will detect scene changes in a video
Emboss
	Embosses an image
Invert
	Inverts an image's colour
Sepia
	Applies a sepia effect to an image
Blur
	Make a proper blur filter, with efficiency options
Glow/Bloom
	Makes an image appear to glow
Pixelate
	Pixelates an image

Other things to work on
=======================
Update Average threshold to take percentage inputs
Make the difference detector work more generally
Implement GUI controls for all filters
Add WebGL function to each filter to improve performance
Add a flag to each filter to only process the image if the input has changed, controls have changed or is forced to.
Create a renderer object that holds a canvas and it's filters for ease of use and improved functionality