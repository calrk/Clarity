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
		// .pipe(concat)
		.pipe(concat('clarity.min.js'))
		.pipe(uglify())
		.pipe(gulp.dest('./build/'));
});

/*gulp.task('connect', function() {
  connect.server({
    root: ['.'],
    port: 3000
  });
});*/

gulp.task('connect', function () {
  var connect = require('connect');
  var http = require('http');

  var app = connect()
  .use(connect.static('./'));

  var port = 3000;
  http.createServer(app).listen(port, function () {
    // gutil.log('Development web server started on port', gutil.colors.cyan(port));
  });
});

gulp.task('watch', function () {
	gulp.watch(paths.js, ['js']);
});