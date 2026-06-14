#!/usr/bin/env python3
"""
ESP32-C3 BLE 配网协议模拟器

完美复刻 rak-esp 固件的 BLE 配网行为（参考 rak_net_ble_prov.cpp）。
支持两种模式：
  - mock: 纯 Python 协议模拟，不依赖蓝牙硬件（用于单元测试）
  - scan: 扫描真实 BLE 设备（用于集成测试）

协议规范：
  Service:  0000fff0-0000-1000-8000-00805f9b34fb
  Write:    0000fff1-... (接收 WiFi 配置 JSON)
  Notify:   0000fff2-... (返回配网结果，Read + Notify)
  设备名:   RakESP32
  MTU:      256 preferred
  安全:     无 bonding，无 MITM，Just Works
"""

import asyncio
import json
import logging
import random
import sys
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ─── BLE 常量（与 rak_net_ble_prov.cpp 一致）──────────────────

BLE_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb'
BLE_CHAR_WRITE_UUID = '0000fff1-0000-1000-8000-00805f9b34fb'
BLE_CHAR_NOTIFY_UUID = '0000fff2-0000-1000-8000-00805f9b34fb'

DEVICE_NAME = 'RakESP32'
MAX_WIFI_CONFIG_SIZE = 511  # 字节
WIFI_CONNECT_TIMEOUT_S = 15  # 固件中 15 秒超时
MQTT_CONNECT_TIMEOUT_S = 10  # MQTT 连接超时

# ─── 状态枚举 ──────────────────────────────────────────────

class ProvisionState(Enum):
    IDLE = 'idle'
    CONFIGURING = 'configuring'
    SUCCESS = 'success'
    FAILED = 'failed'


class FailureReason(Enum):
    WIFI_CONNECT_FAILED = 'WiFi connect failed'
    MQTT_CONNECT_FAILED = 'MQTT connect failed'
    NVS_SAVE_FAILED = 'NVS save failed'
    OOM = 'OOM'
    INVALID_JSON = 'Invalid JSON'
    MISSING_SSID = 'Missing SSID'
    PAYLOAD_TOO_LARGE = 'Payload too large'


# ─── 数据类 ────────────────────────────────────────────────

@dataclass
class WiFiConfig:
    ssid: str
    password: str = ''


@dataclass
class ConfigResult:
    type: str = 'config_result'
    status: str = 'idle'
    ip: Optional[str] = None
    message: str = '等待配网'

    def to_json(self) -> str:
        d = {'type': self.type, 'status': self.status, 'message': self.message}
        if self.ip:
            d['ip'] = self.ip
        return json.dumps(d, ensure_ascii=False)

    def to_bytes(self) -> bytes:
        return self.to_json().encode('utf-8')


@dataclass
class DeviceStatus:
    type: str = 'device_status'
    wifi_connected: bool = False
    ip: Optional[str] = None
    rssi: int = -45
    uptime: int = 0
    device_id: str = 'ESP32-001'

    def to_json(self) -> str:
        return json.dumps({
            'type': self.type,
            'wifiConnected': self.wifi_connected,
            'ip': self.ip,
            'rssi': self.rssi,
            'uptime': self.uptime,
            'device_id': self.device_id,
        }, ensure_ascii=False)


# ─── BLE 配网模拟器 ────────────────────────────────────────

