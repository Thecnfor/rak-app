import { observable, action, runInAction } from 'mobx'
import { bleService, BLEDevice, BLEConnectionState } from '../services/ble'
import { encodeWiFiConfig, decodeBLEMessage, ConfigResult, arrayBufferToHex } from '../utils/parser'
import { logger } from '../utils/logger'

export type ProvisioningState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'configuring' | 'success' | 'failed'

export interface WiFiInfo {
  ssid: string
  password: string
}

class ProvisioningStore {
  @observable devices: BLEDevice[] = []
  @observable selectedDevice: BLEDevice | null = null
  @observable connectionState: BLEConnectionState = 'disconnected'
  @observable provisioningState: ProvisioningState = 'idle'
  @observable wifiInfo: WiFiInfo = { ssid: '', password: '' }
  @observable configResult: ConfigResult | null = null
  @observable error: string | null = null
  @observable isScanning: boolean = false

  private configTimeout: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.setupBLEListeners()
  }

  private setupBLEListeners() {
    bleService.on('deviceFound', (device: BLEDevice) => {
      runInAction(() => {
        const existingIndex = this.devices.findIndex(d => d.deviceId === device.deviceId)
        if (existingIndex === -1) {
          this.devices.push(device)
          logger.info(`发现设备: ${device.name}`, { deviceId: device.deviceId, RSSI: device.RSSI })
        } else {
          this.devices[existingIndex] = device
        }
      })
    })

    bleService.on('connectionStateChange', ({ state, deviceId }: { state: BLEConnectionState, deviceId: string }) => {
      runInAction(() => {
        this.connectionState = state
        if (state === 'connected') {
          this.provisioningState = 'connected'
          logger.info('设备已连接', { deviceId })
        } else if (state === 'disconnected') {
          if (this.provisioningState !== 'success') {
            this.provisioningState = 'idle'
          }
          logger.info('设备已断开', { deviceId })
        }
      })
    })

    bleService.on('dataReceived', ({ data }: { data: ArrayBuffer }) => {
      runInAction(() => {
        logger.rx('收到数据', { hex: arrayBufferToHex(data) })
        const message = decodeBLEMessage(data)
        if (message && message.type === 'config_result') {
          if (this.configTimeout) {
            clearTimeout(this.configTimeout)
            this.configTimeout = null
          }
          this.configResult = message as ConfigResult
          this.provisioningState = message.status === 'success' ? 'success' : 'failed'
          logger.info(`配网结果: ${message.status}`, message)
        }
      })
    })

    bleService.on('dataSent', ({ data }: { data: ArrayBuffer }) => {
      logger.tx('发送数据', { hex: arrayBufferToHex(data) })
    })

    bleService.on('error', ({ code, message }: { code: number, message: string }) => {
      runInAction(() => {
        this.error = `BLE错误 (${code}): ${message}`
        logger.error(this.error)
      })
    })
  }

  @action
  async startScan() {
    this.devices = []
    this.isScanning = true
    this.provisioningState = 'scanning'
    this.error = null

    try {
      await bleService.openAdapter()
      await bleService.startScan()
      logger.info('开始扫描BLE设备')
    } catch (error: any) {
      runInAction(() => {
        this.isScanning = false
        this.provisioningState = 'idle'
        this.error = error.message || '扫描失败'
      })
    }
  }

  @action
  async stopScan() {
    try {
      await bleService.stopScan()
      await bleService.closeAdapter()
    } catch (error) {
    }
    runInAction(() => {
      this.isScanning = false
      if (this.provisioningState === 'scanning') {
        this.provisioningState = 'idle'
      }
    })
    logger.info('停止扫描')
  }

  @action
  async connectDevice(device: BLEDevice) {
    this.selectedDevice = device
    this.provisioningState = 'connecting'
    this.error = null

    try {
      logger.info(`正在连接设备: ${device.name}`, { deviceId: device.deviceId })
      await bleService.stopScan()
      await bleService.connect(device.deviceId)

      logger.info('正在发现服务...')
      const services = await bleService.getServices()
      logger.info(`发现 ${services.length} 个服务`, services.map(s => s.uuid))

      const characteristics = await bleService.getCharacteristics('0000fff0-0000-1000-8000-00805f9b34fb')
      logger.info(`发现 ${characteristics.length} 个特征值`, characteristics.map(c => ({
        uuid: c.uuid,
        properties: c.properties,
      })))

      await bleService.enableNotify()
      logger.info('已启用通知')
    } catch (error: any) {
      runInAction(() => {
        this.provisioningState = 'idle'
        this.error = error.message || '连接失败'
      })
    }
  }

  @action
  async disconnectDevice() {
    if (this.configTimeout) {
      clearTimeout(this.configTimeout)
      this.configTimeout = null
    }
    try {
      await bleService.disconnect()
    } catch (error) {
    }
    runInAction(() => {
      this.selectedDevice = null
      this.connectionState = 'disconnected'
      this.provisioningState = 'idle'
      this.configResult = null
    })
  }

  @action
  setWiFiInfo(ssid: string, password: string) {
    this.wifiInfo = { ssid, password }
  }

  @action
  async sendWiFiConfig() {
    if (!this.wifiInfo.ssid) {
      this.error = '请输入WiFi名称'
      return
    }

    this.provisioningState = 'configuring'
    this.configResult = null
    this.error = null

    try {
      logger.info('发送WiFi配置', { ssid: this.wifiInfo.ssid })
      const data = encodeWiFiConfig(this.wifiInfo.ssid, this.wifiInfo.password)
      await bleService.write(data)
      logger.info('WiFi配置已发送，等待设备响应...')

      // 30秒超时：设备连接WiFi+MQTT可能需要较长时间
      this.configTimeout = setTimeout(() => {
        runInAction(() => {
          if (this.provisioningState === 'configuring') {
            this.provisioningState = 'failed'
            this.error = '配网超时（30秒），请检查设备状态'
            logger.error('配网响应超时')
          }
        })
      }, 30000)
    } catch (error: any) {
      runInAction(() => {
        this.provisioningState = 'failed'
        this.error = error.message || '发送配置失败'
      })
    }
  }

  @action
  resetProvisioning() {
    if (this.configTimeout) {
      clearTimeout(this.configTimeout)
      this.configTimeout = null
    }
    this.disconnectDevice()
    this.devices = []
    this.wifiInfo = { ssid: '', password: '' }
    this.configResult = null
    this.error = null
    this.provisioningState = 'idle'
    logger.info('重置配网状态')
  }

  @action
  clearError() {
    this.error = null
  }
}

export const provisioningStore = new ProvisioningStore()
export default ProvisioningStore