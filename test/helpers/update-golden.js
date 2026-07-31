// Regenerates the golden images.
//
// Can't be done as `node --test golden.test.js -- --update`: node's test runner
// spawns each file as a child process and does not forward trailing arguments,
// so process.argv inside the test is just [node, testfile] and the flag is
// silently dropped. Setting the environment variable and importing the suite
// directly avoids that, and works the same on Windows and POSIX (an inline
// `VAR=1 cmd` prefix does not).
process.env.UPDATE_GOLDEN = '1';

console.log('Regenerating goldens in test/golden/ ...\n');
await import('../golden.test.js');
console.log('\nDone. Review the diff before committing - a golden that changed');
console.log('unexpectedly is a regression, not something to accept.');