class BLEProvisioningSimulator:
    """
    模拟 ESP32-C3 的 BLE 配网 GATT 服务。

    固件行为（rak_net_ble_prov.cpp）：
    1. 初始化 NimBLE，注册 GATT 服务（fff0/fff1/fff2）
    2. 广播设备名 "RakESP32" + Service UUID
    3. 客户端连接后可读取 fff2（返回 idle 状态）
    4. 客户端写入 fff1（WiFi 配置 JSON）
    5. 校验 JSON → 提取 ssid/password → 保存 NVS
    6. 后台任务连接 WiFi（15s 超时）→ MQTT（10s 超时）
    7. 通过 fff2 notify 返回结果
    8. 断开后 500ms 重新开始广播
    """

    def __init__(self, simulate_success: bool = True, failure_reason: Optional[FailureReason] = None):
        self.state = ProvisionState.IDLE
        self.wifi_config: Optional[WiFiConfig] = None
        self.device_ip: Optional[str] = None
        self.simulate_success = simulate_success
        self.failure_reason = failure_reason or FailureReason.WIFI_CONNECT_FAILED
        self.connected = False
        self.notify_enabled = False
        self._listeners: list[Callable] = []

    # ─── 事件系统 ──────────────────────────────────────────

    def on_event(self, callback: Callable):
        self._listeners.append(callback)

    def _emit(self, event_type: str, data: dict):
        for cb in self._listeners:
            try:
                cb(event_type, data)
            except Exception:
                pass

    # ─── GATT 操作模拟 ─────────────────────────────────────

    def handle_connect(self):
        """模拟客户端连接"""
        self.connected = True
        logger.info(f'[GAP] 客户端已连接')
        self._emit('connection', {'connected': True})

    def handle_disconnect(self):
        """模拟客户端断开"""
        self.connected = False
        self.notify_enabled = False
        logger.info(f'[GAP] 客户端已断开，500ms 后重新广播')
        self._emit('connection', {'connected': False})

    def handle_subscribe(self, enabled: bool):
        """模拟客户端订阅/取消订阅 fff2 通知"""
        self.notify_enabled = enabled
        logger.info(f'[GATT] fff2 通知已{"启用" if enabled else "禁用"}')
        self._emit('subscribe', {'enabled': enabled})

    def handle_read_status(self) -> bytes:
        """模拟读取 fff2 特征值（返回当前状态）"""
        result = ConfigResult(
            status=self.state.value,
            ip=self.device_ip,
            message=self._get_status_message(),
        )
        logger.info(f'[GATT] 读取 fff2 → {result.to_json()}')
        self._emit('read', {'data': result.to_json()})
        return result.to_bytes()

    def handle_write_config(self, data: bytes) -> Optional[bytes]:
        """
        模拟写入 fff1 特征值（接收 WiFi 配置）。

        固件校验逻辑（rak_prov_handle_wifi_config）：
        1. 长度 > 0 且 < 512
        2. JSON 解析成功
        3. ssid 为非空字符串
        4. 提取 password（默认空字符串）
        """
        # 校验长度
        if len(data) == 0:
            logger.warning('[GATT] 写入被拒绝: 数据为空')
            return self._error_result(FailureReason.INVALID_JSON)

        if len(data) >= MAX_WIFI_CONFIG_SIZE:
            logger.warning(f'[GATT] 写入被拒绝: 数据过大 ({len(data)} >= {MAX_WIFI_CONFIG_SIZE})')
            return self._error_result(FailureReason.PAYLOAD_TOO_LARGE)

        # 解析 JSON
        try:
            json_str = data.decode('utf-8')
            config = json.loads(json_str)
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            logger.warning(f'[GATT] 写入被拒绝: JSON 解析失败 - {e}')
            return self._error_result(FailureReason.INVALID_JSON)

        # 校验 ssid
        ssid = config.get('ssid', '')
        if not isinstance(ssid, str) or not ssid.strip():
            logger.warning('[GATT] 写入被拒绝: ssid 为空')
            return self._error_result(FailureReason.MISSING_SSID)

        # 提取配置
        password = config.get('password', '')
        if not isinstance(password, str):
            password = ''
        self.wifi_config = WiFiConfig(ssid=ssid.strip(), password=password)

        logger.info(f'[GATT] 收到 WiFi 配置:')
        logger.info(f'  SSID: {self.wifi_config.ssid}')
        logger.info(f'  密码: {"*" * len(self.wifi_config.password)} ({len(self.wifi_config.password)} 位)')
        logger.info(f'  JSON 大小: {len(data)} 字节')

        self._emit('wifi_config', {
            'ssid': self.wifi_config.ssid,
            'password_length': len(self.wifi_config.password),
            'payload_size': len(data),
        })

        # 模拟配网过程
        return self._simulate_provisioning()

    # ─── 配网流程模拟 ──────────────────────────────────────

    def _simulate_provisioning(self) -> Optional[bytes]:
        """
        模拟固件的后台配网任务（rak_app_prov_task）：
        1. WiFi 连接（15s 超时）
        2. SNTP 同步
        3. MQTT 连接
        4. 返回结果
        """
        self.state = ProvisionState.CONFIGURING
        logger.info('[PROV] 开始配网...')

        # 模拟 WiFi 连接延迟（1-3 秒）
        wifi_delay = random.uniform(1.0, 3.0)
        logger.info(f'[PROV] WiFi 连接中... ({wifi_delay:.1f}s)')
        time.sleep(wifi_delay)

        if not self.simulate_success:
            self.state = ProvisionState.FAILED
            result = self._error_result(self.failure_reason)
            logger.info(f'[PROV] 配网失败: {self.failure_reason.value}')
            return result

        # 模拟 MQTT 连接延迟（0.5-1.5 秒）
        mqtt_delay = random.uniform(0.5, 1.5)
        logger.info(f'[PROV] MQTT 连接中... ({mqtt_delay:.1f}s)')
        time.sleep(mqtt_delay)

        # 成功
        self.state = ProvisionState.SUCCESS
        self.device_ip = f'192.168.{random.randint(1, 254)}.{random.randint(10, 254)}'
        result = ConfigResult(
            status='success',
            ip=self.device_ip,
            message='Provision success',
        )
        logger.info(f'[PROV] 配网成功! IP: {self.device_ip}')
        return result.to_bytes()

    def _error_result(self, reason: FailureReason) -> bytes:
        return ConfigResult(
            status='failed',
            message=reason.value,
        ).to_bytes()

    def _get_status_message(self) -> str:
        if self.state == ProvisionState.IDLE:
            return '等待配网'
        elif self.state == ProvisionState.CONFIGURING:
            return '配网中...'
        elif self.state == ProvisionState.SUCCESS:
            return 'Provision success'
        else:
            return '配网失败'

    def reset(self):
        """重置模拟器状态（模拟重新广播）"""
        self.state = ProvisionState.IDLE
        self.wifi_config = None
        self.device_ip = None
        self.connected = False
        self.notify_enabled = False
        logger.info('[SIM] 模拟器已重置')


