export type LogLevel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR'

export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  message: string
  data?: unknown
  direction?: 'TX' | 'RX'
}

type LogListener = (entry: LogEntry) => void

const MAX_LOGS = 500

class Logger {
  private logs: LogEntry[] = []
  private listeners: LogListener[] = []
  private idCounter: number = 0

  onLog(listener: LogListener) {
    this.listeners.push(listener)
  }

  offLog(listener: LogListener) {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  private addLog(level: LogLevel, message: string, data?: unknown, direction?: 'TX' | 'RX') {
    const entry: LogEntry = {
      id: `log_${++this.idCounter}`,
      timestamp: Date.now(),
      level,
      message,
      data,
      direction,
    }
    this.logs.push(entry)
    // 超出上限时丢弃最旧的日志
    if (this.logs.length > MAX_LOGS) {
      this.logs.splice(0, this.logs.length - MAX_LOGS)
    }
    this.listeners.forEach(listener => listener(entry))
    return entry
  }

  info(message: string, data?: unknown, direction?: 'TX' | 'RX') {
    return this.addLog('INFO', message, data, direction)
  }

  debug(message: string, data?: unknown, direction?: 'TX' | 'RX') {
    return this.addLog('DEBUG', message, data, direction)
  }

  warn(message: string, data?: unknown, direction?: 'TX' | 'RX') {
    return this.addLog('WARN', message, data, direction)
  }

  error(message: string, data?: unknown, direction?: 'TX' | 'RX') {
    return this.addLog('ERROR', message, data, direction)
  }

  tx(message: string, data?: unknown) {
    return this.addLog('DEBUG', message, data, 'TX')
  }

  rx(message: string, data?: unknown) {
    return this.addLog('DEBUG', message, data, 'RX')
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clearLogs() {
    this.logs = []
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level)
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const seconds = date.getSeconds().toString().padStart(2, '0')
    const ms = date.getMilliseconds().toString().padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${ms}`
  }

  exportLogs(): string {
    return this.logs
      .map(log => {
        const time = this.formatTimestamp(log.timestamp)
        const dir = log.direction ? `[${log.direction}]` : ''
        const data = log.data ? ` | ${JSON.stringify(log.data)}` : ''
        return `[${time}][${log.level}]${dir} ${log.message}${data}`
      })
      .join('\n')
  }
}

export const logger = new Logger()
export default Logger
