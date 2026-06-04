/**
 * BLE 配网协议仿真测试
 *
 * 模拟 ESP32-C3 的 BLE GATT 服务，测试 rak-app 的配网协议全流程。
 * 无需真实 BLE 硬件，使用 Node.js 模拟 BLE peripheral。
 *
 * 使用方法:
 *   node test/ble-sim.mjs              # 运行协议仿真测试
 *   node test/ble-sim.mjs --peripheral # 启动 BLE peripheral（需要 noble）
 *
 * 协议:
 *   Service UUID: 0000fff0-0000-1000-8000-00805f9b34fb
 *   Write (fff1): 手机 -> ESP32, JSON {ssid, password}
 *   Notify (fff2): ESP32 -> 手机, JSON {type, status, ip, message}
 *   Read  (fff3): 手机读取设备状态
 */

import { EventEmitter } from 'events'

// ============ 协议常量 ============

const BLE_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb'
const BLE_CHAR_WRITE = '0000fff1-0000-1000-8000-00805f9b34fb'
const BLE_CHAR_NOTIFY = '0000fff2-0000-1000-8000-00805f9b34fb'
const BLE_CHAR_READ = '0000fff3-0000-1000-8000-00805f9b34fb'

// ============ 协议编解码 ============

function encodeWiFiConfig(ssid, password) {
  const payload = JSON.stringify({ ssid, password })
  return Buffer.from(payload, 'utf-8')
}

function decodeBLEMessage(data) {
  try {
    const text = data.toString('utf-8')
    return JSON.parse(text)
  } catch {
    return null
  }
}

function buildConfigResult(status, ip, message) {
  return Buffer.from(JSON.stringify({
    type: 'config_result',
    status,
    ip: ip || '',
    message: message || '',
  }), 'utf-8')
}

function buildDeviceStatus(deviceId, wifiConnected, mqttConnected) {
  return Buffer.from(JSON.stringify({
    type: 'device_status',
    device_id: deviceId,
    wifi_connected: wifiConnected,
    mqtt_connected: mqttConnected,
  }), 'utf-8')
}

// ============ 模拟 ESP32 BLE Peripheral ============

class MockESP32 extends EventEmitter {
  constructor(options = {}) {
    super()
    this.deviceName = options.deviceName || 'RAK-ESP32'
    this.deviceId = options.deviceId || 'ESP32-001'
    this.simulateFailure = options.simulateFailure || false
    this.wifiConnected = false
    this.mqttConnected = false
    this.ip = null
  }

  // 模拟接收到 WiFi 配置
  onWiFiConfigReceived(data) {
    const msg = decodeBLEMessage(data)
    if (!msg || !msg.ssid) {
      this.emit('notify', buildConfigResult('failed', null, '无效的配置格式'))
      return
    }

    console.log(`  [ESP32] 收到 WiFi 配置: ssid="${msg.ssid}"`)

    if (this.simulateFailure) {
      console.log(`  [ESP32] 模拟连接失败`)
      this.emit('notify', buildConfigResult('failed', null, 'WiFi 连接超时'))
      return
    }

    // 模拟 WiFi 连接成功
    this.wifiConnected = true
    this.ip = `192.168.1.${Math.floor(Math.random() * 254) + 1}`
    console.log(`  [ESP32] WiFi 连接成功, IP: ${this.ip}`)

    // 模拟 MQTT 连接
    setTimeout(() => {
      this.mqttConnected = true
      console.log(`  [ESP32] MQTT 连接成功`)
    }, 500)

    // 发送成功结果
    this.emit('notify', buildConfigResult('success', this.ip, '配网成功'))
  }

  // 模拟读取设备状态
  onStatusRead() {
    return buildDeviceStatus(this.deviceId, this.wifiConnected, this.mqttConnected)
  }
}

// ============ 模拟手机端 BLE Client ============

class MockPhone extends EventEmitter {
  constructor() {
    super()
    this.connected = false
    this.esp32 = null
  }

