import { Component, PropsWithChildren } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { bleService, BLEDevice } from '../../services/ble'
import { store } from '../../store/simple'
import './index.css'

interface IndexState {
  devices: BLEDevice[]
  isScanning: boolean
  error: string | null
}

class Index extends Component<PropsWithChildren, IndexState> {
  state: IndexState = {
    devices: [],
    isScanning: false,
    error: null,
  }

  handleDeviceFound = (device: BLEDevice) => {
    this.setState(prev => {
      const exists = prev.devices.find(d => d.deviceId === device.deviceId)
      if (exists) return null
      return { devices: [...prev.devices, device] }
    })
  }

  componentDidMount() {
    bleService.on('deviceFound', this.handleDeviceFound)
  }

  componentWillUnmount() {
    bleService.off('deviceFound', this.handleDeviceFound)
  }

  handleStartScan = async () => {
    this.setState({ devices: [], isScanning: true, error: null })
    try {
      await bleService.openAdapter()
      await bleService.startScan()
    } catch (error: any) {
      this.setState({ isScanning: false, error: error.message || '扫描失败' })
    }
  }

  handleStopScan = async () => {
    try {
      await bleService.stopScan()
      await bleService.closeAdapter()
    } catch (e: any) {
      this.setState({ error: e.message || '停止扫描失败' })
    }
    this.setState({ isScanning: false })
  }

  handleConnectDevice = async (device: BLEDevice) => {
    try {
      await bleService.stopScan()
      this.setState({ isScanning: false })
      store.setDevice(device)
      store.setConnectionState('connecting')

      await bleService.connect(device.deviceId)
      await bleService.getServices()
      await bleService.getCharacteristics('0000fff0-0000-1000-8000-00805f9b34fb')
      await bleService.enableNotify()

      store.setConnectionState('connected')
      Taro.navigateTo({ url: '/pages/provision/index' })
    } catch (error: any) {
      store.setConnectionState('disconnected')
      Taro.showToast({ title: error.message || '连接失败', icon: 'none' })
    }
  }

  getSignalBars(rssi: number): number {
    if (rssi >= -50) return 3
    if (rssi >= -70) return 2
    return 1
  }

  render() {
    const { devices, isScanning, error } = this.state

    return (
      <View className="min-h-screen" style={{ background: 'var(--r-bg)' }}>
        <View className="px-5 pt-6 pb-4">
          {/* Header */}
          <Text className="text-[var(--r-text-muted)] text-xs tracking-[0.2em] uppercase mb-1">Raro</Text>
          <Text className="r-title mb-1">设备扫描</Text>
          <Text className="r-subtitle mb-6">搜索附近的 ESP32-C3 设备</Text>

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
          {error && (
            <View className="r-card mb-4" style={{ borderLeft: '4px solid var(--r-error)' }}>
              <Text className="text-[var(--r-text-secondary)] text-sm">{error}</Text>
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
              <View>
                {devices.map((device) => (
                  <View
                    key={device.deviceId}
                    className="r-card mb-3"
                    onClick={() => this.handleConnectDevice(device)}
                    hoverClass="r-card-hover"
                  >
                    <View className="flex justify-between items-center">
                      <View className="flex-1">
                        <Text className="text-[var(--r-text)] font-medium text-base">{device.name}</Text>
                        <Text className="text-[var(--r-text-faint)] text-xs mt-1 r-mono">
                          {device.deviceId}
                        </Text>
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
                ))}
              </View>
            )}
          </View>

          {/* 快速导航 */}
          <View className="mt-8">
            <Text className="r-card-header">快速导航</Text>
            <View className="flex gap-3">
              <View
                className="r-card flex-1 items-center"
                onClick={() => Taro.switchTab({ url: '/pages/dashboard/index' })}
                hoverClass="r-card-hover"
              >
                <Text className="text-2xl mb-1">🎮</Text>
                <Text className="text-[var(--r-text)] text-xs font-medium">控制中心</Text>
              </View>
              <View
                className="r-card flex-1 items-center"
                onClick={() => Taro.switchTab({ url: '/pages/provision/index' })}
                hoverClass="r-card-hover"
              >
                <Text className="text-2xl mb-1">📡</Text>
                <Text className="text-[var(--r-text)] text-xs font-medium">设备配网</Text>
              </View>
              <View
                className="r-card flex-1 items-center"
                onClick={() => Taro.switchTab({ url: '/pages/debug/index' })}
                hoverClass="r-card-hover"
              >
                <Text className="text-2xl mb-1">🔧</Text>
                <Text className="text-[var(--r-text)] text-xs font-medium">调试日志</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    )
  }
}

export default Index
