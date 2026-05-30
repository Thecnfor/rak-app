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

  getSignalColor(rssi: number): string {
    if (rssi >= -50) return 'text-green-600'
    if (rssi >= -70) return 'text-yellow-600'
    return 'text-red-600'
  }

  render() {
    const { devices, isScanning, error } = this.state

    return (
      <View className="min-h-screen bg-gray-50">
        <View className="p-4">
          <View className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <Text className="text-lg font-bold text-gray-900 mb-2">ESP32-C3 蓝牙配网</Text>
            <Text className="text-sm text-gray-500 mb-4">
              扫描附近的 ESP32-C3 设备进行配网配置
            </Text>

            {error && (
              <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <Text className="text-red-600 text-sm">{error}</Text>
              </View>
            )}

            <View className="flex gap-2">
              {!isScanning ? (
                <Button
                  className="flex-1 bg-blue-600 text-white rounded-lg py-3"
                  onClick={this.handleStartScan}
                >
                  开始扫描
                </Button>
              ) : (
                <Button
                  className="flex-1 bg-gray-600 text-white rounded-lg py-3"
                  onClick={this.handleStopScan}
                >
                  停止扫描
                </Button>
              )}
            </View>

            {isScanning && (
              <View className="flex items-center justify-center mt-3">
                <View className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2" />
                <Text className="text-blue-600 text-sm">正在扫描...</Text>
              </View>
            )}
          </View>

          <View className="bg-white rounded-lg shadow-sm p-4">
            <Text className="font-semibold text-gray-900 mb-3">
              发现的设备 ({devices.length})
            </Text>

            {devices.length === 0 ? (
              <View className="py-8 text-center">
                <Text className="text-gray-400">
                  {isScanning ? '正在搜索设备...' : '暂无设备，请先开始扫描'}
                </Text>
              </View>
            ) : (
              <ScrollView className="max-h-96">
                {devices.map((device) => (
                  <View
                    key={device.deviceId}
                    className="border border-gray-200 rounded-lg p-3 mb-2"
                    onClick={() => this.handleConnectDevice(device)}
                  >
                    <View className="flex justify-between items-start">
                      <View className="flex-1">
                        <Text className="font-medium text-gray-900">{device.name}</Text>
                        <Text className="text-xs text-gray-400 mt-1">
                          {device.deviceId}
                        </Text>
                      </View>
                      <View className="text-right">
                        <Text className={`text-sm font-medium ${this.getSignalColor(device.RSSI)}`}>
                          {device.RSSI} dBm
                        </Text>
                        <Text className="text-xs text-gray-400">
                          信号{this.getSignalStrength(device.RSSI)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View className="mt-4 bg-blue-50 rounded-lg p-4">
            <Text className="text-blue-800 font-medium mb-2">使用说明</Text>
            <Text className="text-blue-600 text-sm">
              1. 确保 ESP32-C3 设备已开启并处于配网模式{'\n'}
              2. 点击"开始扫描"搜索附近的 BLE 设备{'\n'}
              3. 从列表中选择要配网的设备{'\n'}
              4. 输入 WiFi 信息完成配网
            </Text>
          </View>
        </View>
      </View>
    )
  }
}

export default Index