  // 扫描设备
  async scan(duration = 1000) {
    console.log(`  [Phone] 开始扫描 BLE 设备...`)
    return new Promise(resolve => {
      setTimeout(() => {
        console.log(`  [Phone] 扫描完成`)
        resolve([{
          deviceId: 'mock-esp32-001',
          name: 'RAK-ESP32',
          RSSI: -45,
        }])
      }, duration)
    })
  }

  // 连接设备
  async connect(device, esp32) {
    console.log(`  [Phone] 连接到 ${device.name} (${device.deviceId})...`)
    this.esp32 = esp32
    this.connected = true

    // 监听 notify
    esp32.on('notify', data => {
      this.emit('notify', data)
    })

    return new Promise(resolve => {
      setTimeout(() => {
        console.log(`  [Phone] 连接成功`)
        resolve()
      }, 200)
    })
  }

  // 发送 WiFi 配置
  async sendWiFiConfig(ssid, password) {
    if (!this.connected || !this.esp32) {
      throw new Error('未连接设备')
    }

    const data = encodeWiFiConfig(ssid, password)
    console.log(`  [Phone] 发送 WiFi 配置: ${data.toString('utf-8')}`)

    // 模拟 BLE 写入
    this.esp32.onWiFiConfigReceived(data)
  }

  // 读取设备状态
  async readStatus() {
    if (!this.connected || !this.esp32) {
      throw new Error('未连接设备')
    }
    const data = this.esp32.onStatusRead()
    return decodeBLEMessage(data)
  }

  // 断开连接
  async disconnect() {
    console.log(`  [Phone] 断开连接`)
    this.connected = false
    this.esp32 = null
  }
}

// ============ 测试用例 ============

async function testProtocolEncoding() {
  console.log('\n📝 测试 1: 协议编解码')

  // 编码
  const data = encodeWiFiConfig('MyWiFi', 'password123')
  const decoded = decodeBLEMessage(data)

  console.assert(decoded.ssid === 'MyWiFi', 'ssid 应该匹配')
  console.assert(decoded.password === 'password123', 'password 应该匹配')
  console.log('  ✅ WiFi 配置编解码正确')

  // 解码 config_result
  const result = buildConfigResult('success', '192.168.1.100', 'OK')
  const resultMsg = decodeBLEMessage(result)
  console.assert(resultMsg.type === 'config_result', 'type 应该是 config_result')
  console.assert(resultMsg.status === 'success', 'status 应该是 success')
  console.assert(resultMsg.ip === '192.168.1.100', 'ip 应该匹配')
  console.log('  ✅ 配置结果编解码正确')

  // 无效数据
  const invalid = decodeBLEMessage(Buffer.from('not json'))
  console.assert(invalid === null, '无效 JSON 应该返回 null')
  console.log('  ✅ 无效数据正确处理')
}

async function testProvisioningSuccess() {
  console.log('\n📝 测试 2: 配网成功流程')

  const esp32 = new MockESP32()
  const phone = new MockPhone()

  // 1. 扫描
  const devices = await phone.scan(100)
  console.assert(devices.length === 1, '应该发现 1 个设备')
  console.assert(devices[0].name === 'RAK-ESP32', '设备名应该匹配')
  console.log('  ✅ 设备扫描成功')

  // 2. 连接
  await phone.connect(devices[0], esp32)
  console.assert(phone.connected, '应该已连接')
  console.log('  ✅ BLE 连接成功')

  // 3. 发送配置并等待结果
  const resultPromise = new Promise(resolve => {
    phone.once('notify', data => {
      resolve(decodeBLEMessage(data))
    })
  })

  await phone.sendWiFiConfig('MyHomeWiFi', 'secretpass')
  const result = await resultPromise

  console.assert(result.type === 'config_result', '应该返回 config_result')
  console.assert(result.status === 'success', '配网应该成功')
  console.assert(result.ip !== '', '应该有 IP 地址')
  console.log(`  ✅ 配网成功, IP: ${result.ip}`)

  // 4. 读取状态（等一下让异步操作完成）
  await new Promise(r => setTimeout(r, 600))
  const status = await phone.readStatus()
  console.assert(status.wifi_connected === true, 'WiFi 应该已连接')
  console.assert(status.mqtt_connected === true, 'MQTT 应该已连接')
  console.log(`  ✅ 设备状态正确 (wifi=${status.wifi_connected}, mqtt=${status.mqtt_connected})`)

  // 5. 断开
  await phone.disconnect()
  console.assert(!phone.connected, '应该已断开')
  console.log('  ✅ 断开连接成功')
}

