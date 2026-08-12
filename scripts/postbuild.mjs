import { minify } from 'html-minifier-terser';
import { readFileSync, writeFileSync } from 'fs';

const path = 'dist/Clauditor.html';
const html = readFileSync(path, 'utf8');

const result = await minify(html, {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeEmptyAttributes: true,
  minifyCSS: true,
  // JS is already minified by esbuild — skip to avoid double-processing
  minifyJS: false,
});

writeFileSync(path, result);

const before = (html.length / 1024).toFixed(1);
const after  = (result.length / 1024).toFixed(1);
const saved  = ((html.length - result.length) / html.length * 100).toFixed(1);
console.log(`Minified HTML: ${before} KB → ${after} KB (${saved}% smaller)`);