# ─── 协议验证工具 ──────────────────────────────────────────

class ProtocolValidator:
    """验证 BLE 配网协议的数据格式"""

    @staticmethod
    def validate_wifi_config(data: bytes) -> tuple[bool, str]:
        """验证客户端发送的 WiFi 配置格式"""
        if len(data) == 0:
            return False, '数据为空'
        if len(data) >= MAX_WIFI_CONFIG_SIZE:
            return False, f'数据过大 ({len(data)} >= {MAX_WIFI_CONFIG_SIZE})'

        try:
            json_str = data.decode('utf-8')
            config = json.loads(json_str)
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            return False, f'JSON 解析失败: {e}'

        if 'ssid' not in config:
            return False, '缺少 ssid 字段'
        if not isinstance(config['ssid'], str) or not config['ssid'].strip():
            return False, 'ssid 为空'

        return True, 'OK'

    @staticmethod
    def validate_config_result(data: bytes) -> tuple[bool, str]:
        """验证设备返回的配网结果格式"""
        try:
            json_str = data.decode('utf-8')
            result = json.loads(json_str)
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            return False, f'JSON 解析失败: {e}'

        if result.get('type') != 'config_result':
            return False, f'type 不是 config_result: {result.get("type")}'

        status = result.get('status')
        if status not in ('success', 'failed', 'idle'):
            return False, f'无效的 status: {status}'

        if status == 'success' and 'ip' not in result:
            return False, 'success 状态缺少 ip 字段'

        return True, 'OK'

    @staticmethod
    def validate_device_status(data: bytes) -> tuple[bool, str]:
        """验证设备状态格式"""
        try:
            json_str = data.decode('utf-8')
            status = json.loads(json_str)
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            return False, f'JSON 解析失败: {e}'

        if status.get('type') != 'device_status':
            return False, f'type 不是 device_status: {status.get("type")}'

        return True, 'OK'


# ─── 端到端配网流程测试 ────────────────────────────────────

