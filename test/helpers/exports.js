import * as CLARITY from '../../dist/clarity.js';

/**
 * Names of every exported filter.
 *
 * Derived from the prototype chain rather than a denylist of non-filter
 * exports. A denylist has to be updated every time a helper is exported, and
 * silently misclassifies it as a filter until someone notices the test failure
 * - which happened three times while building this suite.
 */
export function filterNames() {
	return Object.keys(CLARITY).filter((name) => {
		const value = CLARITY[name];
		return (
			typeof value === 'function' &&
			value !== CLARITY.Filter &&
			value.prototype instanceof CLARITY.Filter
		);
	});
}

export { CLARITY };
