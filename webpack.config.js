const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/renderer/index.js',
  target: 'electron-renderer',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'renderer.js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/,
        type: 'asset/resource'
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@components': path.resolve(__dirname, 'src/renderer/components'),
      '@hooks': path.resolve(__dirname, 'src/renderer/hooks'),
      '@utils': path.resolve(__dirname, 'src/renderer/utils'),
      '@styles': path.resolve(__dirname, 'src/renderer/styles')
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html'
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'build')
    },
    port: 3000,
    hot: true,
    open: false
  },
  devtool: 'source-map'
};