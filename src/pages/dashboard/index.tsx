import { Component, PropsWithChildren } from 'react'
import { View, Text, Button, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { dashboardStore, ChainEvent } from '../../store/dashboard'
import { getDevices, executeTask, executeAction, getSchedulerStats, SchedulerStats } from '../../services/kernel'
import { wsService } from '../../services/ws'
import './index.css'

// ─── 快捷动作列表 ──────────────────────────────────────────

const QUICK_ACTIONS = [
  { action: 'wave_hand', label: '招手', icon: '👋' },
  { action: 'shake_head', label: '摇头', icon: '🙅' },
  { action: 'nod', label: '点头', icon: '🙆' },
  { action: 'dance', label: '跳舞', icon: '💃' },
  { action: 'lock_open', label: '开门', icon: '🔓' },
  { action: 'lock_close', label: '关门', icon: '🔒' },
  { action: 'move_forward', label: '前进', icon: '⬆️' },
  { action: 'move_back', label: '后退', icon: '⬇️' },
  { action: 'emergency_stop', label: '急停', icon: '🛑' },
]

// ─── 状态定义 ──────────────────────────────────────────────

interface DashboardState {
  devicesLoaded: boolean
}

// ─── 控制中心页面 ──────────────────────────────────────────

class Dashboard extends Component<PropsWithChildren, DashboardState> {
  private schedulerTimer: ReturnType<typeof setInterval> | null = null

  state: DashboardState = {
    devicesLoaded: false,
  }

  componentDidMount() {
    // 连接 WebSocket
    wsService.on('connected', this.handleWsConnected)
    wsService.on('disconnected', this.handleWsDisconnected)
    wsService.on('asr', this.handleAsr)
    wsService.on('voice_reply', this.handleVoiceReply)
    wsService.on('action', this.handleAction)
    wsService.on('chain_error', this.handleChainError)
    wsService.connect()

    // 拉取设备列表
    this.refreshDevices()

    // 2s 轮询调度器统计
    this.refreshScheduler()
    this.schedulerTimer = setInterval(() => this.refreshScheduler(), 2000)
  }

  componentWillUnmount() {
    wsService.off('connected', this.handleWsConnected)
    wsService.off('disconnected', this.handleWsDisconnected)
    wsService.off('asr', this.handleAsr)
    wsService.off('voice_reply', this.handleVoiceReply)
    wsService.off('action', this.handleAction)
    wsService.off('chain_error', this.handleChainError)
    wsService.disconnect()

    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer)
    }
  }

  // ─── WebSocket 事件处理 ──────────────────────────────────

  handleWsConnected = () => {
    dashboardStore.setWsConnected(true)
  }

  handleWsDisconnected = () => {
    dashboardStore.setWsConnected(false)
  }

  handleAsr = (data: { traceId: string; deviceId: string; text: string }) => {
    dashboardStore.addEvent({
      id: `${data.traceId}-asr-${Date.now()}`,
      ts: Date.now(),
      type: 'asr',
      traceId: data.traceId,
      deviceId: data.deviceId,
      text: data.text,
    })
  }

  handleVoiceReply = (data: { traceId: string; deviceId: string; voiceReply: string; latency: number }) => {
    dashboardStore.addEvent({
      id: `${data.traceId}-vr-${Date.now()}`,
      ts: Date.now(),
      type: 'voice_reply',
      traceId: data.traceId,
      deviceId: data.deviceId,
      voiceReply: data.voiceReply,
      latency: data.latency,
    })
  }

  handleAction = (data: { traceId: string; deviceId: string; actions: any[] }) => {
    dashboardStore.addEvent({
      id: `${data.traceId}-act-${Date.now()}`,
      ts: Date.now(),
      type: 'action',
      traceId: data.traceId,
      deviceId: data.deviceId,
      actions: data.actions.map((a: any) => ({
        action: a.action,
        priority: a.priority ?? 0,
        targetDevice: a.target_device || data.deviceId,
      })),
    })
  }

  handleChainError = (data: { traceId: string; error: string }) => {
    dashboardStore.addEvent({
      id: `${data.traceId}-err-${Date.now()}`,
      ts: Date.now(),
      type: 'error',
      traceId: data.traceId,
      deviceId: '',
      error: data.error,
    })
  }

  // ─── 数据拉取 ───────────────────────────────────────────

  refreshDevices = async () => {
    try {
      const devices = await getDevices()
      dashboardStore.setDevices(devices)
    } catch (e: any) {
      console.warn('[dashboard] 获取设备失败:', e.message)
    }
    this.setState({ devicesLoaded: true })
  }

  refreshScheduler = async () => {
    try {
      const stats = await getSchedulerStats()
      dashboardStore.setScheduler(stats)
    } catch {
      // 静默失败
    }
  }

  // ─── 操作处理 ───────────────────────────────────────────

  handleCommandInputChange = (e: any) => {
    dashboardStore.setCommandInput(e.detail.value)
  }

  handleExecuteCommand = async () => {
    const input = dashboardStore.commandInput.trim()
    if (!input) {
      Taro.showToast({ title: '请输入指令', icon: 'none' })
      return
    }

    dashboardStore.setExecuting(true)
    dashboardStore.setResult(null)

    try {
      const result = await executeTask(input)
      dashboardStore.setResult(result)
      dashboardStore.setCommandInput('')

      if (result.accepted) {
        Taro.showToast({ title: '任务已接受', icon: 'success' })
      }
    } catch (e: any) {
      Taro.showToast({ title: e.message || '执行失败', icon: 'none' })
    } finally {
      dashboardStore.setExecuting(false)
    }
  }

  handleQuickAction = async (action: string, label: string) => {
    // 选择目标设备（第一个在线设备）
    const onlineDevice = dashboardStore.devices.find(d => d.online)
    if (!onlineDevice) {
      Taro.showToast({ title: '无在线设备', icon: 'none' })
      return
    }

    try {
      await executeAction(onlineDevice.device_id, action)
      Taro.showToast({ title: `${label} 已发送`, icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: e.message || '发送失败', icon: 'none' })
    }
  }

  // ─── 渲染辅助 ───────────────────────────────────────────

  formatTime(ts: number): string {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  getEventDescription(event: ChainEvent): string {
    switch (event.type) {
      case 'asr':
        return `用户说: "${event.text}"`
      case 'voice_reply':
        return `回复: "${event.voiceReply}"`
      case 'action':
        return event.actions?.map(a => `${a.action}(Q${a.priority})`).join(' → ') || ''
      case 'error':
        return event.error || '未知错误'
      default:
        return ''
    }
  }

  getEventColor(type: string): string {
    switch (type) {
      case 'asr': return 'text-[#1A1A1A]'
      case 'voice_reply': return 'text-[#2D7D46]'
      case 'action': return 'text-[#B8860B]'
      case 'error': return 'text-[#C0392B]'
      default: return 'text-[#999]'
    }
  }

  getEventLabel(type: string): string {
    switch (type) {
      case 'asr': return 'ASR'
      case 'voice_reply': return '语音'
      case 'action': return '动作'
      case 'error': return '错误'
      default: return '事件'
    }
  }

  // ─── 主渲染 ─────────────────────────────────────────────

  render() {
    const { wsConnected, devices, events, scheduler, executing, lastResult, commandInput } = dashboardStore
    const { devicesLoaded } = this.state
    const onlineCount = devices.filter(d => d.online).length

    return (
      <ScrollView className="min-h-screen bg-[#FAF8F5]" scrollY>
        <View className="px-5 pt-6 pb-8">
          {/* Header */}
          <Text className="text-[11px] tracking-[0.2em] text-[#999] uppercase mb-1">Raro</Text>
          <Text className="text-2xl font-semibold text-[#1A1A1A] mb-1">控制中心</Text>
          <Text className="text-sm text-[#999] mb-5">
            具身智能设备管理
          </Text>

          {/* ─── 连接状态栏 ───────────────────────────────── */}
          <View className="bg-white rounded-xl p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <View className="flex items-center justify-between">
              <View className="flex items-center gap-2">
                <View className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-[#2D7D46]' : 'bg-[#C0392B]'}`} />
                <Text className="text-xs text-[#666]">
                  {wsConnected ? '已连接 go-kernel' : '未连接'}
                </Text>
              </View>
              <View className="flex items-center gap-3">
                <Text className="text-xs text-[#999]">
                  在线 <Text className="text-[#1A1A1A] font-medium">{onlineCount}</Text>/{devices.length}
                </Text>
                <Text className="text-[10px] text-[#BBB]" onClick={this.refreshDevices}>刷新</Text>
              </View>
            </View>
          </View>

          {/* ─── 设备列表 ─────────────────────────────────── */}
          <View className="mb-4">
            <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-3 px-1">设备</Text>
            {!devicesLoaded ? (
              <View className="py-8 items-center">
                <Text className="text-[#CCC] text-xs">加载中...</Text>
              </View>
            ) : devices.length === 0 ? (
              <View className="bg-white rounded-xl p-6 items-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <Text className="text-[#CCC] text-sm">暂无设备</Text>
                <Text className="text-[#BBB] text-[10px] mt-1">设备将在连接后自动注册</Text>
              </View>
            ) : (
              <ScrollView scrollX className="whitespace-nowrap" enhanced showScrollbar={false}>
                <View className="flex gap-3">
                  {devices.map(device => (
                    <View
                      key={device.device_id}
                      className="inline-block bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                      style={{ minWidth: '160px' }}
                    >
                      <View className="flex items-center gap-2 mb-2">
                        <View className={`w-1.5 h-1.5 rounded-full ${device.online ? 'bg-[#2D7D46]' : 'bg-[#CCC]'}`} />
                        <Text className="text-[#1A1A1A] font-medium text-sm">{device.device_id}</Text>
                      </View>
                      <Text className="text-[10px] text-[#999]">
                        {device.online ? '在线' : '离线'}
                      </Text>
                      {device.last_state && (
                        <Text className="text-[10px] text-[#BBB] mt-1">
                          状态: {device.last_state}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {/* ─── 快捷动作 ─────────────────────────────────── */}
          <View className="mb-4">
            <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-3 px-1">快捷动作</Text>
            <ScrollView scrollX className="whitespace-nowrap" enhanced showScrollbar={false}>
              <View className="flex gap-2">
                {QUICK_ACTIONS.map(item => (
                  <View
                    key={item.action}
                    className="inline-flex items-center gap-1.5 bg-white rounded-full px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    onClick={() => this.handleQuickAction(item.action, item.label)}
                  >
                    <Text className="text-sm">{item.icon}</Text>
                    <Text className="text-xs text-[#1A1A1A] font-medium">{item.label}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* ─── 自然语言指令 ─────────────────────────────── */}
          <View className="bg-white rounded-xl p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-3">自然语言指令</Text>

            <View className="flex gap-2 mb-3">
              <Input
                className="flex-1 bg-[#FAF8F5] rounded-lg px-3 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#CCC]"
                placeholder="输入指令，如：开门然后跳舞"
                value={commandInput}
                onInput={this.handleCommandInputChange}
                confirmType="send"
                onConfirm={this.handleExecuteCommand}
              />
              <Button
                className={`rounded-lg px-4 py-2.5 text-xs font-medium border-0 ${
                  executing ? 'bg-[#E5E2DD] text-[#999]' : 'bg-[#1A1A1A] text-white'
                }`}
                onClick={this.handleExecuteCommand}
                disabled={executing}
              >
                {executing ? '...' : '发送'}
              </Button>
            </View>

            {/* 执行结果 */}
            {lastResult && (
              <View className="bg-[#FAF8F5] rounded-lg p-3">
                <View className="flex items-center gap-2 mb-2">
                  <View className={`w-1.5 h-1.5 rounded-full ${lastResult.accepted ? 'bg-[#2D7D46]' : 'bg-[#C0392B]'}`} />
                  <Text className="text-xs text-[#666]">
                    {lastResult.accepted ? '已接受' : '已拒绝'} · {lastResult.trace_id.slice(0, 12)}
                  </Text>
                </View>
                {lastResult.results.map((r, i) => (
                  <View key={i} className="flex items-center gap-2 ml-3.5 mb-1">
                    <Text className="text-[10px] text-[#999]">→</Text>
                    <Text className="text-xs text-[#1A1A1A]">
                      {r.action}({r.target_device})
                    </Text>
                    <Text className={`text-[10px] ${r.status === 'ok' ? 'text-[#2D7D46]' : 'text-[#C0392B]'}`}>
                      {r.status === 'ok' ? '✓' : r.error || '✗'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ─── 实时事件流 ───────────────────────────────── */}
          <View className="bg-white rounded-xl p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <View className="flex items-center justify-between mb-3">
              <Text className="text-xs tracking-[0.15em] text-[#999] uppercase">
                实时事件 · {events.length}
              </Text>
              <Text className="text-[10px] text-[#BBB]" onClick={() => dashboardStore.events = []}>
                清空
              </Text>
            </View>

            {events.length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-[#CCC] text-xs">等待链路事件...</Text>
              </View>
            ) : (
              <View>
                {events.slice(0, 20).map(event => (
                  <View key={event.id} className="flex items-start gap-2 py-2 border-b border-[#F5F3F0] last:border-0">
                    <Text className="text-[10px] text-[#BBB] font-mono shrink-0 w-14">
                      {this.formatTime(event.ts)}
                    </Text>
                    <Text className={`text-[10px] font-medium shrink-0 w-8 ${this.getEventColor(event.type)}`}>
                      {this.getEventLabel(event.type)}
                    </Text>
                    <Text className="text-[11px] text-[#666] flex-1">
                      {this.getEventDescription(event)}
                    </Text>
                    {event.latency && event.latency > 0 && (
                      <Text className="text-[9px] text-[#BBB] font-mono shrink-0">
                        {event.latency}ms
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ─── PA-HPS 调度器 ────────────────────────────── */}
          {scheduler && (
            <View className="bg-white rounded-xl p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-3">PA-HPS 调度器</Text>

              {/* 队列长度 */}
              <View className="flex gap-4 mb-3">
                <View className="flex-1 bg-[#FAF8F5] rounded-lg p-2.5 text-center">
                  <Text className="text-[10px] text-[#BBB]">Q0 实时</Text>
                  <Text className="text-lg font-bold text-[#C0392B] font-mono">{scheduler.q0_len}</Text>
                </View>
                <View className="flex-1 bg-[#FAF8F5] rounded-lg p-2.5 text-center">
                  <Text className="text-[10px] text-[#BBB]">Q1 交互</Text>
                  <Text className="text-lg font-bold text-[#B8860B] font-mono">{scheduler.q1_len}</Text>
                </View>
                <View className="flex-1 bg-[#FAF8F5] rounded-lg p-2.5 text-center">
                  <Text className="text-[10px] text-[#BBB]">Q2 管理</Text>
                  <Text className="text-lg font-bold text-[#999] font-mono">{scheduler.q2_len}</Text>
                </View>
              </View>

              {/* 统计 */}
              <View className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono">
                <Text className="text-[#666]">处理={scheduler.processed}</Text>
                <Text className="text-[#2D7D46]">完成={scheduler.completed}</Text>
                <Text className="text-[#C0392B]">丢弃={scheduler.dropped}</Text>
                <Text className="text-[#B8860B]">老化={scheduler.aged}</Text>
              </View>
            </View>
          )}

          {/* ─── 系统架构 ─────────────────────────────────── */}
          <View className="bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Text className="text-xs tracking-[0.15em] text-[#999] uppercase mb-3">系统架构</Text>
            <View className="text-[10px] text-[#999] font-mono leading-relaxed">
              <Text>{'云端推理 → LLM 任务分解 → 认知路由器 → HFT\n'}</Text>
              <Text>{'边缘调度 → PA-HPS 三级队列 → MQTT → ESP32\n'}</Text>
              <Text>{'状态回传 → 传感器 → 网络感知 → 边缘自治\n'}</Text>
              <Text className="text-[#BBB]">{'端到端 ≤ 500ms · Q0 ≤ 20ms'}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    )
  }
}

export default Dashboard
