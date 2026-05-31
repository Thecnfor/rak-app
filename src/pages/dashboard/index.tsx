import { Component, PropsWithChildren } from 'react'
import { View, Text } from '@tarojs/components'
import { store, ConfigResult } from '../../store/simple'
import './index.css'

interface DashboardState {
  currentTime: string
  provisionHistory: ConfigResult[]
}

class Dashboard extends Component<PropsWithChildren, DashboardState> {
  private timer: ReturnType<typeof setInterval> | null = null

  state: DashboardState = {
    currentTime: this.formatTime(new Date()),
    provisionHistory: [],
  }

  componentDidMount() {
    this.timer = setInterval(() => {
      this.setState({ currentTime: this.formatTime(new Date()) })
    }, 1000)
    store.subscribe(this.handleStoreChange)
  }

  componentWillUnmount() {
    if (this.timer) clearInterval(this.timer)
  }

  handleStoreChange = () => {
    if (store.configResult) {
      this.setState(prev => ({
        provisionHistory: [store.configResult!, ...prev.provisionHistory].slice(0, 10),
      }))
    }
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'success': return '#10B981'
      case 'failed': return '#EF4444'
      case 'idle': return '#6B7280'
      default: return '#F59E0B'
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'success': return '成功'
      case 'failed': return '失败'
      case 'idle': return '待配网'
      default: return '处理中'
    }
  }

  render() {
    const { currentTime, provisionHistory } = this.state
    const device = store.selectedDevice
    const isConnected = store.connectionState === 'connected'
    const provisioningState = store.provisioningState

    return (
      <View className="min-h-screen bg-[#FAF8F5]">
        <View className="px-5 pt-6 pb-4">
          {/* Header */}
          <View className="flex justify-between items-start mb-6">
            <View>
              <Text className="text-[11px] tracking-[0.2em] text-[#999] uppercase mb-1">Raro</Text>
              <Text className="text-2xl font-semibold text-[#1A1A1A]">控制台</Text>
            </View>
            <Text className="text-xs text-[#999] font-mono">{currentTime}</Text>
          </View>

          {/* Stats Grid */}
          <View className="grid grid-cols-2 gap-3 mb-6">
            <View className="bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Text className="text-[10px] tracking-[0.15em] text-[#999] uppercase mb-2">连接状态</Text>
              <View className="flex items-center gap-2">
                <View className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`} />
                <Text className="text-lg font-semibold text-[#1A1A1A]">
                  {isConnected ? '已连接' : '未连接'}
                </Text>
              </View>
            </View>

            <View className="bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Text className="text-[10px] tracking-[0.15em] text-[#999] uppercase mb-2">配网状态</Text>
              <View className="flex items-center gap-2">
                <View
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: this.getStatusColor(provisioningState) }}
                />
                <Text className="text-lg font-semibold text-[#1A1A1A]">
                  {this.getStatusText(provisioningState)}
                </Text>
              </View>
            </View>

            <View className="bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Text className="text-[10px] tracking-[0.15em] text-[#999] uppercase mb-2">设备名称</Text>
              <Text className="text-sm font-medium text-[#1A1A1A] truncate">
                {device?.name ?? '未选择'}
              </Text>
            </View>

            <View className="bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Text className="text-[10px] tracking-[0.15em] text-[#999] uppercase mb-2">信号强度</Text>
              <Text className="text-sm font-medium text-[#1A1A1A]">
                {device ? `${device.RSSI} dBm` : '--'}
              </Text>
            </View>
          </View>

          {/* Device Info Card */}
          {device && (
            <View className="bg-white rounded-xl p-4 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-3">设备信息</Text>
              <View className="space-y-2">
                <View className="flex justify-between items-center">
                  <Text className="text-xs text-[#999]">设备 ID</Text>
                  <Text className="text-xs font-mono text-[#1A1A1A]">{device.deviceId}</Text>
                </View>
                <View className="flex justify-between items-center">
                  <Text className="text-xs text-[#999]">连接状态</Text>
                  <Text className="text-xs text-[#1A1A1A]">{store.connectionState}</Text>
                </View>
                <View className="flex justify-between items-center">
                  <Text className="text-xs text-[#999]">配网状态</Text>
                  <Text className="text-xs text-[#1A1A1A]">{store.provisioningState}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Latest Result */}
          {store.configResult && (
            <View className="bg-white rounded-xl p-4 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-3">最新配网结果</Text>
              <View
                className="border-l-2 pl-3 py-1"
                style={{ borderColor: this.getStatusColor(store.configResult.status) }}
              >
                <Text className="text-sm font-medium text-[#1A1A1A]">
                  {store.configResult.message}
                </Text>
                {store.configResult.ip && (
                  <Text className="text-xs text-[#999] mt-1 font-mono">
                    IP: {store.configResult.ip}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Provisioning History */}
          <View className="bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-3">配网历史</Text>
            {provisionHistory.length === 0 ? (
              <View className="py-6 items-center">
                <Text className="text-xs text-[#CCC]">暂无配网记录</Text>
              </View>
            ) : (
              <View className="space-y-2">
                {provisionHistory.map((result, index) => (
                  <View
                    key={index}
                    className="flex items-center gap-3 py-2 border-b border-[#F5F5F5] last:border-0"
                  >
                    <View
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: this.getStatusColor(result.status) }}
                    />
                    <View className="flex-1 min-w-0">
                      <Text className="text-xs text-[#1A1A1A] truncate">{result.message}</Text>
                      {result.ip && (
                        <Text className="text-[10px] text-[#999] font-mono">{result.ip}</Text>
                      )}
                    </View>
                    <Text className="text-[10px] text-[#CCC] shrink-0">
                      {this.getStatusText(result.status)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Architecture Info */}
          <View className="mt-6 bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-3">系统架构</Text>
            <View className="space-y-2 text-xs font-mono">
              <View className="flex items-center gap-2">
                <Text className="text-[#999] w-16 text-right shrink-0">手机端</Text>
                <Text className="text-[#CCC]">→</Text>
                <View className="bg-[#F5F5F5] rounded px-2 py-1">
                  <Text className="text-[#1A1A1A]">BLE 配网</Text>
                </View>
                <Text className="text-[#CCC]">→</Text>
                <View className="bg-[#F5F5F5] rounded px-2 py-1">
                  <Text className="text-[#1A1A1A]">WiFi 配置</Text>
                </View>
              </View>
              <View className="flex items-center gap-2">
                <Text className="text-[#999] w-16 text-right shrink-0">设备端</Text>
                <Text className="text-[#CCC]">→</Text>
                <View className="bg-[#F5F5F5] rounded px-2 py-1">
                  <Text className="text-[#1A1A1A]">ESP32-C3</Text>
                </View>
                <Text className="text-[#CCC]">→</Text>
                <View className="bg-[#F5F5F5] rounded px-2 py-1">
                  <Text className="text-[#1A1A1A]">MQTT 连接</Text>
                </View>
              </View>
            </View>
            <Text className="mt-3 text-[10px] text-[#CCC]">
              BLE 服务 UUID: 0000fff0 · 配网超时: 30s
            </Text>
          </View>
        </View>
      </View>
    )
  }
}

export default Dashboard