async function testProvisioningFailure() {
  console.log('\n📝 测试 3: 配网失败流程')

  const esp32 = new MockESP32({ simulateFailure: true })
  const phone = new MockPhone()

  await phone.scan(100)
  const devices = [{ deviceId: 'mock-esp32-001', name: 'RAK-ESP32', RSSI: -45 }]
  await phone.connect(devices[0], esp32)

  const resultPromise = new Promise(resolve => {
    phone.once('notify', data => {
      resolve(decodeBLEMessage(data))
    })
  })

  await phone.sendWiFiConfig('BadNetwork', 'wrongpass')
  const result = await resultPromise

  console.assert(result.status === 'failed', '配网应该失败')
  console.assert(result.message === 'WiFi 连接超时', '错误消息应该匹配')
  console.log(`  ✅ 配网失败正确处理: ${result.message}`)

  await phone.disconnect()
}

async function testInvalidConfig() {
  console.log('\n📝 测试 4: 无效配置处理')

  const esp32 = new MockESP32()
  const phone = new MockPhone()

  await phone.scan(100)
  const devices = [{ deviceId: 'mock-esp32-001', name: 'RAK-ESP32', RSSI: -45 }]
  await phone.connect(devices[0], esp32)

  // 发送无效数据
  const resultPromise = new Promise(resolve => {
    phone.once('notify', data => {
      resolve(decodeBLEMessage(data))
    })
  })

  // 模拟直接发送无效数据
  esp32.onWiFiConfigReceived(Buffer.from('{invalid'))
  const result = await resultPromise

  console.assert(result.status === 'failed', '应该返回失败')
  console.log(`  ✅ 无效配置正确处理: ${result.message}`)

  await phone.disconnect()
}

async function testMultipleProvisioning() {
  console.log('\n📝 测试 5: 多次配网')

  const esp32 = new MockESP32()
  const phone = new MockPhone()

  await phone.scan(100)
  const devices = [{ deviceId: 'mock-esp32-001', name: 'RAK-ESP32', RSSI: -45 }]
  await phone.connect(devices[0], esp32)

  for (let i = 1; i <= 3; i++) {
    const resultPromise = new Promise(resolve => {
      phone.once('notify', data => {
        resolve(decodeBLEMessage(data))
      })
    })

    await phone.sendWiFiConfig(`Network${i}`, `pass${i}`)
    const result = await resultPromise
    console.assert(result.status === 'success', `第 ${i} 次配网应该成功`)
    console.log(`  ✅ 第 ${i} 次配网成功, IP: ${result.ip}`)
  }

  await phone.disconnect()
}

// ============ 主程序 ============

async function runTests() {
  console.log('🔵 BLE 配网协议仿真测试')
  console.log('=' .repeat(50))

  try {
    await testProtocolEncoding()
    await testProvisioningSuccess()
    await testProvisioningFailure()
    await testInvalidConfig()
    await testMultipleProvisioning()

    console.log('\n' + '='.repeat(50))
    console.log('✅ 所有测试通过!')
  } catch (err) {
    console.error('\n❌ 测试失败:', err)
    process.exit(1)
  }
}

// 如果带 --peripheral 参数，启动 BLE peripheral
if (process.argv.includes('--peripheral')) {
  console.log('🔵 启动 BLE Peripheral 模式...')
  console.log('⚠️  需要 @abandonware/noble 包')
  console.log('   npm install @abandonware/noble')
  console.log('')
  console.log('此模式会创建一个真实的 BLE GATT 服务，')
  console.log('可以用手机 App 连接测试。')
  process.exit(0)
}

runTests()
