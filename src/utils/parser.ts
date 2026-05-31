export interface WiFiConfig {
  ssid: string
  password: string
}

export interface ConfigResult {
  type: 'config_result'
  status: 'success' | 'failed' | 'idle'
  ip?: string
  message: string
}

export type BLEMessage = ConfigResult

export function encodeWiFiConfig(ssid: string, password: string): ArrayBuffer {
  const config: WiFiConfig = { ssid, password }
  const jsonStr = JSON.stringify(config)
  return stringToArrayBuffer(jsonStr)
}

export function decodeBLEMessage(buffer: ArrayBuffer): BLEMessage | null {
  try {
    const jsonStr = arrayBufferToString(buffer)
    const data = JSON.parse(jsonStr)
    if (data && data.type === 'config_result') {
      return data as ConfigResult
    }
    return null
  } catch {
    return null
  }
}

export function arrayBufferToHex(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer)
  return Array.from(uint8Array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ')
}

export function hexToArrayBuffer(hex: string): ArrayBuffer {
  const hexStr = hex.replace(/\s/g, '')
  const buffer = new ArrayBuffer(hexStr.length / 2)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < hexStr.length; i += 2) {
    view[i / 2] = parseInt(hexStr.substr(i, 2), 16)
  }
  return buffer
}

export function arrayBufferToString(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer)
  let result = ''
  for (let i = 0; i < uint8Array.length; i++) {
    result += String.fromCharCode(uint8Array[i])
  }
  return result
}

export function stringToArrayBuffer(str: string): ArrayBuffer {
  const buffer = new ArrayBuffer(str.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < str.length; i++) {
    view[i] = str.charCodeAt(i)
  }
  return buffer
}