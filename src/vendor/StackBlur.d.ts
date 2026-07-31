/**
 * Type declarations for the vendored StackBlur (MIT, Mario Klingemann).
 * https://www.quasimondo.com/StackBlurForCanvas
 */

export interface StackBlurProcessInstance {
	stackBlurCanvasRGBA(frame: ImageData, radius: number): ImageData;
	stackBlurCanvasRGB(frame: ImageData, radius: number): ImageData;
	stackBlurCanvasSingle(frame: ImageData, radius: number, channel?: number): ImageData;
}

export declare function StackBlurProcess(this: StackBlurProcessInstance): void;
