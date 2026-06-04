export interface BLEMessage {
  type: string
  status?: string
  ip?: string
  message?: string
}

/**
 * 编码 WiFi 配置为 BLE 传输的 ArrayBuffer
 * 格式: JSON { ssid, password }
 */
export function encodeWiFiConfig(ssid: string, password: string): ArrayBuffer {
  const payload = JSON.stringify({ ssid, password })
  const encoder = new TextEncoder()
  return encoder.encode(payload).buffer
}

/**
 * 解码 BLE 接收的数据为消息对象
 */
export function decodeBLEMessage(data: ArrayBuffer): BLEMessage | null {
  try {
    const decoder = new TextDecoder()
    const text = decoder.decode(new Uint8Array(data))
    return JSON.parse(text) as BLEMessage
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
