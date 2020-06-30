const presets = [
  [
    '@babel/env',
    {
      targets: { node: process.versions.node },
      useBuiltIns: 'usage',
      modules: 'cjs',
      corejs: 3,
    },
  ],
];

const plugins = [
  '@babel/plugin-proposal-nullish-coalescing-operator',
  '@babel/plugin-proposal-optional-chaining',
  '@babel/plugin-proposal-class-properties',
  '@babel/plugin-transform-flow-strip-types',
  ['@babel/plugin-proposal-pipeline-operator', { proposal: 'minimal' }],
];

module.exports = {
  presets,
  plugins,
};