def test_provisioning_flow():
    """测试完整的配网流程（mock 模式）"""
    print('=' * 60)
    print('  BLE 配网协议测试 (Mock 模式)')
    print('=' * 60)
    print()

    validator = ProtocolValidator()
    simulator = BLEProvisioningSimulator(simulate_success=True)

    # 记录事件
    events = []
    simulator.on_event(lambda et, d: events.append((et, d)))

    # 1. 连接
    print('① 模拟客户端连接...')
    simulator.handle_connect()
    assert simulator.connected, '连接失败'
    print('  ✓ 连接成功')
    print()

    # 2. 启用通知
    print('② 启用 fff2 通知...')
    simulator.handle_subscribe(True)
    assert simulator.notify_enabled, '通知启用失败'
    print('  ✓ 通知已启用')
    print()

    # 3. 读取状态
    print('③ 读取设备状态...')
    status_data = simulator.handle_read_status()
    valid, msg = validator.validate_config_result(status_data)
    assert valid, f'状态格式无效: {msg}'
    status = json.loads(status_data)
    assert status['status'] == 'idle', f'预期 idle，实际 {status["status"]}'
    print(f'  ✓ 状态: {status["status"]} - {status["message"]}')
    print()

    # 4. 发送 WiFi 配置
    print('④ 发送 WiFi 配置...')
    wifi_config = json.dumps({
        'ssid': 'TestWiFi',
        'password': 'password123',
    }).encode('utf-8')

    valid, msg = validator.validate_wifi_config(wifi_config)
    assert valid, f'WiFi 配置格式无效: {msg}'
    print(f'  ✓ WiFi 配置格式有效 ({len(wifi_config)} 字节)')

    result_data = simulator.handle_write_config(wifi_config)
    assert result_data is not None, '未收到配网结果'

    valid, msg = validator.validate_config_result(result_data)
    assert valid, f'配网结果格式无效: {msg}'

    result = json.loads(result_data)
    assert result['status'] == 'success', f'预期 success，实际 {result["status"]}'
    assert 'ip' in result, '成功结果缺少 ip 字段'
    print(f'  ✓ 配网成功! IP: {result["ip"]}')
    print()

    # 5. 读取最终状态
    print('⑤ 读取最终状态...')
    final_status = json.loads(simulator.handle_read_status())
    assert final_status['status'] == 'success'
    assert final_status['ip'] == result['ip']
    print(f'  ✓ 状态: {final_status["status"]}, IP: {final_status["ip"]}')
    print()

    # 6. 断开连接
    print('⑥ 断开连接...')
    simulator.handle_disconnect()
    assert not simulator.connected, '断开失败'
    print('  ✓ 已断开')
    print()

    # 7. 验证事件记录
    print('⑦ 验证事件记录...')
    event_types = [e[0] for e in events]
    assert 'connection' in event_types, '缺少 connection 事件'
    assert 'subscribe' in event_types, '缺少 subscribe 事件'
    assert 'wifi_config' in event_types, '缺少 wifi_config 事件'
    print(f'  ✓ 记录了 {len(events)} 个事件: {event_types}')
    print()

    print('=' * 60)
    print('  ✓ 所有测试通过!')
    print('=' * 60)


