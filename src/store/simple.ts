import { observable, action } from 'mobx'

export interface BLEDevice {
  name: string
  deviceId: string
  RSSI?: number
}

class SimpleStore {
  @observable selectedDevice: BLEDevice | null = null
  @observable wifiSSID: string = ''
  @observable wifiPassword: string = ''
  @observable connectionState: string = 'disconnected'
  @observable provisioningState: string = 'idle'
  @observable configResult: { status: string; ip?: string; message?: string } | null = null
  @observable error: string | null = null

  @action setDevice(device: BLEDevice) {
    this.selectedDevice = device
  }

  @action setConnectionState(state: string) {
    this.connectionState = state
  }

  @action setWiFi(ssid: string, password: string) {
    this.wifiSSID = ssid
    this.wifiPassword = password
  }

  @action setProvisioningState(state: string) {
    this.provisioningState = state
  }

  @action setConfigResult(result: { status: string; ip?: string; message?: string } | null) {
    this.configResult = result
  }

  @action setError(error: string | null) {
    this.error = error
  }

  @action reset() {
    this.selectedDevice = null
    this.wifiSSID = ''
    this.wifiPassword = ''
    this.connectionState = 'disconnected'
    this.provisioningState = 'idle'
    this.configResult = null
    this.error = null
  }
}

export const store = new SimpleStore()
export default store
