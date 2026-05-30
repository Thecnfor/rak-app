import { Component, PropsWithChildren } from 'react'
import { View, Text, Button, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { store } from '../../store/simple'
import { logger, LogEntry } from '../../utils/logger'
import './index.css'

interface DebugState {
  logs: LogEntry[]
  filterLevel: 'all' | 'INFO' | 'DEBUG' | 'WARN' | 'ERROR'
}

class Debug extends Component<PropsWithChildren, DebugState> {
  state: DebugState = {
    logs: [],
    filterLevel: 'all',
  }

  componentDidMount() {
    logger.onLog(this.handleNewLog)
    this.setState({ logs: logger.getLogs() })
  }

  componentWillUnmount() {
    logger.offLog(this.handleNewLog)
  }

  handleNewLog = (entry: LogEntry) => {
    this.setState(prev => ({
      logs: [...prev.logs, entry],
    }))
  }

  handleClearLogs = () => {
    logger.clearLogs()
    this.setState({ logs: [] })
  }

  handleExportLogs = () => {
    const logText = logger.exportLogs()
    Taro.setClipboardData({
      data: logText,
      success: () => {
        Taro.showToast({ title: '日志已复制', icon: 'success' })
      },
    })
  }

  handleFilterChange = (level: DebugState['filterLevel']) => {
    this.setState({ filterLevel: level })
  }

  handleResetProvisioning = () => {
    store.reset()
    Taro.redirectTo({ url: '/pages/index/index' })
  }

  getFilteredLogs(): LogEntry[] {
    const { logs, filterLevel } = this.state
    if (filterLevel === 'all') return logs
    return logs.filter(log => log.level === filterLevel)
  }

  getLevelStyle(level: string): string {
    switch (level) {
      case 'INFO': return 'text-[#1A1A1A]'
      case 'DEBUG': return 'text-[#999]'
      case 'WARN': return 'text-[#1A1A1A] font-medium'
      case 'ERROR': return 'text-[#1A1A1A] font-bold'
      default: return 'text-[#999]'
    }
  }

  getLevelBadge(level: string): string {
    switch (level) {
      case 'INFO': return '·'
      case 'DEBUG': return '○'
      case 'WARN': return '!'
      case 'ERROR': return '×'
      default: return '·'
    }
  }

  getDirectionIcon(direction?: string): string {
    if (direction === 'TX') return '↑'
    if (direction === 'RX') return '↓'
    return ''
  }

  getStatusText(state: string): string {
    switch (state) {
      case 'idle': return '空闲'
      case 'scanning': return '扫描中'
      case 'connecting': return '连接中'
      case 'connected': return '已连接'
      case 'configuring': return '配置中'
      case 'success': return '成功'
      case 'failed': return '失败'
      default: return state
    }
  }

  render() {
    const { filterLevel } = this.state
    const { provisioningState, configResult, selectedDevice, error } = store
    const filteredLogs = this.getFilteredLogs()

    return (
      <View className="min-h-screen bg-[#FAF8F5]">
        <View className="px-5 pt-6 pb-4">
          {/* Header */}
          <Text className="text-[11px] tracking-[0.2em] text-[#999] uppercase mb-1">Raro</Text>
          <Text className="text-2xl font-semibold text-[#1A1A1A] mb-1">调试控制台</Text>
          <Text className="text-sm text-[#999] mb-6">
            实时日志与状态监控
          </Text>

          {/* Status Card */}
          <View className="bg-white rounded-xl p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-3">配网状态</Text>

            <View className="flex gap-3 mb-3">
              <View className="flex-1 bg-[#FAF8F5] rounded-lg p-3">
                <Text className="text-[10px] text-[#BBB] tracking-wide">设备</Text>
                <Text className="text-sm text-[#1A1A1A] mt-0.5 font-medium">
                  {selectedDevice?.name || '—'}
                </Text>
              </View>
              <View className="flex-1 bg-[#FAF8F5] rounded-lg p-3">
                <Text className="text-[10px] text-[#BBB] tracking-wide">状态</Text>
                <Text className="text-sm text-[#1A1A1A] mt-0.5 font-medium">
                  {this.getStatusText(provisioningState)}
                </Text>
              </View>
            </View>

            {configResult && (
              <View className="bg-[#FAF8F5] rounded-lg p-3 mb-3">
                <Text className="text-sm text-[#1A1A1A] font-medium">
                  {configResult.status === 'success' ? '配网成功' : '配网失败'}
                </Text>
                {configResult.ip && (
                  <Text className="text-[11px] text-[#999] mt-0.5 font-mono">IP: {configResult.ip}</Text>
                )}
                <Text className="text-[11px] text-[#999] mt-0.5">{configResult.message}</Text>
              </View>
            )}

            {error && (
              <View className="border-l-2 border-[#1A1A1A] pl-3 mb-3">
                <Text className="text-[11px] text-[#666]">{error}</Text>
              </View>
            )}

            <Button
              className="w-full bg-[#1A1A1A] text-white rounded-xl py-2.5 text-xs font-medium border-0"
              onClick={this.handleResetProvisioning}
            >
              重新配网
            </Button>
          </View>

          {/* Log Console */}
          <View className="bg-white rounded-xl p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <View className="flex justify-between items-center mb-3">
              <Text className="text-xs tracking-[0.15em] text-[#999] uppercase">
                日志 · {filteredLogs.length}
              </Text>
              <View className="flex gap-3">
                <Text className="text-[10px] text-[#BBB]" onClick={this.handleClearLogs}>清空</Text>
                <Text className="text-[10px] text-[#999]" onClick={this.handleExportLogs}>导出</Text>
              </View>
            </View>

            {/* Filter Tabs */}
            <View className="flex gap-1.5 mb-3">
              {(['all', 'INFO', 'DEBUG', 'WARN', 'ERROR'] as const).map(level => (
                <Text
                  key={level}
                  className={`px-2.5 py-1 rounded-full text-[10px] tracking-wide ${
                    filterLevel === level
                      ? 'bg-[#1A1A1A] text-white'
                      : 'text-[#999]'
                  }`}
                  onClick={() => this.handleFilterChange(level)}
                >
                  {level === 'all' ? '全部' : level}
                </Text>
              ))}
            </View>

            {/* Log Output */}
            <ScrollView className="h-80 bg-[#1A1A1A] rounded-lg p-3" scrollY>
              {filteredLogs.length === 0 ? (
                <Text className="text-[#555] text-xs">等待日志...</Text>
              ) : (
                filteredLogs.map(log => (
                  <View key={log.id} className="mb-1.5">
                    <View className="flex items-start">
                      <Text className="text-[#555] text-[10px] mr-2 font-mono">
                        {logger.formatTimestamp(log.timestamp)}
                      </Text>
                      <Text className={`text-[10px] mr-1.5 ${this.getLevelStyle(log.level)}`}>
                        {this.getLevelBadge(log.level)}
                      </Text>
                      {log.direction && (
                        <Text className="text-[#666] text-[10px] mr-1.5">
                          {this.getDirectionIcon(log.direction)}
                        </Text>
                      )}
                      <Text className="text-[#AAA] text-[10px] flex-1 font-mono">{log.message}</Text>
                    </View>
                    {log.data && (
                      <View className="ml-16 mt-0.5">
                        <Text className="text-[#555] text-[9px] font-mono break-all">
                          {typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}
                        </Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>

          {/* Legend */}
          <View className="px-1">
            <Text className="text-[10px] text-[#BBB] leading-relaxed">
              · INFO  ○ DEBUG  ! WARN  × ERROR{'\n'}
              ↑ 发送  ↓ 接收
            </Text>
          </View>
        </View>
      </View>
    )
  }
}

export default Debug
