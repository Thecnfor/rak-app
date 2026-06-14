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
      chain.optimization.minimize(true);
    },
    // 启用主包优化
    optimizeMainPackage: {
      enable: true,
    },
    // 代码分割配置
    splitChunks: {
      enable: true,
      config: {
        // 将 node_modules 中的模块单独打包
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'initial', // 微信小程序不支持 async chunk，使用 initial
          priority: 10,
        },
        // 公共模块提取
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'initial',
          priority: 5,
        },
      },
    },
    // ESBuild 配置（用于快速压缩）
    esbuild: {
      enable: true,
      config: {
        minify: true,
        minifyWhitespace: true,
        minifyIdentifiers: true,
        minifySyntax: true,
        drop: ['console', 'debugger'],
      },
    },
    // terser 已移除 — esbuild 已覆盖压缩需求
  },
  h5: {},
} satisfies UserConfigExport<'webpack5'>
