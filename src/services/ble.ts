import Taro from '@tarojs/taro'

export const BLE_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb'
export const BLE_CHAR_WRITE_UUID = '0000fff1-0000-1000-8000-00805f9b34fb'
export const BLE_CHAR_NOTIFY_UUID = '0000fff2-0000-1000-8000-00805f9b34fb'
export const BLE_CHAR_READ_UUID = '0000fff3-0000-1000-8000-00805f9b34fb'

const CONNECT_TIMEOUT_MS = 10000
const MTU_SIZE = 512

export interface BLEDevice {
  deviceId: string
  name: string
  RSSI: number
  advertisData: ArrayBuffer
}

export type BLEConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting'

export interface BLEError {
  code: number
  message: string
}

type BLEEventCallback = (data: any) => void

class BLEService {
  private deviceId: string = ''
  private isConnected: boolean = false
  private listeners: Map<string, BLEEventCallback[]> = new Map()
  private connectTimer: ReturnType<typeof setTimeout> | null = null

  on(event: string, callback: BLEEventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  off(event: string, callback: BLEEventCallback) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(cb => cb(data))
    }
  }

  async openAdapter(): Promise<void> {
    try {
      await Taro.openBluetoothAdapter()
      this.emit('adapterStateChange', { available: true })
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
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

      Taro.onBluetoothDeviceFound((res) => {
        res.devices.forEach(device => {
          if (device.name || device.localName) {
            this.emit('deviceFound', {
              deviceId: device.deviceId,
              name: device.name || device.localName,
              RSSI: device.RSSI,
              advertisData: device.advertisData,
            })
          }
        })
      })
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async stopScan(): Promise<void> {
    try {
      await Taro.stopBluetoothDevicesDiscovery()
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
      this.emit('connectionStateChange', { state: 'connected', deviceId })

      // Listen for connection state changes
      Taro.onBLEConnectionStateChange((res) => {
        this.isConnected = res.connected
        this.emit('connectionStateChange', {
          state: res.connected ? 'connected' : 'disconnected',
          deviceId: res.deviceId,
        })
      })

      // Negotiate MTU for larger payloads
      try {
        await Taro.setBLEMTU({ deviceId, mtu: MTU_SIZE })
      } catch {
        // MTU negotiation optional, continue with default
      }
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

    this.emit('connectionStateChange', { state: 'disconnecting', deviceId: this.deviceId })

    try {
      await Taro.closeBLEConnection({ deviceId: this.deviceId })
      this.isConnected = false
      this.emit('connectionStateChange', { state: 'disconnected', deviceId: this.deviceId })
      this.deviceId = ''
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async getServices(): Promise<any[]> {
    if (!this.deviceId) throw new Error('Device not connected')

    try {
      const res = await Taro.getBLEDeviceServices({ deviceId: this.deviceId })
      return res.services
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async getCharacteristics(serviceId: string): Promise<any[]> {
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

      Taro.onBLECharacteristicValueChange((res) => {
        if (res.characteristicId === BLE_CHAR_NOTIFY_UUID) {
          this.emit('dataReceived', { data: res.value })
        }
      })
    } catch (error: any) {
      this.emit('error', { code: error.errCode, message: error.errMsg })
      throw error
    }
  }

  async read(): Promise<any> {
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

  getDeviceId(): string {
    return this.deviceId
  }

  getConnectionState(): boolean {
    return this.isConnected
  }
}

export const bleService = new BLEService()
export default BLEService