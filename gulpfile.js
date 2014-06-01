var gulp = require('gulp');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var connect = require('gulp-connect');

var paths = {
	js : ['./src/*.js', './src/**/*.js']
};

gulp.task('default', ['js', 'connect', 'watch']);
gulp.task('build', ['js']);

gulp.task('js', function(){
	gulp.src(paths.js)
		.pipe(concat('clarity.js'))
		.pipe(gulp.dest('./build/'));

	gulp.src(paths.js)
		.pipe(concat('clarity.min.js'))
		.pipe(uglify())
		.pipe(gulp.dest('./build/'));
});

gulp.task('connect', function () {
  var connect = require('connect');
  var app = connect()
  .use(connect.static('./'))
  .listen(3000);
});

gulp.task('watch', function () {
	gulp.watch(paths.js, ['js']);
});