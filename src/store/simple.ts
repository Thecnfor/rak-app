/**
 * 简单的全局状态管理，替代 MobX（避免微信小程序兼容性问题）
 */

export interface BLEDevice {
  deviceId: string
  name: string
  RSSI: number
}

export interface ConfigResult {
  type: 'config_result'
  status: 'success' | 'failed' | 'idle'
  ip?: string
  message: string
}

type Listener = () => void

class SimpleStore {
  selectedDevice: BLEDevice | null = null
  connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected'
  provisioningState: 'idle' | 'configuring' | 'success' | 'failed' = 'idle'
  configResult: ConfigResult | null = null
  error: string | null = null
  wifiSSID: string = ''
  wifiPassword: string = ''

  private listeners: Listener[] = []

  subscribe(fn: Listener) {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  private notify() {
    this.listeners.forEach(fn => fn())
  }

  setDevice(device: BLEDevice | null) {
    this.selectedDevice = device
    this.notify()
  }

  setConnectionState(state: this['connectionState']) {
    this.connectionState = state
    this.notify()
  }

  setProvisioningState(state: this['provisioningState']) {
    this.provisioningState = state
    this.notify()
  }

  setConfigResult(result: ConfigResult | null) {
    this.configResult = result
    this.notify()
  }

  setError(err: string | null) {
    this.error = err
    this.notify()
  }

  setWiFi(ssid: string, password: string) {
    this.wifiSSID = ssid
    this.wifiPassword = password
  }

  reset() {
    this.selectedDevice = null
    this.connectionState = 'disconnected'
    this.provisioningState = 'idle'
    this.configResult = null
    this.error = null
    this.wifiSSID = ''
    this.wifiPassword = ''
    this.notify()
  }
}

export const store = new SimpleStore()
