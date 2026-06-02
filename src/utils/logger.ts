export interface LogEntry {
  id: string
  timestamp: number
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR'
  message: string
  data?: any
  direction?: 'TX' | 'RX'
}

type LogCallback = (entry: LogEntry) => void

class Logger {
  private logs: LogEntry[] = []
  private listeners: LogCallback[] = []
  private counter = 0

  onLog(cb: LogCallback) {
    this.listeners.push(cb)
  }

  offLog(cb: LogCallback) {
    this.listeners = this.listeners.filter(l => l !== cb)
  }

  log(level: LogEntry['level'], message: string, data?: any, direction?: 'TX' | 'RX') {
    const entry: LogEntry = {
      id: String(++this.counter),
      timestamp: Date.now(),
      level,
      message,
      data,
      direction,
    }
    this.logs.push(entry)
    this.listeners.forEach(cb => cb(entry))
  }

  info(message: string, data?: any, direction?: 'TX' | 'RX') {
    this.log('INFO', message, data, direction)
  }

  debug(message: string, data?: any, direction?: 'TX' | 'RX') {
    this.log('DEBUG', message, data, direction)
  }

  warn(message: string, data?: any, direction?: 'TX' | 'RX') {
    this.log('WARN', message, data, direction)
  }

  error(message: string, data?: any, direction?: 'TX' | 'RX') {
    this.log('ERROR', message, data, direction)
  }

  getLogs(): LogEntry[] {
    return this.logs
  }

  clearLogs(): void {
    this.logs = []
  }

  exportLogs(): string {
    return this.logs
      .map(
        l =>
          `${this.formatTimestamp(l.timestamp)} [${l.level}]${l.direction ? ` [${l.direction}]` : ''} ${l.message}${l.data ? ' ' + JSON.stringify(l.data) : ''}`
      )
      .join('\n')
  }

  formatTimestamp(ts: number): string {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
  }
}

export const logger = new Logger()
