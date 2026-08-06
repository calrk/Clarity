/**
 * Declarative descriptions of a filter's tweakable properties.
 *
 * Each filter carries a `static schema` saying what its properties are, what
 * they mean and what values are legal. The library ships **no rendering code**
 * for them - that is the host app's job, and a host app can render them however
 * it likes.
 *
 * The reason this metadata belongs in the library rather than in the UI is that
 * only the filter knows it. That `radius` is an integer from 1 to 180, that
 * `hue` wraps at 360, that `ratio` is a float from 0 to 1 - that is the
 * filter's contract, not a styling decision. Push it into the app and every
 * consumer has to rediscover it, and they will disagree.
 *
 * The same metadata is what drives GPU uniform binding (FEATURES.md #3),
 * generated options docs (#11), property-based fuzzing (#6) and pipeline
 * serialisation (#5).
 */

/** Anything a property can hold. */
export type PropertyValue = number | boolean | string | null;

interface FieldBase {
	/** Human-readable name for a control. */
	label: string;
	/** One line on what the property does, for a tooltip or generated docs. */
	description?: string;
}

/**
 * A numeric property. `int` and `float` are separated because the difference
 * matters downstream - it decides `uniform1i` against `uniform1f` in #3, and it
 * decides whether a value arriving as a string from a DOM input or a URL is
 * rounded on the way in.
 */
export interface NumberField extends FieldBase {
	type: 'int' | 'float';
	min: number;
	max: number;
	step: number;
	/** May be `null` only when `nullable` is set. */
	default: number | null;
	/**
	 * Whether `null` is a legal value. A few filters use it for "work this out
	 * from the frame" - ValueThreshold's auto threshold, for instance.
	 */
	nullable?: boolean;
	/** What `null` should be called in a UI. Only meaningful with `nullable`. */
	nullLabel?: string;
}

export interface BoolField extends FieldBase {
	type: 'bool';
	default: boolean;
}

export interface SelectOption {
	value: string;
	label: string;
}

export interface SelectField extends FieldBase {
	type: 'select';
	options: readonly SelectOption[];
	default: string;
}

/**
 * A colour, held as six lower-case hex digits with no leading `#`.
 *
 * Hex rather than a CSS colour string, and that is a format decision rather
 * than a taste one: the chain format separates properties with `,` (see
 * `PROPERTY_SEPARATOR` in `chain.ts`), so `colour=rgb(255, 0, 0)` would parse
 * as three properties and quietly lose two of them. Hex is comma-free, survives
 * `formatChain` unchanged, and is exactly what `<input type="color">` speaks, so
 * a host app gets a real colour picker for nothing.
 *
 * A filter is free to accept other spellings in its *constructor* - `Fill` takes
 * `rgb` and `hsv` triplets - because options are not properties. Only what the
 * filter carries has to be one thing.
 */
export interface ColourField extends FieldBase {
	type: 'colour';
	/** Six hex digits, no `#`. */
	default: string;
}

export type SchemaField = NumberField | BoolField | SelectField | ColourField;

/** Keyed by property name, matching the filter's `properties`. */
export type FilterSchema = Readonly<Record<string, SchemaField>>;

/**
 * Which channel a filter reads. Shared, because it is declared on the base
 * class rather than by each filter, so the filters that honour it should all
 * describe it identically.
 */
export const CHANNEL_FIELD: SelectField = {
	type: 'select',
	label: 'Channel',
	description: 'Which channel to read. Grey is Rec. 601 luma of all three.',
	default: 'grey',
	options: [
		{ value: 'grey', label: 'Grey' },
		{ value: 'red', label: 'Red' },
		{ value: 'green', label: 'Green' },
		{ value: 'blue', label: 'Blue' }
	]
};

/** Three or six hex digits, with or without the `#` a colour input sends. */
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Anything hex-shaped to six lower-case digits, or the field's default.
 *
 * Shorthand is expanded here rather than downstream so that everything past
 * this point - the shader encoder, the chain string, a comparison between two
 * filters - only ever sees one length and one case. `#F84` and `ff8844` are the
 * same colour and should not be two different property values.
 */
export function normaliseHex(value: unknown, fallback: string): string {
	const match = HEX.exec(String(value).trim());
	if (!match) {
		return fallback;
	}
	const digits = match[1].toLowerCase();
	return digits.length === 3 ? digits.replace(/./g, (digit) => digit + digit) : digits;
}

function toBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') {
		return value;
	}
	//A checkbox hands over a boolean, but a URL parameter or a data attribute
	//hands over a string - and every non-empty string is truthy, including
	//"false". Restoring a serialised pipeline would otherwise turn every
	//disabled toggle back on.
	if (typeof value === 'string') {
		return value !== '' && value !== 'false' && value !== '0';
	}
	return Boolean(value);
}

/**
 * Brings a value in from the outside world - a DOM input, a URL fragment, a
 * saved preset - and makes it legal for the field.
 *
 * Coercion is deliberately forgiving rather than throwing: the inputs are
 * user-typed or come from a link that might have been made by an older version
 * of the library, and clamping to the declared range beats failing the render.
 * An out-of-range or unparseable value falls back to the field's default.
 */
export function coerceValue(field: SchemaField, value: unknown): PropertyValue {
	if (field.type === 'bool') {
		return toBoolean(value);
	}

	if (field.type === 'colour') {
		return normaliseHex(value, field.default);
	}

	if (field.type === 'select') {
		const candidate = String(value);
		return field.options.some((option) => option.value === candidate)
			? candidate
			: field.default;
	}

	if (field.nullable && (value === null || value === undefined || value === '')) {
		return null;
	}

	const parsed = typeof value === 'number' ? value : parseFloat(String(value));
	if (!Number.isFinite(parsed)) {
		return field.nullable ? null : field.default;
	}

	const rounded = field.type === 'int' ? Math.round(parsed) : parsed;
	return Math.min(field.max, Math.max(field.min, rounded));
}

/** The values a filter's properties start at, for building a fresh options bag. */
export function defaultsOf(schema: FilterSchema): Record<string, PropertyValue> {
	const out: Record<string, PropertyValue> = {};
	for (const [key, field] of Object.entries(schema)) {
		out[key] = field.default;
	}
	return out;
}
