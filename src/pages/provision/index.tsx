import { Component, PropsWithChildren } from 'react'
import { View, Text, Button, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { bleService, BLEDevice } from '../../services/ble'
import { store } from '../../store/simple'
import { encodeWiFiConfig, decodeBLEMessage } from '../../utils/parser'
import './index.css'

// ─── 状态定义 ──────────────────────────────────────────────

type Step = 'scan' | 'config' | 'result'

interface ProvisionState {
  step: Step
  devices: BLEDevice[]
  isScanning: boolean
  selectedDevice: BLEDevice | null
  ssid: string
  password: string
  showPassword: boolean
  sending: boolean
  scanError: string | null
}

// ─── 统一配网页 ───────────────────────────────────────────

class Provision extends Component<PropsWithChildren, ProvisionState> {
  private configTimeout: ReturnType<typeof setTimeout> | null = null

  state: ProvisionState = {
    step: 'scan',
    devices: [],
    isScanning: false,
    selectedDevice: null,
    ssid: store.wifiSSID || '',
    password: store.wifiPassword || '',
    showPassword: false,
    sending: false,
    scanError: null,
  }

  componentDidMount() {
    bleService.on('deviceFound', this.handleDeviceFound)
    bleService.on('dataReceived', this.handleDataReceived)
  }

  componentWillUnmount() {
    bleService.off('deviceFound', this.handleDeviceFound)
    bleService.off('dataReceived', this.handleDataReceived)
    if (this.configTimeout) {
      clearTimeout(this.configTimeout)
    }
  }

  // ─── BLE 事件 ───────────────────────────────────────────

  handleDeviceFound = (device: BLEDevice) => {
    this.setState(prev => {
      const exists = prev.devices.find(d => d.deviceId === device.deviceId)
      if (exists) return null
      return { devices: [...prev.devices, device] }
    })
  }

  handleDataReceived = ({ data }: { data: ArrayBuffer }) => {
    const message = decodeBLEMessage(data)
    if (message && message.type === 'config_result') {
      if (this.configTimeout) {
        clearTimeout(this.configTimeout)
        this.configTimeout = null
      }
      store.setConfigResult(message as any)
      store.setProvisioningState(message.status === 'success' ? 'success' : 'failed')
      this.setState({ sending: false, step: 'result' })
    }
  }

  // ─── 扫描操作 ───────────────────────────────────────────

  handleStartScan = async () => {
    this.setState({ devices: [], isScanning: true, scanError: null })
    try {
      await bleService.openAdapter()
      await bleService.startScan()
    } catch (error: any) {
      this.setState({ isScanning: false, scanError: error.message || '扫描失败' })
    }
  }

  handleStopScan = async () => {
    try {
      await bleService.stopScan()
      await bleService.closeAdapter()
    } catch (e: any) {
      this.setState({ scanError: e.message || '停止扫描失败' })
    }
    this.setState({ isScanning: false })
  }

  // ─── 设备选择 ───────────────────────────────────────────

  handleSelectDevice = async (device: BLEDevice) => {
    try {
      await bleService.stopScan()
      this.setState({ isScanning: false })

      store.setDevice(device)
      store.setConnectionState('connecting')
      Taro.showLoading({ title: '连接中...' })

      await bleService.connect(device.deviceId)
      await bleService.getServices()
      await bleService.getCharacteristics('0000fff0-0000-1000-8000-00805f9b34fb')
      await bleService.enableNotify()

      store.setConnectionState('connected')
      this.setState({ selectedDevice: device, step: 'config' })
      Taro.hideLoading()
    } catch (error: any) {
      store.setConnectionState('disconnected')
      Taro.hideLoading()
      Taro.showToast({ title: error.message || '连接失败', icon: 'none' })
    }
  }

  // ─── 配网操作 ───────────────────────────────────────────

  handleSSIDChange = (e: any) => {
    this.setState({ ssid: e.detail.value })
  }

  handlePasswordChange = (e: any) => {
    this.setState({ password: e.detail.value })
  }

  toggleShowPassword = () => {
    this.setState({ showPassword: !this.state.showPassword })
  }

  handleSubmit = async () => {
    const { ssid, password } = this.state
    if (!ssid.trim()) {
      Taro.showToast({ title: '请输入 WiFi 名称', icon: 'none' })
      return
    }

    store.setWiFi(ssid.trim(), password)
    store.setProvisioningState('configuring')
    store.setConfigResult(null)
    store.setError(null)
    this.setState({ sending: true })

    try {
      const data = encodeWiFiConfig(ssid.trim(), password)
      await bleService.write(data)

      this.configTimeout = setTimeout(() => {
        if (store.provisioningState === 'configuring') {
          store.setProvisioningState('failed')
          store.setError('配网超时（30秒），请检查设备状态')
          this.setState({ sending: false, step: 'result' })
        }
      }, 30000)
    } catch (error: any) {
      store.setProvisioningState('failed')
      store.setError(error.message || '发送配置失败')
      this.setState({ sending: false, step: 'result' })
    }
  }

  // ─── 结果页操作 ─────────────────────────────────────────

  handleRetry = async () => {
    try {
      await bleService.disconnect()
    } catch {}
    store.reset()
    this.setState({
      step: 'scan',
      devices: [],
      selectedDevice: null,
      sending: false,
    })
  }

  handleDisconnect = async () => {
    try {
      await bleService.disconnect()
    } catch {}
    store.reset()
    this.setState({
      step: 'scan',
      devices: [],
      selectedDevice: null,
      ssid: '',
      password: '',
    })
  }

  // ─── 信号强度 ───────────────────────────────────────────

  getSignalBars(rssi: number): number {
    if (rssi >= -50) return 3
    if (rssi >= -70) return 2
    return 1
  }

  // ─── 步骤指示器 ─────────────────────────────────────────

  renderStepIndicator() {
    const { step } = this.state
    const steps = [
      { key: 'scan', label: '扫描设备', num: '①' },
      { key: 'config', label: 'WiFi 配置', num: '②' },
      { key: 'result', label: '配网结果', num: '③' },
    ]

    return (
      <View className="flex items-center justify-between mb-5 px-1">
        {steps.map((s, i) => {
          const isActive = s.key === step
          const isPast = (step === 'config' && s.key === 'scan') || (step === 'result' && i < 2)
          return (
            <View key={s.key} className="flex items-center">
              <View className={`flex items-center gap-1.5 ${isActive ? 'opacity-100' : isPast ? 'opacity-60' : 'opacity-30'}`}>
                <Text className={`text-xs font-medium ${isActive ? 'text-[#1A1A1A]' : 'text-[#999]'}`}>
                  {s.num}
                </Text>
                <Text className={`text-xs ${isActive ? 'text-[#1A1A1A] font-medium' : 'text-[#999]'}`}>
                  {s.label}
                </Text>
              </View>
              {i < 2 && <Text className="text-[#E5E2DD] mx-2">→</Text>}
            </View>
          )
        })}
      </View>
    )
  }

  // ─── 扫描步骤 ───────────────────────────────────────────

  renderScanStep() {
    const { devices, isScanning, scanError } = this.state

    return (
      <View>
        {/* 扫描按钮 */}
        <View className="mb-5">
          {!isScanning ? (
            <Button
              className="w-full bg-[#1A1A1A] text-white rounded-xl py-3.5 text-sm font-medium border-0"
              onClick={this.handleStartScan}
            >
              开始扫描
            </Button>
          ) : (
            <Button
              className="w-full bg-white text-[#1A1A1A] rounded-xl py-3.5 text-sm font-medium border border-[#E5E2DD]"
              onClick={this.handleStopScan}
            >
              停止扫描
            </Button>
          )}
        </View>

        {/* 扫描指示 */}
        {isScanning && (
          <View className="flex items-center justify-center mb-5">
            <View className="scanning-dot mr-2" />
            <Text className="text-[#999] text-xs tracking-wide">正在搜索设备...</Text>
          </View>
        )}

        {/* 错误 */}
        {scanError && (
          <View className="border-l-2 border-[#1A1A1A] pl-3 mb-5">
            <Text className="text-[#666] text-sm">{scanError}</Text>
          </View>
        )}

        {/* 设备列表 */}
        <View>
          <View className="flex justify-between items-center mb-3">
            <Text className="text-xs tracking-[0.15em] text-[#999] uppercase">发现的设备</Text>
            <Text className="text-xs text-[#BBB]">{devices.length}</Text>
          </View>

          {devices.length === 0 ? (
            <View className="py-12 items-center">
              <Text className="text-[#CCC] text-sm">
                {isScanning ? '' : '暂无设备'}
              </Text>
            </View>
          ) : (
            devices.map(device => (
              <View
                key={device.deviceId}
                className="bg-white rounded-xl p-4 mb-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                onClick={() => this.handleSelectDevice(device)}
              >
                <View className="flex justify-between items-center">
                  <View className="flex-1">
                    <Text className="text-[#1A1A1A] font-medium text-sm">{device.name}</Text>
                    <Text className="text-[#CCC] text-[10px] mt-1 font-mono">{device.deviceId}</Text>
                  </View>
                  <View className="flex items-center gap-1.5">
                    {[1, 2, 3].map(bar => (
                      <View
                        key={bar}
                        className={`w-[3px] rounded-full ${
                          bar <= this.getSignalBars(device.RSSI) ? 'bg-[#1A1A1A]' : 'bg-[#E5E2DD]'
                        }`}
                        style={{ height: `${bar * 5 + 2}px` }}
                      />
                    ))}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    )
  }

  // ─── 配网步骤 ───────────────────────────────────────────

  renderConfigStep() {
    const { ssid, password, showPassword, sending, selectedDevice } = this.state

    return (
      <View>
        {/* 已选设备 */}
        <View className="bg-white rounded-xl p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <View className="flex items-center justify-between mb-2">
            <Text className="text-xs tracking-[0.15em] text-[#999] uppercase">已连接设备</Text>
            <View className="flex items-center gap-1.5">
              <View className="w-1.5 h-1.5 rounded-full bg-[#2D7D46]" />
              <Text className="text-[10px] text-[#999]">在线</Text>
            </View>
          </View>
          <Text className="text-[#1A1A1A] font-medium text-sm">{selectedDevice?.name}</Text>
          <Text className="text-[#CCC] text-[10px] mt-0.5 font-mono">{selectedDevice?.deviceId}</Text>
        </View>

        {/* WiFi 表单 */}
        <View className="bg-white rounded-xl p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-4">WiFi 配置</Text>

          <View className="mb-4">
            <Text className="text-[10px] text-[#999] mb-1.5 tracking-wide">SSID</Text>
            <Input
              className="w-full border-b border-[#E5E2DD] py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#CCC]"
              placeholder="WiFi 名称"
              value={ssid}
              onInput={this.handleSSIDChange}
            />
          </View>

          <View className="mb-5">
            <Text className="text-[10px] text-[#999] mb-1.5 tracking-wide">密码</Text>
            <View className="flex items-center border-b border-[#E5E2DD]">
              <Input
                className="flex-1 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#CCC]"
                placeholder="WiFi 密码"
                password={!showPassword}
                value={password}
                onInput={this.handlePasswordChange}
              />
              <Text className="text-[10px] text-[#999] pl-2" onClick={this.toggleShowPassword}>
                {showPassword ? '隐藏' : '显示'}
              </Text>
            </View>
          </View>

          <Button
            className={`w-full rounded-xl py-3.5 text-sm font-medium border-0 ${
              sending ? 'bg-[#E5E2DD] text-[#999]' : 'bg-[#1A1A1A] text-white'
            }`}
            onClick={this.handleSubmit}
            disabled={sending}
          >
            {sending ? '正在发送...' : '发送配置'}
          </Button>
        </View>

        {/* 断开按钮 */}
        <Button
          className="w-full bg-white text-[#999] rounded-xl py-2.5 text-xs font-medium border border-[#E5E2DD]"
          onClick={this.handleDisconnect}
        >
          断开连接
        </Button>
      </View>
    )
  }

  // ─── 结果步骤 ───────────────────────────────────────────

  renderResultStep() {
    const { configResult, error } = store
    const isSuccess = configResult?.status === 'success'

    return (
      <View>
        <View className="bg-white rounded-xl p-6 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] items-center">
          {/* 状态图标 */}
          <View className={`w-16 h-16 rounded-full items-center justify-center mb-4 ${
            isSuccess ? 'bg-[#E8F5E9]' : 'bg-[#FFEBEE]'
          }`}>
            <Text className="text-3xl">{isSuccess ? '✓' : '✗'}</Text>
          </View>

          <Text className="text-lg font-semibold text-[#1A1A1A] mb-1">
            {isSuccess ? '配网成功' : '配网失败'}
          </Text>

          {configResult?.ip && (
            <Text className="text-sm text-[#666] font-mono mb-1">IP: {configResult.ip}</Text>
          )}

          {configResult?.message && (
            <Text className="text-xs text-[#999] text-center">{configResult.message}</Text>
          )}

          {error && (
            <View className="border-l-2 border-[#C0392B] pl-3 mt-3 w-full">
              <Text className="text-xs text-[#666]">{error}</Text>
            </View>
          )}
        </View>

        {/* 操作按钮 */}
        <View className="flex gap-3">
          <Button
            className="flex-1 bg-[#1A1A1A] text-white rounded-xl py-3 text-sm font-medium border-0"
            onClick={this.handleRetry}
          >
            重新配网
          </Button>
          {isSuccess && (
            <Button
              className="flex-1 bg-white text-[#1A1A1A] rounded-xl py-3 text-sm font-medium border border-[#E5E2DD]"
              onClick={this.handleDisconnect}
            >
              断开连接
            </Button>
          )}
        </View>
      </View>
    )
  }

  // ─── 主渲染 ─────────────────────────────────────────────

  render() {
    const { step } = this.state

    return (
      <ScrollView className="min-h-screen bg-[#FAF8F5]" scrollY>
        <View className="px-5 pt-6 pb-8">
          {/* Header */}
          <Text className="text-[11px] tracking-[0.2em] text-[#999] uppercase mb-1">Raro</Text>
          <Text className="text-2xl font-semibold text-[#1A1A1A] mb-1">设备配网</Text>
          <Text className="text-sm text-[#999] mb-5">
            扫描并配置 ESP32-C3 设备
          </Text>

          {/* 步骤指示器 */}
          {this.renderStepIndicator()}

          {/* 步骤内容 */}
          {step === 'scan' && this.renderScanStep()}
          {step === 'config' && this.renderConfigStep()}
          {step === 'result' && this.renderResultStep()}
        </View>
      </ScrollView>
    )
  }
}

export default Provision
