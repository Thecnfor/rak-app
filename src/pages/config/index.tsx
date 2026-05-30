import { Component, PropsWithChildren } from 'react'
import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { bleService } from '../../services/ble'
import { store } from '../../store/simple'
import { encodeWiFiConfig, decodeBLEMessage } from '../../utils/parser'
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
      console.warn('断开连接失败:', e.message)
    }
    store.reset()
    Taro.redirectTo({ url: '/pages/index/index' })
  }

  render() {
    const { ssid, password, showPassword, sending } = this.state
    const device = store.selectedDevice

    return (
      <View className="min-h-screen bg-[#FAF8F5]">
        <View className="px-5 pt-6 pb-4">
          {/* Header */}
          <Text className="text-[11px] tracking-[0.2em] text-[#999] uppercase mb-1">Raro</Text>
          <Text className="text-2xl font-semibold text-[#1A1A1A] mb-1">WiFi 配置</Text>
          <Text className="text-sm text-[#999] mb-6">
            为设备配置网络连接
          </Text>

          {/* Connected Device */}
          <View className="bg-white rounded-xl p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <View className="flex items-center justify-between mb-3">
              <Text className="text-xs tracking-[0.15em] text-[#999] uppercase">已连接设备</Text>
              <View className="flex items-center gap-1.5">
                <View className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A]" />
                <Text className="text-[10px] text-[#999]">在线</Text>
              </View>
            </View>

            {device && (
              <View className="mb-3">
                <Text className="text-[#1A1A1A] font-medium text-sm">{device.name}</Text>
                <Text className="text-[#CCC] text-[10px] mt-0.5 font-mono">{device.deviceId}</Text>
              </View>
            )}

            <Button
              className="w-full bg-white text-[#999] rounded-xl py-2.5 text-xs font-medium border border-[#E5E2DD]"
              onClick={this.handleDisconnect}
            >
              断开连接
            </Button>
          </View>

          {/* WiFi Form */}
          <View className="bg-white rounded-xl p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-4">网络配置</Text>

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
                <Text
                  className="text-[10px] text-[#999] pl-2"
                  onClick={this.toggleShowPassword}
                >
                  {showPassword ? '隐藏' : '显示'}
                </Text>
              </View>
            </View>

            <Button
              className={`w-full rounded-xl py-3.5 text-sm font-medium border-0 ${
                sending
                  ? 'bg-[#E5E2DD] text-[#999]'
                  : 'bg-[#1A1A1A] text-white'
              }`}
              onClick={this.handleSubmit}
              disabled={sending}
            >
              {sending ? '正在发送...' : '开始配网'}
            </Button>
          </View>

          {/* Note */}
          <View className="px-1">
            <Text className="text-[11px] text-[#BBB] leading-relaxed">
              请确保输入正确的 WiFi 信息。设备仅支持 2.4GHz 频段网络。
            </Text>
          </View>
        </View>
      </View>
    )
  }
}

export default Config
