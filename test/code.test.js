// The playground's code panel, minus the browser.
//
// Most of that panel can only be tested by driving the page - see site.test.js.
// These two are pure text handling, and pure text handling deserves a test that
// says what it does rather than one that clicks a button and looks at a
// screenshot afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';

import { declarationPoint, variableName } from '../site/src/code.js';

/** The insert point, shown as the text with a marker where it lands. */
const mark = (text) => {
	const at = declarationPoint(text);
	return `${text.slice(0, at)}<|>${text.slice(at)}`;
};

test('a declaration goes above code that has no preamble', () => {
	assert.equal(mark('return new Pipeline();'), '<|>return new Pipeline();');
});

test('a declaration goes under the comment block that opens a snippet', () => {
	// Every shipped snippet starts with a paragraph explaining itself, so "the
	// top of the file" and "the top of the code" are different places.
	const text = ['// what this does', '// and why', '', 'return new Pipeline();'].join('\n');
	assert.equal(
		mark(text),
		['// what this does', '// and why', '', '<|>return new Pipeline();'].join('\n')
	);
});

test('a comment below the code is not a preamble', () => {
	// The first line that is neither a comment nor blank ends it. A comment
	// further down explains what is beneath it, and inserting above that would
	// attach the explanation to the wrong thing.
	const text = ['const a = 1;', '', '// about the next bit', 'const b = 2;'].join('\n');
	assert.equal(mark(text), `<|>${text}`);
});

test('leading blank lines are skipped', () => {
	assert.equal(mark('\n\nreturn 1;'), '\n\n<|>return 1;');
});

test('an empty buffer inserts at the start', () => {
	// The offset arithmetic runs off the end here if it is not clamped - there is
	// no newline after the last line, because there is no last line.
	assert.equal(declarationPoint(''), 0);
	assert.equal(declarationPoint('\n'), 1);
});

test('a file that is only comments inserts after them', () => {
	const text = '// nothing here yet\n';
	assert.equal(declarationPoint(text), text.length);
});

test('the insert point is always inside the text', () => {
	// Whatever it decides, `setSelectionRange` has to be able to use it.
	for (const text of ['', '\n', '//', '//\n', '\n\n\n', 'x', '// a\n// b', '// a\n\n']) {
		const at = declarationPoint(text);
		assert.ok(
			at >= 0 && at <= text.length,
			`${JSON.stringify(text)} gave ${at}, outside 0..${text.length}`
		);
	}
});

test('a source id becomes a usable variable name', () => {
	assert.equal(variableName('landscape'), 'landscape');
	assert.equal(variableName('custom1'), 'custom1');
	//a dropped file's id is generated, but the samples' ids are not, and one with
	//a hyphen or a leading digit would be a syntax error rather than a variable
	assert.equal(variableName('face-2'), 'face2');
	assert.equal(variableName('1x'), '_1x');
});
