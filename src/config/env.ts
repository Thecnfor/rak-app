/**
 * 环境配置
 *
 * go-kernel 后端地址。修改此处即可切换开发/生产环境。
 * 微信小程序要求正式域名必须 HTTPS 且已备案，开发阶段可在「详情 → 本地设置」中勾选「不校验合法域名」。
 */

// 开发环境（Hak 服务器）
const DEV_KERNEL_HTTP = 'http://116.205.183.125:8080'
const DEV_KERNEL_WS = 'ws://116.205.183.125:8080/ws'

// 生产环境（正式域名）
const PROD_KERNEL_HTTP = 'https://open.xrak.xyz'
const PROD_KERNEL_WS = 'wss://open.xrak.xyz/ws'

const isDev = process.env.NODE_ENV === 'development'

/** go-kernel HTTP API 基地址 */
export const KERNEL_BASE = isDev ? DEV_KERNEL_HTTP : PROD_KERNEL_HTTP

/** go-kernel WebSocket 地址 */
export const WS_URL = isDev ? DEV_KERNEL_WS : PROD_KERNEL_WS
