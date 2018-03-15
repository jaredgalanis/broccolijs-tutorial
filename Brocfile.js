// Plugins
const Funnel = require('broccoli-funnel');
const Merge = require('broccoli-merge-trees');
const CompileSass = require('broccoli-sass-source-maps');
const Rollup = require('broccoli-rollup');
const LiveReload = require('broccoli-livereload');
const CleanCss = require('broccoli-clean-css');
const AssetRev = require('broccoli-asset-rev');
const GlimmerBundleCompiler = require('@glimmer/app-compiler').GlimmerBundleCompiler;
const UnwatchedDir = require("broccoli-source").UnwatchedDir;
const ResolverConfigurationBuilder = require('@glimmer/resolver-configuration-builder');
const utils = require('ember-build-utilities');
const GlimmerTemplatePrecompiler = utils.GlimmerTemplatePrecompiler;

// Rollup plugins
const babel = require('rollup-plugin-babel');
const nodeResolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
const uglify = require('rollup-plugin-uglify');

// Environment and config
const env = require('broccoli-env').getEnv() || 'development';
const package = require('./package.json');
const isProduction = env === 'production';

// Status
console.log('Environment: ' + env);

const appRoot = 'src';
const configRoot = 'config';

// Copy HTML file from app root to destination
const html = new Funnel(appRoot, {
  srcDir: 'ui',
  files: ['index.html'],
  destDir: '/',
});

const configTree = new Funnel(configRoot, {
  files: ['config.js'],
});

const hbsTree = new Funnel(appRoot, {
  include: ['**/*.hbs'],
  destDir: appRoot
});

const jsTree = new Funnel(appRoot, {
  include: ['**/*.js'],
  destDir: appRoot
});

// Template compiler needs access to root package.json
let pkgJsonTree = new UnwatchedDir('./');
pkgJsonTree = new Funnel(pkgJsonTree, {
  include: ['package.json']
});

// Get templates and package.json
let templateTree = new Merge([hbsTree, pkgJsonTree]);

// The bundle compiler generates the compiled templates.gbx binary template and data-segment for the runtime
let compiledTree = new GlimmerBundleCompiler(templateTree, {
  mode: 'module-unification',
  outputFiles: {
    heapFile: 'templates.gbx',
    dataSegment: 'data-segment.js'
  }
});

// Filter the templates
const templatesTree = new Funnel(compiledTree, {
  files: ['templates.gbx'],
});

// Filter the data segment
const dataSegmentTree = new Funnel(compiledTree, {
  files: ['data-segment.js'],
});

// I don't know what this does...
const defaultModuleConfiguration = require('./defaultModuleConfig');

// ResolverConfiguration used by glimmer DI, written to /config during build
const resolverConfiguration = new ResolverConfigurationBuilder(configTree, {
  configPath: 'test',
  defaultModulePrefix: package.name,
  defaultModuleConfiguration: defaultModuleConfiguration
});

let js = new Merge([jsTree, dataSegmentTree, resolverConfiguration], { overwrite: true });

// Compile JS through rollup
const rollupPlugins = [
  nodeResolve({
    jsnext: true,
    browser: true,
  }),
  commonjs({
    include: 'node_modules/**',
  }),
  babel({
    exclude: 'node_modules/**',
  }),
];

// Uglify the output for production
if (isProduction) {
  rollupPlugins.push(uglify());
}

// Build rollup config
js = new Rollup(js, {
  inputFiles: ['**/*.js'],
  rollup: {
    input: 'src/index.js',
    output: {
      file: 'assets/app.js',
      format: 'es',
      sourcemap: !isProduction,
    },
    plugins: rollupPlugins,
  }
});

// Copy CSS file into assets
let css = new CompileSass(
  [appRoot],
  'styles/app.scss',
  'assets/app.css',
  {
    sourceMap: !isProduction,
    sourceMapContents: true,
  }
);

// Compress our CSS
if (isProduction) {
  css = new CleanCss(css);
}

// Copy public files into destination
const public = new Funnel('public', {
  destDir: "/"
});

// Remove the existing module.exports and replace with:
let tree = new Merge([html, js, css, templatesTree]);

// Include asset hashes
if (isProduction) {
  tree = new AssetRev(tree);
} else {
  tree = new LiveReload(tree, {
    target: 'index.html',
  });
}

module.exports = tree;
