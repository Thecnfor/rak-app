import { Component, PropsWithChildren } from 'react'
import { View, Text, Button, ScrollView } from '@tarojs/components'
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
      Taro.navigateTo({ url: '/pages/config/index' })
    } catch (error: any) {
      store.setConnectionState('disconnected')
      Taro.showToast({ title: error.message || '连接失败', icon: 'none' })
    }
  }

  getSignalStrength(rssi: number): string {
    if (rssi >= -50) return '强'
    if (rssi >= -70) return '中'
    return '弱'
  }

  getSignalBars(rssi: number): number {
    if (rssi >= -50) return 3
    if (rssi >= -70) return 2
    return 1
  }

  render() {
    const { devices, isScanning, error } = this.state

    return (
      <View className="min-h-screen bg-[#FAF8F5]">
        <View className="px-5 pt-6 pb-4">
          {/* Header */}
          <Text className="text-[11px] tracking-[0.2em] text-[#999] uppercase mb-1">Raro</Text>
          <Text className="text-2xl font-semibold text-[#1A1A1A] mb-1">设备扫描</Text>
          <Text className="text-sm text-[#999] mb-6">
            搜索附近的 ESP32-C3 设备
          </Text>

          {/* Scan Button */}
          <View className="mb-6">
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

          {/* Scanning Indicator */}
          {isScanning && (
            <View className="flex items-center justify-center mb-6">
              <View className="scanning-dot mr-2" />
              <Text className="text-[#999] text-xs tracking-wide">正在搜索设备...</Text>
            </View>
          )}

          {/* Error */}
          {error && (
            <View className="border-l-2 border-[#1A1A1A] pl-3 mb-6">
              <Text className="text-[#666] text-sm">{error}</Text>
            </View>
          )}

          {/* Device List */}
          <View>
            <View className="flex justify-between items-center mb-3">
              <Text className="text-xs tracking-[0.15em] text-[#999] uppercase">
                发现的设备
              </Text>
              <Text className="text-xs text-[#BBB]">{devices.length}</Text>
            </View>

            {devices.length === 0 ? (
              <View className="py-12 items-center">
                <Text className="text-[#CCC] text-sm">
                  {isScanning ? '' : '暂无设备'}
                </Text>
              </View>
            ) : (
              <View>
                {devices.map((device) => (
                  <View
                    key={device.deviceId}
                    className="bg-white rounded-xl p-4 mb-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    onClick={() => this.handleConnectDevice(device)}
                  >
                    <View className="flex justify-between items-center">
                      <View className="flex-1">
                        <Text className="text-[#1A1A1A] font-medium text-sm">{device.name}</Text>
                        <Text className="text-[#CCC] text-[10px] mt-1 font-mono">
                          {device.deviceId}
                        </Text>
                      </View>
                      <View className="flex items-center gap-1.5">
                        {[1, 2, 3].map(bar => (
                          <View
                            key={bar}
                            className={`w-[3px] rounded-full ${
                              bar <= this.getSignalBars(device.RSSI)
                                ? 'bg-[#1A1A1A]'
                                : 'bg-[#E5E2DD]'
                            }`}
                            style={{ height: `${bar * 5 + 2}px` }}
                          />
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Footer */}
        <View className="px-5 pb-8 mt-auto">
          <View className="border-t border-[#EEE] pt-4">
            <Text className="text-[10px] text-[#CCC] text-center">
              Raro · ESP32-C3 蓝牙配网工具
            </Text>
          </View>
        </View>
      </View>
    )
  }
}

export default Index
