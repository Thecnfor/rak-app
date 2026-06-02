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
