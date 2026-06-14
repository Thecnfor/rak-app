import { observable, action } from 'mobx'
import type { DeviceInfo, SchedulerStats, TaskResult } from '../services/kernel'

// ─── 链路事件类型 ──────────────────────────────────────────

export interface ChainEvent {
  id: string
  ts: number
  type: 'asr' | 'voice_reply' | 'action' | 'error' | 'scheduler'
  traceId: string
  deviceId: string
  text?: string
  voiceReply?: string
  actions?: { action: string; priority: number; targetDevice: string }[]
  latency?: number
  error?: string
}

// ─── Store ─────────────────────────────────────────────────

const MAX_EVENTS = 50

class DashboardStore {
  // 设备列表
  @observable devices: DeviceInfo[] = []

  // WebSocket 连接状态
  @observable wsConnected: boolean = false

  // 实时链路事件
  @observable events: ChainEvent[] = []

  // PA-HPS 调度器统计
  @observable scheduler: SchedulerStats | null = null

  // 任务执行状态
  @observable executing: boolean = false

  // 最近一次执行结果
  @observable lastResult: TaskResult | null = null

  // 自然语言指令输入
  @observable commandInput: string = ''

  @action setDevices(devices: DeviceInfo[]) {
    this.devices = devices
  }

  @action setWsConnected(connected: boolean) {
    this.wsConnected = connected
  }

  @action addEvent(event: ChainEvent) {
    this.events = [event, ...this.events].slice(0, MAX_EVENTS)
  }

  @action setScheduler(stats: SchedulerStats) {
    this.scheduler = stats
  }

  @action setExecuting(executing: boolean) {
    this.executing = executing
  }

  @action setResult(result: TaskResult | null) {
    this.lastResult = result
  }

  @action setCommandInput(input: string) {
    this.commandInput = input
  }

  @action clearEvents() {
    this.events = []
  }

  @action reset() {
    this.devices = []
    this.wsConnected = false
    this.events = []
    this.scheduler = null
    this.executing = false
    this.lastResult = null
    this.commandInput = ''
  }
}

export const dashboardStore = new DashboardStore()
export default dashboardStore
