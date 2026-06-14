import { Component, PropsWithChildren } from 'react'
import { View, Text, Button, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { bleService, BLEDevice } from '../../services/ble'
import { store } from '../../store/simple'
import { encodeWiFiConfig, decodeBLEMessage } from '../../utils/parser'
import './index.css'

// ─── 状态定义 ──────────────────────────────────────────────

type Step = 'scan' | 'config' | 'result'

interface WifiItem {
  SSID: string
  signalStrength: number
  secure: boolean
}

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
  wifiList: WifiItem[]
  showWifiList: boolean
}

// ─── 配网页面 ──────────────────────────────────────────────

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
    wifiList: [],
    showWifiList: false,
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

  // ─── WiFi 扫描 ──────────────────────────────────────────

  handleScanWifi = async () => {
    try {
      await Taro.startWifi()
      const res = await Taro.getWifiList({})
      // Taro.getWifiList 在小程序中通过回调获取，这里尝试直接获取
      this.setState({ showWifiList: true })
    } catch (error: any) {
      // WiFi 扫描需要位置权限
      Taro.showModal({
        title: '需要位置权限',
        content: '获取 WiFi 列表需要位置权限，请在设置中开启',
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) {
            Taro.openSetting()
          }
        },
      })
    }
  }

  handleSelectWifi = (ssid: string) => {
    this.setState({ ssid, showWifiList: false })
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
      { key: 'scan', label: '扫描', num: '1' },
      { key: 'config', label: '配置', num: '2' },
      { key: 'result', label: '完成', num: '3' },
    ]

    return (
      <View className="flex items-center mb-8">
        {steps.map((s, i) => {
          const isActive = s.key === step
          const isDone = (step === 'config' && s.key === 'scan') || (step === 'result' && i < 2)
          return (
            <View key={s.key} className="flex items-center flex-1">
              <View className={`r-step-dot ${isActive ? 'r-step-active' : isDone ? 'r-step-done' : 'r-step-pending'}`}>
                <Text>{isDone ? '✓' : s.num}</Text>
              </View>
              <Text className={`ml-2 text-xs ${isActive ? 'text-[var(--r-text)] font-medium' : 'text-[var(--r-text-muted)]'}`}>
                {s.label}
              </Text>
              {i < 2 && <View className={`r-step-line ${isDone ? 'r-step-line-done' : ''}`} />}
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
        <View className="mb-6">
          {!isScanning ? (
            <Button className="r-btn-primary" onClick={this.handleStartScan}>
              开始扫描
            </Button>
          ) : (
            <Button className="r-btn-secondary" onClick={this.handleStopScan}>
              停止扫描
            </Button>
          )}
        </View>

        {/* 扫描指示 */}
        {isScanning && (
          <View className="flex items-center justify-center mb-6">
            <View className="r-scanning-dot mr-3" />
            <Text className="text-[var(--r-text-muted)] text-xs">正在搜索设备...</Text>
          </View>
        )}

        {/* 错误 */}
        {scanError && (
          <View className="r-card mb-4" style={{ borderLeft: '4px solid var(--r-error)' }}>
            <Text className="text-[var(--r-text-secondary)] text-sm">{scanError}</Text>
          </View>
        )}

        {/* 设备列表 */}
        <View>
          <View className="flex justify-between items-center mb-4">
            <Text className="r-card-header" style={{ marginBottom: 0 }}>发现的设备</Text>
            <Text className="text-[var(--r-text-faint)] text-xs r-mono">{devices.length}</Text>
          </View>

          {devices.length === 0 ? (
            <View className="r-card items-center py-16">
              <Text className="text-[var(--r-text-faint)] text-sm">
                {isScanning ? '' : '暂无设备，请先开始扫描'}
              </Text>
            </View>
          ) : (
            devices.map(device => (
              <View
                key={device.deviceId}
                className="r-card mb-3"
                onClick={() => this.handleSelectDevice(device)}
                hoverClass="r-card-hover"
              >
                <View className="flex justify-between items-center">
                  <View className="flex-1">
                    <Text className="text-[var(--r-text)] font-medium text-base">{device.name}</Text>
                    <Text className="text-[var(--r-text-faint)] text-xs mt-1 r-mono">{device.deviceId}</Text>
                  </View>
                  <View className="flex items-center gap-2">
                    {[1, 2, 3].map(bar => (
                      <View
                        key={bar}
                        className={`r-signal-bar ${bar <= this.getSignalBars(device.RSSI) ? 'r-signal-bar-active' : ''}`}
                        style={{ height: `${bar * 8 + 4}px` }}
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
    const { ssid, password, showPassword, sending, selectedDevice, showWifiList } = this.state

    return (
      <View>
        {/* 已连接设备 */}
        <View className="r-card mb-4">
          <View className="flex items-center justify-between mb-3">
            <Text className="r-card-header" style={{ marginBottom: 0 }}>已连接设备</Text>
            <View className="flex items-center gap-2">
              <View className="r-dot r-dot-success" />
              <Text className="text-[var(--r-text-muted)] text-xs">在线</Text>
            </View>
          </View>
          <Text className="text-[var(--r-text)] font-medium text-base">{selectedDevice?.name}</Text>
          <Text className="text-[var(--r-text-faint)] text-xs mt-1 r-mono">{selectedDevice?.deviceId}</Text>
        </View>

        {/* WiFi 表单 */}
        <View className="r-card mb-4">
          <Text className="r-card-header">WiFi 配置</Text>

          {/* SSID 输入 */}
          <View className="mb-6">
            <Text className="text-[var(--r-text-muted)] text-xs mb-2 tracking-wide">WiFi 名称</Text>
            <View className="flex items-center">
              <Input
                className="r-input flex-1"
                placeholder="输入或选择 WiFi"
                value={ssid}
                onInput={this.handleSSIDChange}
              />
              <Text
                className="text-[var(--r-text-muted)] text-xs ml-3"
                onClick={this.handleScanWifi}
              >
                扫描
              </Text>
            </View>
          </View>

          {/* 密码输入 */}
          <View className="mb-8">
            <Text className="text-[var(--r-text-muted)] text-xs mb-2 tracking-wide">密码</Text>
            <View className="flex items-center">
              <Input
                className="r-input flex-1"
                placeholder="WiFi 密码（至少 8 位）"
                password={!showPassword}
                value={password}
                onInput={this.handlePasswordChange}
              />
              <Text
                className="text-[var(--r-text-muted)] text-xs ml-3"
                onClick={this.toggleShowPassword}
              >
                {showPassword ? '隐藏' : '显示'}
              </Text>
            </View>
          </View>

          {/* 发送按钮 */}
          <Button
            className={`r-btn-primary ${sending ? 'r-btn-sending' : ''}`}
            onClick={this.handleSubmit}
            disabled={sending}
          >
            {sending ? '正在发送...' : '发送配置'}
          </Button>
        </View>

        {/* 断开按钮 */}
        <Button className="r-btn-secondary" onClick={this.handleDisconnect}>
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
        <View className="r-card items-center mb-6 py-10">
          {/* 状态图标 */}
          <View className={`r-result-icon ${isSuccess ? 'r-result-success' : 'r-result-failed'}`}>
            <Text className="text-4xl">{isSuccess ? '✓' : '✗'}</Text>
          </View>

          <Text className="r-title mt-4 mb-2">
            {isSuccess ? '配网成功' : '配网失败'}
          </Text>

          {configResult?.ip && (
            <Text className="text-[var(--r-text-secondary)] text-sm r-mono mb-1">
              IP: {configResult.ip}
            </Text>
          )}

          {configResult?.message && (
            <Text className="text-[var(--r-text-muted)] text-xs text-center">
              {configResult.message}
            </Text>
          )}

          {error && (
            <View className="mt-4 w-full" style={{ borderLeft: '4px solid var(--r-error)', paddingLeft: '24px' }}>
              <Text className="text-[var(--r-text-secondary)] text-xs">{error}</Text>
            </View>
          )}
        </View>

        {/* 操作按钮 */}
        <View className="flex gap-3">
          <View className="flex-1">
            <Button className="r-btn-primary" onClick={this.handleRetry}>
              重新配网
            </Button>
          </View>
          {isSuccess && (
            <View className="flex-1">
              <Button className="r-btn-secondary" onClick={this.handleDisconnect}>
                断开连接
              </Button>
            </View>
          )}
        </View>
      </View>
    )
  }

  // ─── 主渲染 ─────────────────────────────────────────────

  render() {
    const { step } = this.state

    return (
      <ScrollView className="min-h-screen" scrollY style={{ background: 'var(--r-bg)' }}>
        <View className="px-5 pt-6 pb-10">
          {/* Header */}
          <Text className="text-[var(--r-text-muted)] text-xs tracking-[0.2em] uppercase mb-1">Raro</Text>
          <Text className="r-title mb-1">设备配网</Text>
          <Text className="r-subtitle mb-6">扫描并配置 ESP32-C3 设备</Text>

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
