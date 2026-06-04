/**
 * 真实 BLE 配网测试 — 连接 ESP32 并发送 WiFi 配置
 *
 * 使用 @abandonware/noble 进行真实 BLE 通信。
 * 需要 root 权限或 bluetooth 组。
 *
 * 使用方法:
 *   sudo node test/ble-real.mjs
 *   sudo node test/ble-real.mjs --ssid MyWiFi --password mypass
 */

import noble from '@abandonware/noble'

const BLE_SERVICE_UUID = 'fff0'
const BLE_CHAR_WRITE_UUID = 'fff1'
const BLE_CHAR_NOTIFY_UUID = 'fff2'
const BLE_CHAR_READ_UUID = 'fff3'

const WIFI_SSID = process.argv.includes('--ssid')
  ? process.argv[process.argv.indexOf('--ssid') + 1]
  : 'Xrak'
const WIFI_PASS = process.argv.includes('--password')
  ? process.argv[process.argv.indexOf('--password') + 1]
  : 'xrak123456'

console.log('🔵 BLE 真实配网测试')
console.log(`  WiFi SSID: ${WIFI_SSID}`)
console.log(`  目标设备: RakESP32`)
console.log('')

let targetPeripheral = null
let writeChar = null
let notifyChar = null

noble.on('stateChange', state => {
  console.log(`[Noble] 状态: ${state}`)
  if (state === 'poweredOn') {
    console.log('[Noble] 开始扫描...')
    noble.startScanning([BLE_SERVICE_UUID], false)
  } else {
    noble.stopScanning()
  }
})

noble.on('discover', peripheral => {
  const name = peripheral.advertisement.localName
  console.log(`[Scan] 发现: ${name || 'unnamed'} (${peripheral.id}) RSSI=${peripheral.rssi}`)

  if (name === 'RakESP32' || name === 'RAK-ESP32') {
    targetPeripheral = peripheral
    console.log(`[Scan] ✅ 找到目标设备! 停止扫描...`)
    noble.stopScanning()
    connectToDevice(peripheral)
  }
})

async function connectToDevice(peripheral) {
  console.log(`[BLE] 连接到 ${peripheral.advertisement.localName}...`)

  peripheral.on('disconnect', () => {
    console.log('[BLE] 断开连接')
    process.exit(0)
  })

  peripheral.connect(err => {
    if (err) {
      console.error(`[BLE] 连接失败: ${err}`)
      process.exit(1)
    }
    console.log('[BLE] ✅ 连接成功!')
    discoverServices(peripheral)
  })
}

function discoverServices(peripheral) {
  peripheral.discoverServices([BLE_SERVICE_UUID], (err, services) => {
    if (err) {
      console.error(`[BLE] 服务发现失败: ${err}`)
      return
    }

    console.log(`[BLE] 发现 ${services.length} 个服务`)
    const service = services[0]
    console.log(`[BLE] Service UUID: ${service.uuid}`)

    service.discoverCharacteristics([], (err, chars) => {
      if (err) {
        console.error(`[BLE] 特征发现失败: ${err}`)
        return
      }

      console.log(`[BLE] 发现 ${chars.length} 个特征:`)
      for (const char of chars) {
        console.log(`  - ${char.uuid} (${char.properties.join(', ')})`)
        if (char.uuid === BLE_CHAR_WRITE_UUID) writeChar = char
        if (char.uuid === BLE_CHAR_NOTIFY_UUID) notifyChar = char
      }

      if (!writeChar || !notifyChar) {
        console.error('[BLE] 缺少必要的特征!')
        peripheral.disconnect()
        return
      }

      // 订阅 notify
      subscribeAndSend(peripheral)
    })
  })
}

function subscribeAndSend(peripheral) {
  console.log('[BLE] 订阅 notify 特征...')

  notifyChar.subscribe(err => {
    if (err) {
      console.error(`[BLE] 订阅失败: ${err}`)
      return
    }
    console.log('[BLE] ✅ 已订阅 notify')

    // 监听通知
    notifyChar.on('data', data => {
      try {
        const msg = JSON.parse(data.toString('utf-8'))
        console.log(`[BLE] 📩 收到通知:`, JSON.stringify(msg))

        if (msg.type === 'config_result') {
          if (msg.status === 'success') {
            console.log(`\n🎉 配网成功!`)
            console.log(`  IP: ${msg.ip}`)
            console.log(`  消息: ${msg.message}`)
          } else {
            console.log(`\n❌ 配网失败: ${msg.message}`)
          }
          // 断开
          setTimeout(() => {
            console.log('[BLE] 断开连接...')
            peripheral.disconnect()
          }, 1000)
        }
      } catch (e) {
        console.log(`[BLE] 原始数据: ${data.toString('hex')}`)
      }
    })

    // 发送 WiFi 配置
    setTimeout(() => sendWiFiConfig(), 500)
  })
}

function sendWiFiConfig() {
  const config = JSON.stringify({ ssid: WIFI_SSID, password: WIFI_PASS })
  const data = Buffer.from(config, 'utf-8')

  console.log(`[BLE] 发送 WiFi 配置: ${config}`)
  writeChar.write(data, false, err => {
    if (err) {
      console.error(`[BLE] 写入失败: ${err}`)
    } else {
      console.log('[BLE] ✅ WiFi 配置已发送')
    }
  })
}

// 超时处理
setTimeout(() => {
  console.error('\n⏰ 超时! 未找到设备')
  process.exit(1)
}, 30000)
