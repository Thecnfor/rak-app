import Taro from '@tarojs/taro'

// go-kernel 服务地址（Hak 服务器）
const KERNEL_BASE = 'http://116.205.183.125:8080'

// ─── 类型定义 ───────────────────────────────────────────────

export interface DeviceInfo {
  device_id: string
  online: boolean
  last_state: string
  last_seen_at: string
}

export interface SchedulerStats {
  q0_len: number
  q1_len: number
  q2_len: number
  processed: number
  completed: number
  dropped: number
  aged: number
}

export interface HealthStatus {
  status: string
  uptime: string
  ws_clients: number
  scheduler: SchedulerStats
  nodes: { total: number; online: number }
  router: { devices: number; ann_size: number }
}

export interface TaskDescriptor {
  action: string
  params: Record<string, unknown>
  priority: number
  target_device: string
  deadline: string
}

export interface FlowTableEntry {
  action: string
  target_device: string
  priority: number
}

export interface RouteResult {
  task_descriptors: TaskDescriptor[]
  flow_table: FlowTableEntry[]
}

export interface TaskResultItem {
  action: string
  target_device: string
  status: string
  error?: string
}

export interface TaskResult {
  accepted: boolean
  trace_id: string
  results: TaskResultItem[]
  routing: RouteResult
  scheduler: SchedulerStats
}

export interface RakMessage {
  version: string
  type: 'action' | 'state' | 'error'
  trace_id: string
  source: string
  target: string
  action?: string
  params?: Record<string, unknown>
  data?: Record<string, unknown>
  timestamp: number
}

// ─── 工具函数 ───────────────────────────────────────────────

function generateTraceId(): string {
  return 'rak-app-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, data?: any): Promise<T> {
  try {
    const res = await Taro.request({
      url: `${KERNEL_BASE}${path}`,
      method,
      data,
      header: { 'Content-Type': 'application/json' },
      timeout: 10000,
    })
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as T
    }
    throw new Error(`HTTP ${res.statusCode}: ${JSON.stringify(res.data)}`)
  } catch (error: any) {
    console.error(`[kernel] ${method} ${path} 失败:`, error.message)
    throw error
  }
}

// ─── API 方法 ───────────────────────────────────────────────

/** 获取所有设备 */
export async function getDevices(): Promise<DeviceInfo[]> {
  return request<DeviceInfo[]>('GET', '/api/v1/devices')
}

/** 获取单个设备 */
export async function getDevice(deviceId: string): Promise<DeviceInfo> {
  return request<DeviceInfo>('GET', `/api/v1/device/${deviceId}`)
}

/** 自然语言任务执行（完整管线：认知路由 → PA-HPS → gRPC → MQTT） */
export async function executeTask(input: string, traceId?: string): Promise<TaskResult> {
  return request<TaskResult>('POST', '/api/v1/task/execute', {
    input,
    trace_id: traceId || generateTraceId(),
  })
}

/** 单动作执行（直接发送到指定设备） */
export async function executeAction(deviceId: string, action: string, params?: Record<string, unknown>): Promise<void> {
  const msg: RakMessage = {
    version: 'v0',
    type: 'action',
    trace_id: generateTraceId(),
    source: 'rak-app:mini-program',
    target: `esp32:${deviceId}`,
    action,
    params: { device_id: deviceId, ...params },
    timestamp: Math.floor(Date.now() / 1000),
  }
  await request('POST', '/api/v1/action/execute', msg)
}

/** 认知路由（NL → 任务描述，不执行） */
export async function routeNL(input: string): Promise<RouteResult> {
  return request<RouteResult>('POST', '/api/v1/route', {
    input,
    trace_id: generateTraceId(),
  })
}

/** 获取 PA-HPS 调度器统计 */
export async function getSchedulerStats(): Promise<SchedulerStats> {
  return request<SchedulerStats>('GET', '/api/debug/scheduler')
}

/** 健康检查 */
export async function getHealth(): Promise<HealthStatus> {
  return request<HealthStatus>('GET', '/api/health')
}
