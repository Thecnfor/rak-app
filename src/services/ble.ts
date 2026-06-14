import Taro from '@tarojs/taro'
import type { BLEDevice, BLEConnectionState, BLEError } from '../types/ble'

export { BLEDevice, BLEConnectionState, BLEError }

export const BLE_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb'
export const BLE_CHAR_WRITE_UUID = '0000fff1-0000-1000-8000-00805f9b34fb'
export const BLE_CHAR_NOTIFY_UUID = '0000fff2-0000-1000-8000-00805f9b34fb'
export const BLE_CHAR_READ_UUID = '0000fff3-0000-1000-8000-00805f9b34fb'

const CONNECT_TIMEOUT_MS = 10000
const MTU_SIZE = 512
const RECONNECT_DELAY_MS = 2000
const MAX_RECONNECT_ATTEMPTS = 3

// ─── 事件类型定义 ─────────────────────────────────────────

interface BLEAdapterStateEvent { available: boolean }
interface BLEScanStateEvent { scanning: boolean }
interface BLEDeviceFoundEvent { deviceId: string; name: string; RSSI: number; advertisData: ArrayBuffer }
interface BLEConnectionStateEvent { state: BLEConnectionState; deviceId: string }
interface BLEDataEvent { data: ArrayBuffer }
interface BLEErrorEvent { code: number; message: string }

type BLEEventMap = {
  adapterStateChange: BLEAdapterStateEvent
  scanStateChange: BLEScanStateEvent
  deviceFound: BLEDeviceFoundEvent
  connectionStateChange: BLEConnectionStateEvent
  dataSent: BLEDataEvent
  dataReceived: BLEDataEvent
  error: BLEErrorEvent
}

type BLEEventCallback<T = unknown> = (data: T) => void

// ─── Service ──────────────────────────────────────────────

class BLEService {
  private deviceId: string = ''
  private isConnected: boolean = false
  private listeners: Map<string, BLEEventCallback[]> = new Map()
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts: number = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect: boolean = false

  // Taro 全局监听器引用（用于清理）
  private onDeviceFoundCallback: ((res: any) => void) | null = null
  private onConnectionStateChangeCallback: ((res: any) => void) | null = null
  private onCharacteristicValueChangeCallback: ((res: any) => void) | null = null

