//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const pkg = require('./package.json');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  plugins: [
    new webpack.DefinePlugin({
      __ONAIR_VERSION__: JSON.stringify(pkg.version || '')
    })
  ],
  externals: {
    vscode: 'commonjs vscode',
    // ws's two optional native acceleration deps - not installing them doesn't break anything,
    // they're excluded here purely to silence webpack's "module not found" warnings
    bufferutil: 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        test: /\.(html|css)$/,
        type: 'asset/source'
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
};
module.exports = [ extensionConfig ];