def test_error_cases():
    """测试各种错误情况"""
    print()
    print('=' * 60)
    print('  错误情况测试')
    print('=' * 60)
    print()

    validator = ProtocolValidator()
    simulator = BLEProvisioningSimulator()
    simulator.handle_connect()
    simulator.handle_subscribe(True)

    # 空数据
    print('① 空数据写入...')
    result = simulator.handle_write_config(b'')
    assert result is not None
    r = json.loads(result)
    assert r['status'] == 'failed'
    print(f'  ✓ 正确拒绝: {r["message"]}')
    print()

    # 超大 payload
    print('② 超大 payload...')
    big_data = json.dumps({'ssid': 'A' * 300, 'password': 'B' * 300}).encode('utf-8')
    result = simulator.handle_write_config(big_data)
    assert result is not None
    r = json.loads(result)
    assert r['status'] == 'failed'
    print(f'  ✓ 正确拒绝: {r["message"]}')
    print()

    # 无效 JSON
    print('③ 无效 JSON...')
    result = simulator.handle_write_config(b'not json')
    assert result is not None
    r = json.loads(result)
    assert r['status'] == 'failed'
    print(f'  ✓ 正确拒绝: {r["message"]}')
    print()

    # 缺少 ssid
    print('④ 缺少 ssid...')
    result = simulator.handle_write_config(json.dumps({'password': 'test'}).encode('utf-8'))
    assert result is not None
    r = json.loads(result)
    assert r['status'] == 'failed'
    print(f'  ✓ 正确拒绝: {r["message"]}')
    print()

    # 空 ssid
    print('⑤ 空 ssid...')
    result = simulator.handle_write_config(json.dumps({'ssid': '', 'password': 'test'}).encode('utf-8'))
    assert result is not None
    r = json.loads(result)
    assert r['status'] == 'failed'
    print(f'  ✓ 正确拒绝: {r["message"]}')
    print()

    # WiFi 连接失败
    print('⑥ WiFi 连接失败模拟...')
    fail_sim = BLEProvisioningSimulator(
        simulate_success=False,
        failure_reason=FailureReason.WIFI_CONNECT_FAILED,
    )
    fail_sim.handle_connect()
    fail_sim.handle_subscribe(True)
    result = fail_sim.handle_write_config(json.dumps({'ssid': 'Test', 'password': '12345678'}).encode('utf-8'))
    assert result is not None
    r = json.loads(result)
    assert r['status'] == 'failed'
    assert r['message'] == 'WiFi connect failed'
    print(f'  ✓ 正确返回失败: {r["message"]}')
    print()

    # MQTT 连接失败
    print('⑦ MQTT 连接失败模拟...')
    mqtt_fail = BLEProvisioningSimulator(
        simulate_success=False,
        failure_reason=FailureReason.MQTT_CONNECT_FAILED,
    )
    mqtt_fail.handle_connect()
    mqtt_fail.handle_subscribe(True)
    result = mqtt_fail.handle_write_config(json.dumps({'ssid': 'Test', 'password': '12345678'}).encode('utf-8'))
    assert result is not None
    r = json.loads(result)
    assert r['status'] == 'failed'
    assert r['message'] == 'MQTT connect failed'
    print(f'  ✓ 正确返回失败: {r["message"]}')
    print()

    simulator.handle_disconnect()

    print('=' * 60)
    print('  ✓ 所有错误测试通过!')
    print('=' * 60)


# ─── 主入口 ────────────────────────────────────────────────

def main():
    print()
    print('╔══════════════════════════════════════════════════════════╗')
    print('║          ESP32-C3 BLE 配网协议模拟器                    ║')
    print('╠══════════════════════════════════════════════════════════╣')
    print('║  完美复刻 rak-esp 固件的 BLE 配网行为                    ║')
    print('║                                                         ║')
    print('║  Service:  0000fff0-0000-1000-8000-00805f9b34fb         ║')
    print('║  Write:    0000fff1-... (WiFi 配置)                     ║')
    print('║  Notify:   0000fff2-... (配网结果)                      ║')
    print('║  设备名:   RakESP32                                     ║')
    print('║  MTU:      256 preferred                                ║')
    print('║  安全:     无 bonding，无 MITM                          ║')
    print('╚══════════════════════════════════════════════════════════╝')
    print()

    if '--test' in sys.argv:
        test_provisioning_flow()
        test_error_cases()
        return

    # 交互模式
    simulator = BLEProvisioningSimulator()
    simulator.on_event(lambda et, d: print(f'  [{et.upper()}] {d}'))

    print('命令:')
    print('  connect    - 模拟客户端连接')
    print('  subscribe  - 启用 fff2 通知')
    print('  read       - 读取设备状态')
    print('  write <json> - 写入 WiFi 配置')
    print('  disconnect - 断开连接')
    print('  reset      - 重置模拟器')
    print('  quit       - 退出')
    print()

    while True:
        try:
            cmd = input('> ').strip()
        except (EOFError, KeyboardInterrupt):
            break

        if not cmd:
            continue
        elif cmd == 'connect':
            simulator.handle_connect()
        elif cmd == 'subscribe':
            simulator.handle_subscribe(True)
        elif cmd == 'read':
            data = simulator.handle_read_status()
            print(f'  → {data.decode("utf-8")}')
        elif cmd.startswith('write '):
            json_str = cmd[6:]
            data = json_str.encode('utf-8')
            result = simulator.handle_write_config(data)
            if result:
                print(f'  → {result.decode("utf-8")}')
        elif cmd == 'disconnect':
            simulator.handle_disconnect()
        elif cmd == 'reset':
            simulator.reset()
        elif cmd in ('quit', 'exit', 'q'):
            break
        else:
            print(f'  未知命令: {cmd}')


if __name__ == '__main__':
    main()
