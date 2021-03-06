Clarity
=======

Canvas image filter library

Current Filters
===============

### Dual Input
#### Add/Subtract
Adds/Subtracts images from each other
#### Blend
Blends two images together, with optional weighting
#### Mask
Simple implementation of multiply, where white is shown and black is not
#### Multiply
Multiplies an image with a greyscale

### Height Map
#### Contourer
Shows the contours in a height map
####Normal Flip
Will flip the x/y axis values, or swap the x/y axis with each other
#### Normal Generator
Generates a normal based on a height map
#### Normal Intensity
Edits the intensity of a normal map

### Misc
####Brickulate
Will draw a grid pattern over an image, to turn it into bricks/tiles
#### Difference Detector
Will detect differences in a scene, based on the first shot (not working)
#### Ghoster
Adds a ghosting/onion skin effect to a video
#### Puzzler
Scrambles up the image like a puzzle

### Process
#### Bleed
Adds a small colour bleed effect to an image
#### Blur
Blurs an image
#### De-saturate
Removes colour from an image
#### Dot Remover
Cleans up outlying pixels in a binary image
#### Glow
Blurs an image, and then adds this to the original, to create a glowing effect
#### Hanover Bars
Applies Hanover Bars or Scan lines over an image
#### HSV Shifter
Allows editing an images hue/saturation/lightness values
####Invert
Inverts an image's colour
#### Noise
Adds variable noise to an image, can be monochromatic
#### Pixelate
Pixelates the image to a fixed size per pixel
#### Posterise
Reduces an image into a fixed number of colours
#### Sharpen
Applies a sharpening mask to an image, to enhance edges/detail
#### Smoother
Simple neighbouring blur function

### Salience
#### Edge Detector
Detects the edges in a scene
#### Motion Detector
Detects any motion between a series of frames
#### Skin Detection
Detects skin in a scene. Relies on correct lighting.

### Starters
#### Cloud
A filter that fills the canvas with Perlin Noise, with an RGB input for colour
#### FillHSV
Will fill a canvas with a blank colour, based on HSV input
#### FillRGB
Will fill a canvas with a blank colour, based on RGB input

### Thresholders
#### Gradient Thresholder
Thresholds over changes in gradient in an image, resulting in edge detection
#### Median Thresholder
Colour quantisation over median and quartile pixel values
#### Value Thresholder
Thresholds the image based on a calculated or given pixel value

### Transform
#### Channel Separate
Translates the RGB channels of an image individually
#### Mirror
Flips the image in horizontal or vertical axis
#### Rotator
Rotates an image in 90 degree increments. Will crop a rectangular image to be square
#### Tiler
Will tile an image so it's edges all line up
#### Translator
Will move an image in horizontal or vertical axis based on a percentage
#### Wave
Translates the pixels of an image according to a mathematical function


Filters to be made
==================
####Skeletiser
Will draw the skeleton of the image
####Histogram
Will output a visual histogram of an image, or just the histogram values
####Bloat/Erode
Will expand/reduce blobs in a binary image
####Crackulate
Will draw procedural cracks over a texture
####Laplace Edge
Implement edge detection with a faster algorithm
####Sobel Edge
Implement edge detection with another more complex algorithm
####Custom kernel
Allow a custom 3x3 kernel to be used over an image.
####Shot Detector
Will detect scene changes in a video
####Emboss
Embosses an image
####Sepia
Applies a sepia effect to an image
####Target finder
Highlights a particular point of interest in an image
####Screen burn
Adds screen burn effect to a video, similar to ghosting
####Dot crawl
Adds a dot crawl effect

Other things to work on
=======================
	Make the difference detector work more generally
	Add WebGL function to each filter to improve performance
	Add a flag to each filter to only process the image if the input has changed, controls have changed or is forced to.
	Create a renderer object that holds a canvas and it's filters for ease of use and improved functionality
	Look into HSV for skin detection