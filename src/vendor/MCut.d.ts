/**
 * Type declarations for the vendored median-cut.js (GPL-3.0).
 *
 * Bundling this is what forces the whole package to GPL - see FEATURES.md #7,
 * which replaces it with a from-scratch quantiser so Clarity can go permissive.
 */

export interface MCutInstance {
	init(data: number[][]): void;
	get_fixed_size_palette(size: number): [number, number, number][];
	get_dynamic_size_palette(threshold: number): [number, number, number][];
	get_boxes(): unknown[];
}

/** Constructor whose instance exposes the quantiser on `.MCut`. */
export declare function MCut(this: { MCut: MCutInstance }): void;
