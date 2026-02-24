import type { UserConfigExport } from "@tarojs/cli";

export default {
  mini: {
    // 启用组件按需注入
    componentPlugin: {
      enable: true,
    },
    // 配置组件按需加载
    lazyCodeLoading: 'requiredComponents',
    // 启用 Webpack 优化
    webpackChain(chain) {
      // 启用代码压缩
      chain.optimization.minimize(true);
    },
    // Taro 内置优化配置
    optimizeMainPackage: {
      // 启用主包优化
      enable: true,
    },
    // 代码分割配置
    splitChunks: {
      // 启用代码分割
      enable: true,
      // 配置分割策略
      config: {
        // 将 node_modules 中的模块单独打包
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10,
        },
        // 公共模块提取
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          priority: 5,
        },
      },
    },
    // ESBuild 配置（用于快速压缩）
    esbuild: {
      enable: true,
      config: {
        // 压缩配置
        minify: true,
        minifyWhitespace: true,
        minifyIdentifiers: true,
        minifySyntax: true,
        // 移除 console 和 debugger
        drop: ['console', 'debugger'],
      },
    },
    // Terser 配置（备用压缩方案）
    terser: {
      enable: true,
      config: {
        // 压缩配置
        compress: {
          // 移除 console
          drop_console: true,
          // 移除 debugger
          drop_debugger: true,
          // 移除无用代码
          dead_code: true,
          // 优化重复代码
          reduce_vars: true,
        },
        // 启用变量名混淆
        mangle: true,
      },
    },
  },
  h5: {
    /**
     * WebpackChain 插件配置
     * @docs https://github.com/neutrinojs/webpack-chain
     */
    // webpackChain (chain) {
    //   /**
    //    * 如果 h5 端编译后体积过大，可以使用 webpack-bundle-analyzer 插件对打包体积进行分析。
    //    * @docs https://github.com/webpack-contrib/webpack-bundle-analyzer
    //    */
    //   chain.plugin('analyzer')
    //     .use(require('webpack-bundle-analyzer').BundleAnalyzerPlugin, [])
    //   /**
    //    * 如果 h5 端首屏加载时间过长，可以使用 prerender-spa-plugin 插件预加载首页。
    //    * @docs https://github.com/chrisvfritz/prerender-spa-plugin
    //    */
    //   const path = require('path')
    //   const Prerender = require('prerender-spa-plugin')
    //   const staticDir = path.join(__dirname, '..', 'dist')
    //   chain
    //     .plugin('prerender')
    //     .use(new Prerender({
    //       staticDir,
    //       routes: [ '/pages/index/index' ],
    //       postProcess: (context) => ({ ...context, outputPath: path.join(staticDir, 'index.html') })
    //     }))
    // }
  }
} satisfies UserConfigExport<'webpack5'>
