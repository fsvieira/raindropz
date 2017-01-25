var gulp = require('gulp');
var browserify = require('gulp-browserify');
var cleanCSS = require('gulp-clean-css');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var path = require('path');
var htmlmin = require('gulp-htmlmin');
var babel = require("gulp-babel");

var BUILD_DEST = './www';

gulp.task('browserify', function () {
  return gulp.src('src/js/main.js')
    .pipe(browserify())
    .pipe(babel())
    .pipe(gulp.dest(path.join(BUILD_DEST, 'js')));
});

gulp.task('resources-css', function () {
  return gulp.src([
    'node_modules/typicons.font/src/font/*.{eot,svg,ttf,woff}'
  ])
  .pipe(gulp.dest(path.join(BUILD_DEST, 'css')));
});


gulp.task('minify-css', ['resources-css'], function() {
  return gulp.src([
		'src/css/**/*.css',
		'node_modules/typicons.font/src/font/typicons.css'
	])
    .pipe(concat('bundle.css'))
    .pipe(cleanCSS())
    .pipe(gulp.dest(path.join(BUILD_DEST, 'css')));
});

gulp.task('minify-html', function() {
  return gulp.src('src/**/*.html')
    .pipe(htmlmin({collapseWhitespace: true}))
    .pipe(gulp.dest(BUILD_DEST));
});

gulp.task('dist', ['build'], function () {
  return gulp.src('src/js/main.js')
    .pipe(browserify())
    .pipe(babel())
    .pipe(uglify())
    .pipe(gulp.dest(path.join(BUILD_DEST, 'js')));
});

gulp.task('build', ['minify-html', 'minify-css', 'browserify'], function () {
  return gulp.src([
    'src/**/*',
    '!src/**/*.{css,js,html}'
  ])
  .pipe(gulp.dest(BUILD_DEST));
});

gulp.task('watch', ['build'], function () {
  return gulp.watch([
    'src/**/*'
  ], ['build'], function () {
    console.log("BUILD");
  });
});
