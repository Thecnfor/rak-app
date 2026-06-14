export interface BLEMessage {
  type: string
  status?: string
  ip?: string
  message?: string
}

/**
 * 编码 WiFi 配置为 BLE 传输的 ArrayBuffer
 * 格式: JSON { ssid, password }
 *
 * IEEE 802.11 限制: SSID ≤ 32 字节, 密码 ≤ 63 字节
 */
export function encodeWiFiConfig(ssid: string, password: string): ArrayBuffer {
  if (!ssid || ssid.trim().length === 0) {
    throw new Error('WiFi 名称不能为空')
  }
  if (!password || password.length < 8) {
    throw new Error('WiFi 密码至少 8 位')
  }
  const ssidBytes = new TextEncoder().encode(ssid).byteLength
  if (ssidBytes > 32) {
    throw new Error(`WiFi 名称过长 (${ssidBytes} > 32 字节)`)
  }
  if (password.length > 63) {
    throw new Error(`WiFi 密码过长 (${password.length} > 63 字符)`)
  }
  const payload = JSON.stringify({ ssid, password })
  const encoded = new TextEncoder().encode(payload)
  // 安全截取：避免底层 ArrayBuffer 大于实际数据
  return encoded.buffer.slice(0, encoded.byteLength)
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
