/**
 * BLE 相关类型定义
 *
 * 统一的 BLEDevice 接口，ble.ts 和 store/simple.ts 都从这里导入。
 */

export interface BLEDevice {
  deviceId: string
  name: string
  RSSI: number
  advertisData?: ArrayBuffer
}

export type BLEConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting'

export interface BLEError {
  code: number
  message: string
}
