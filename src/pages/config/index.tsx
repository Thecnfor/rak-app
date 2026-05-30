import { Component, PropsWithChildren } from 'react'
import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { bleService } from '../../services/ble'
import { store } from '../../store/simple'
import { encodeWiFiConfig, decodeBLEMessage, arrayBufferToHex } from '../../utils/parser'
import './index.css'

interface ConfigState {
  ssid: string
  password: string
  showPassword: boolean
  sending: boolean
}

class Config extends Component<PropsWithChildren, ConfigState> {
  private configTimeout: ReturnType<typeof setTimeout> | null = null

  state: ConfigState = {
    ssid: store.wifiSSID || '',
    password: store.wifiPassword || '',
    showPassword: false,
    sending: false,
  }

  componentDidMount() {
    if (!store.selectedDevice) {
      Taro.redirectTo({ url: '/pages/index/index' })
      return
    }

    // 监听 BLE 数据
    bleService.on('dataReceived', this.handleDataReceived)
  }

  componentWillUnmount() {
    bleService.off('dataReceived', this.handleDataReceived)
    if (this.configTimeout) {
      clearTimeout(this.configTimeout)
    }
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
      this.setState({ sending: false })
    }
  }

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
      Taro.showToast({ title: '请输入WiFi名称', icon: 'none' })
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

      // 30秒超时
      this.configTimeout = setTimeout(() => {
        if (store.provisioningState === 'configuring') {
          store.setProvisioningState('failed')
          store.setError('配网超时（30秒），请检查设备状态')
          this.setState({ sending: false })
        }
      }, 30000)

      Taro.navigateTo({ url: '/pages/debug/index' })
    } catch (error: any) {
      store.setProvisioningState('failed')
      store.setError(error.message || '发送配置失败')
      this.setState({ sending: false })
    }
  }

  handleDisconnect = async () => {
    try {
      await bleService.disconnect()
    } catch (e: any) {
      // 断开连接失败时仍重置状态，确保不卡在已连接状态
      console.warn('断开连接失败:', e.message)
    }
    store.reset()
    Taro.redirectTo({ url: '/pages/index/index' })
  }

  render() {
    const { ssid, password, showPassword, sending } = this.state
    const device = store.selectedDevice

    return (
      <View className="min-h-screen bg-gray-50">
        <View className="p-4">
          <View className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <View className="flex items-center justify-between mb-3">
              <Text className="text-lg font-bold text-gray-900">已连接设备</Text>
              <View className="bg-green-100 px-2 py-1 rounded">
                <Text className="text-xs text-green-700">已连接</Text>
              </View>
            </View>

            {device && (
              <View className="bg-gray-50 rounded-lg p-3 mb-3">
                <Text className="font-medium text-gray-900">{device.name}</Text>
                <Text className="text-xs text-gray-400 mt-1">{device.deviceId}</Text>
              </View>
            )}

            <Button
              className="w-full bg-red-500 text-white rounded-lg py-2 text-sm"
              onClick={this.handleDisconnect}
            >
              断开连接
            </Button>
          </View>

          <View className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <Text className="text-lg font-bold text-gray-900 mb-4">WiFi 配置</Text>

            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">WiFi 名称 (SSID)</Text>
              <Input
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="请输入WiFi名称"
                value={ssid}
                onInput={this.handleSSIDChange}
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">WiFi 密码</Text>
              <View className="relative">
                <Input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-16"
                  placeholder="请输入WiFi密码"
                  password={!showPassword}
                  value={password}
                  onInput={this.handlePasswordChange}
                />
                <Button
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-blue-600 text-sm px-2 py-1"
                  onClick={this.toggleShowPassword}
                >
                  {showPassword ? '隐藏' : '显示'}
                </Button>
              </View>
            </View>

            <View className="bg-yellow-50 rounded-lg p-3 mb-4">
              <Text className="text-yellow-800 text-sm">
                <Text className="font-medium">注意：</Text>
                请确保输入正确的 WiFi 信息，设备将使用此配置连接网络。
              </Text>
            </View>

            <Button
              className={`w-full rounded-lg py-3 text-white font-medium ${
                sending ? 'bg-gray-400' : 'bg-blue-600'
              }`}
              onClick={this.handleSubmit}
              disabled={sending}
            >
              {sending ? '正在发送配置...' : '开始配网'}
            </Button>
          </View>

          <View className="bg-blue-50 rounded-lg p-4">
            <Text className="text-blue-800 font-medium mb-2">配网说明</Text>
            <Text className="text-blue-600 text-sm">
              1. 输入您要连接的 WiFi 名称和密码{'\n'}
              2. 点击"开始配网"发送配置到设备{'\n'}
              3. 设备将尝试连接 WiFi 并返回结果{'\n'}
              4. 配网成功后设备将自动连接网络
            </Text>
          </View>
        </View>
      </View>
    )
  }
}

export default Config