  on<K extends keyof BLEEventMap>(event: K, callback: BLEEventCallback<BLEEventMap[K]>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback as BLEEventCallback)
  }

  off<K extends keyof BLEEventMap>(event: K, callback: BLEEventCallback<BLEEventMap[K]>) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback as BLEEventCallback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  private emit<K extends keyof BLEEventMap>(event: K, data: BLEEventMap[K]) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(cb => cb(data))
    }
  }

  /** 检查并请求蓝牙权限 */
  async checkPermission(): Promise<boolean> {
    try {
      const setting = await Taro.getSetting()
      if (setting.authSetting['scope.bluetooth'] === false) {
        // 用户之前拒绝过，引导打开设置
        await Taro.showModal({
          title: '需要蓝牙权限',
          content: '请在设置中开启蓝牙权限，用于搜索和连接设备',
          confirmText: '去设置',
        })
        await Taro.openSetting()
        return false
      }
      return true
    } catch {
      // getSetting 不支持时直接返回 true
      return true
    }
  }

  async openAdapter(): Promise<void> {
    try {
      // 检查蓝牙权限
      const hasPermission = await this.checkPermission()
      if (!hasPermission) {
        throw new Error('蓝牙权限未授权')
      }

      await Taro.openBluetoothAdapter()
      this.emit('adapterStateChange', { available: true })
    } catch (error: any) {
      const message = error.errMsg || error.message || '蓝牙适配器打开失败'
      this.emit('error', { code: error.errCode ?? -1, message })
      throw error
    }
  }

  async closeAdapter(): Promise<void> {
    try {
      await Taro.closeBluetoothAdapter()
      this.emit('adapterStateChange', { available: false })
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async startScan(): Promise<void> {
    try {
      await Taro.startBluetoothDevicesDiscovery({
        services: [BLE_SERVICE_UUID],
        allowDuplicatesKey: false,
      })
      this.emit('scanStateChange', { scanning: true })

      // 保存回调引用，stopScan 时可清理
      this.onDeviceFoundCallback = (res: any) => {
        res.devices.forEach((device: any) => {
          if (device.name || device.localName) {
            this.emit('deviceFound', {
              deviceId: device.deviceId,
              name: device.name || device.localName,
              RSSI: device.RSSI,
              advertisData: device.advertisData,
            })
          }
        })
      }
      Taro.onBluetoothDeviceFound(this.onDeviceFoundCallback)
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async stopScan(): Promise<void> {
    try {
      await Taro.stopBluetoothDevicesDiscovery()
      // 清理全局监听器
      if (this.onDeviceFoundCallback) {
        Taro.offBluetoothDeviceFound(this.onDeviceFoundCallback)
        this.onDeviceFoundCallback = null
      }
      this.emit('scanStateChange', { scanning: false })
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async connect(deviceId: string): Promise<void> {
    this.deviceId = deviceId
    this.emit('connectionStateChange', { state: 'connecting', deviceId })

    // Connection timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      this.connectTimer = setTimeout(() => {
        reject({ code: -1, message: '连接超时' })
      }, CONNECT_TIMEOUT_MS)
    })

    try {
      await Promise.race([
        Taro.createBLEConnection({ deviceId }),
        timeoutPromise,
      ])

      if (this.connectTimer) {
        clearTimeout(this.connectTimer)
        this.connectTimer = null
      }

      this.isConnected = true
      this.shouldReconnect = true
      this.reconnectAttempts = 0
      this.emit('connectionStateChange', { state: 'connected', deviceId })

      // 保存回调引用，disconnect 时可清理
      this.onConnectionStateChangeCallback = (res: any) => {
        this.isConnected = res.connected
        this.emit('connectionStateChange', {
          state: res.connected ? 'connected' : 'disconnected',
          deviceId: res.deviceId,
        })

        // Auto-reconnect on unexpected disconnect
        if (!res.connected && this.shouldReconnect && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts++
          this.emit('error', {
            code: 0,
            message: `连接断开，正在重试 (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
          })
          this.reconnectTimer = setTimeout(() => {
            this.connect(res.deviceId).catch(() => {
              // Reconnect failed, will retry if attempts remain
            })
          }, RECONNECT_DELAY_MS)
        } else if (!res.connected) {
          this.shouldReconnect = false
          this.reconnectAttempts = 0
        }
      }
      Taro.onBLEConnectionStateChange(this.onConnectionStateChangeCallback)

      // Negotiate MTU for larger payloads
      try {
        await Taro.setBLEMTU({ deviceId, mtu: MTU_SIZE })
      } catch {
        // MTU negotiation optional, continue with default
      }

      // 等待固件注册 GATT 服务（固件需要时间完成服务注册）
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error: any) {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer)
        this.connectTimer = null
      }
      this.emit('connectionStateChange', { state: 'disconnected', deviceId })
      this.emit('error', { code: error.errCode ?? -1, message: error.errMsg ?? error.message })
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (!this.deviceId) return

    this.shouldReconnect = false
    this.reconnectAttempts = 0
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.emit('connectionStateChange', { state: 'disconnecting', deviceId: this.deviceId })

    try {
      await Taro.closeBLEConnection({ deviceId: this.deviceId })
      this.isConnected = false

      // 清理全局监听器
      if (this.onConnectionStateChangeCallback) {
        Taro.offBLEConnectionStateChange(this.onConnectionStateChangeCallback)
        this.onConnectionStateChangeCallback = null
      }
      if (this.onCharacteristicValueChangeCallback) {
        Taro.offBLECharacteristicValueChange(this.onCharacteristicValueChangeCallback)
        this.onCharacteristicValueChangeCallback = null
      }

      this.emit('connectionStateChange', { state: 'disconnected', deviceId: this.deviceId })
      this.deviceId = ''
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async getServices(): Promise<Taro.getBLEDeviceServices.BLEService[]> {
    if (!this.deviceId) throw new Error('Device not connected')

    try {
      const res = await Taro.getBLEDeviceServices({ deviceId: this.deviceId })
      return res.services
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async getCharacteristics(serviceId: string): Promise<Taro.getBLEDeviceCharacteristics.BLECharacteristic[]> {
    if (!this.deviceId) throw new Error('Device not connected')

    try {
      const res = await Taro.getBLEDeviceCharacteristics({
        deviceId: this.deviceId,
        serviceId,
      })
      return res.characteristics
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async write(data: ArrayBuffer): Promise<void> {
    if (!this.deviceId) throw new Error('Device not connected')

    try {
      await Taro.writeBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: BLE_SERVICE_UUID,
        characteristicId: BLE_CHAR_WRITE_UUID,
        value: data,
      })
      this.emit('dataSent', { data })
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async enableNotify(): Promise<void> {
    if (!this.deviceId) throw new Error('Device not connected')

    try {
      await Taro.notifyBLECharacteristicValueChange({
        deviceId: this.deviceId,
        serviceId: BLE_SERVICE_UUID,
        characteristicId: BLE_CHAR_NOTIFY_UUID,
        state: true,
      })

      // 保存回调引用，disconnect 时可清理
      this.onCharacteristicValueChangeCallback = (res: any) => {
        if (res.characteristicId === BLE_CHAR_NOTIFY_UUID) {
          this.emit('dataReceived', { data: res.value })
        }
      }
      Taro.onBLECharacteristicValueChange(this.onCharacteristicValueChangeCallback)
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async read(): Promise<Taro.readBLECharacteristicValue.SuccessCallbackResult> {
    if (!this.deviceId) throw new Error('Device not connected')

    try {
      const res = await Taro.readBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: BLE_SERVICE_UUID,
        characteristicId: BLE_CHAR_READ_UUID,
      })
      return res
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  /** 读取设备配网状态（fff2 特征值） */
  async readStatus(): Promise<{ status: string; message: string; ip?: string }> {
    if (!this.deviceId) throw new Error('Device not connected')

    try {
      const res = await Taro.readBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: BLE_SERVICE_UUID,
        characteristicId: BLE_CHAR_NOTIFY_UUID,
      })
      // 解析 ArrayBuffer 为 JSON
      const decoder = new TextDecoder()
      const text = decoder.decode(new Uint8Array(res.value))
      return JSON.parse(text)
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  getDeviceId(): string {
    return this.deviceId
  }

  getConnectionState(): boolean {
    return this.isConnected
  }
}

export const bleService = new BLEService()
export default BLEService
