#!/usr/bin/env python3
"""
BLE 配网协议测试

测试 ESP32-C3 的 BLE 配网流程，验证：
1. 设备广播（Service UUID 0000fff0-...）
2. GATT 服务发现
3. WiFi 配置写入（fff1）
4. 配网结果通知（fff2）
5. 设备状态读取（fff2）

使用方法：
  python test_provisioning.py          # 运行 mock 单元测试
  python test_provisioning.py --ble    # 运行真实 BLE 测试（需蓝牙适配器）
  python test_provisioning.py --scan   # 扫描附近 BLE 设备
"""

import asyncio
import json
import sys
import unittest
from unittest.mock import MagicMock, patch

from ble_provisioning_simulator import (
    BLEProvisioningSimulator,
    ConfigResult,
    FailureReason,
    ProtocolValidator,
    ProvisionState,
    WiFiConfig,
    BLE_SERVICE_UUID,
    BLE_CHAR_WRITE_UUID,
    BLE_CHAR_NOTIFY_UUID,
    DEVICE_NAME,
)


# ─── 协议格式验证测试 ─────────────────────────────────────

class TestProtocolValidator(unittest.TestCase):
    """测试协议数据格式验证"""

    def setUp(self):
        self.validator = ProtocolValidator()

    # WiFi 配置验证

    def test_valid_wifi_config(self):
        data = json.dumps({'ssid': 'MyWiFi', 'password': 'pass1234'}).encode('utf-8')
        valid, msg = self.validator.validate_wifi_config(data)
        self.assertTrue(valid)
        self.assertEqual(msg, 'OK')

    def test_wifi_config_no_password(self):
        """开放网络（无密码）也应通过"""
        data = json.dumps({'ssid': 'OpenWiFi', 'password': ''}).encode('utf-8')
        valid, msg = self.validator.validate_wifi_config(data)
        self.assertTrue(valid)

    def test_wifi_config_chinese_ssid(self):
        """中文 SSID 测试"""
        data = json.dumps({'ssid': '我的WiFi', 'password': '12345678'}).encode('utf-8')
        valid, msg = self.validator.validate_wifi_config(data)
        self.assertTrue(valid)

    def test_wifi_config_special_chars(self):
        """特殊字符密码测试"""
        data = json.dumps({'ssid': 'Test', 'password': '!@#$%^&*()_+'}).encode('utf-8')
        valid, msg = self.validator.validate_wifi_config(data)
        self.assertTrue(valid)

    def test_wifi_config_empty_data(self):
        valid, msg = self.validator.validate_wifi_config(b'')
        self.assertFalse(valid)
        self.assertIn('空', msg)

    def test_wifi_config_invalid_json(self):
        valid, msg = self.validator.validate_wifi_config(b'not json')
        self.assertFalse(valid)
        self.assertIn('JSON', msg)

    def test_wifi_config_missing_ssid(self):
        data = json.dumps({'password': 'test'}).encode('utf-8')
        valid, msg = self.validator.validate_wifi_config(data)
        self.assertFalse(valid)
        self.assertIn('ssid', msg)

    def test_wifi_config_empty_ssid(self):
        data = json.dumps({'ssid': '', 'password': 'test'}).encode('utf-8')
        valid, msg = self.validator.validate_wifi_config(data)
        self.assertFalse(valid)
        self.assertIn('空', msg)

    def test_wifi_config_whitespace_ssid(self):
        data = json.dumps({'ssid': '   ', 'password': 'test'}).encode('utf-8')
        valid, msg = self.validator.validate_wifi_config(data)
        self.assertFalse(valid)

    # 配网结果验证

    def test_valid_config_result_success(self):
        data = json.dumps({
            'type': 'config_result',
            'status': 'success',
            'ip': '192.168.1.100',
            'message': 'Provision success',
        }).encode('utf-8')
        valid, msg = self.validator.validate_config_result(data)
        self.assertTrue(valid)

    def test_valid_config_result_failed(self):
        data = json.dumps({
            'type': 'config_result',
            'status': 'failed',
            'message': 'WiFi connect failed',
        }).encode('utf-8')
        valid, msg = self.validator.validate_config_result(data)
        self.assertTrue(valid)

    def test_valid_config_result_idle(self):
        data = json.dumps({
            'type': 'config_result',
            'status': 'idle',
            'message': '等待配网',
        }).encode('utf-8')
        valid, msg = self.validator.validate_config_result(data)
        self.assertTrue(valid)

    def test_config_result_success_missing_ip(self):
        data = json.dumps({
            'type': 'config_result',
            'status': 'success',
            'message': 'OK',
        }).encode('utf-8')
        valid, msg = self.validator.validate_config_result(data)
        self.assertFalse(valid)
        self.assertIn('ip', msg)

    def test_config_result_invalid_status(self):
        data = json.dumps({
            'type': 'config_result',
            'status': 'unknown',
            'message': 'test',
        }).encode('utf-8')
        valid, msg = self.validator.validate_config_result(data)
        self.assertFalse(valid)

    def test_config_result_wrong_type(self):
        data = json.dumps({
            'type': 'device_status',
            'status': 'success',
        }).encode('utf-8')
        valid, msg = self.validator.validate_config_result(data)
        self.assertFalse(valid)


# ─── 模拟器功能测试 ────────────────────────────────────────

class TestBLEProvisioningSimulator(unittest.TestCase):
    """测试 BLE 配网模拟器"""

    def setUp(self):
        self.sim = BLEProvisioningSimulator(simulate_success=True)
        self.events = []
        self.sim.on_event(lambda et, d: self.events.append((et, d)))

    # 基本状态

    def test_initial_state(self):
        self.assertEqual(self.sim.state, ProvisionState.IDLE)
        self.assertFalse(self.sim.connected)
        self.assertIsNone(self.sim.wifi_config)
        self.assertIsNone(self.sim.device_ip)

    # 连接/断开

    def test_connect_disconnect(self):
        self.sim.handle_connect()
        self.assertTrue(self.sim.connected)
        self.assertTrue(any(e[0] == 'connection' and e[1]['connected'] for e in self.events))

        self.events.clear()
        self.sim.handle_disconnect()
        self.assertFalse(self.sim.connected)
        self.assertFalse(self.sim.notify_enabled)

    # 通知订阅

    def test_subscribe_enable(self):
        self.sim.handle_connect()
        self.sim.handle_subscribe(True)
        self.assertTrue(self.sim.notify_enabled)
        self.assertTrue(any(e[0] == 'subscribe' and e[1]['enabled'] for e in self.events))

    def test_subscribe_disable(self):
        self.sim.handle_connect()
        self.sim.handle_subscribe(True)
        self.sim.handle_subscribe(False)
        self.assertFalse(self.sim.notify_enabled)

    # 读取状态

    def test_read_status_idle(self):
        data = self.sim.handle_read_status()
        result = json.loads(data)
        self.assertEqual(result['type'], 'config_result')
        self.assertEqual(result['status'], 'idle')
        self.assertEqual(result['message'], '等待配网')
        self.assertNotIn('ip', result)

    def test_read_status_after_success(self):
        self.sim.handle_connect()
        self.sim.handle_subscribe(True)
        config = json.dumps({'ssid': 'Test', 'password': 'pass1234'}).encode('utf-8')
        self.sim.handle_write_config(config)

        status = json.loads(self.sim.handle_read_status())
        self.assertEqual(status['status'], 'success')
        self.assertIn('ip', status)

    # WiFi 配置写入

    def test_provisioning_success(self):
        self.sim.handle_connect()
        self.sim.handle_subscribe(True)

        config = json.dumps({'ssid': 'TestWiFi', 'password': 'pass1234'}).encode('utf-8')
        result_data = self.sim.handle_write_config(config)

        self.assertIsNotNone(result_data)
        result = json.loads(result_data)
        self.assertEqual(result['type'], 'config_result')
        self.assertEqual(result['status'], 'success')
        self.assertIn('ip', result)
        self.assertEqual(self.sim.state, ProvisionState.SUCCESS)

    def test_provisioning_failure_wifi(self):
        sim = BLEProvisioningSimulator(
            simulate_success=False,
            failure_reason=FailureReason.WIFI_CONNECT_FAILED,
        )
        sim.handle_connect()
        sim.handle_subscribe(True)

        config = json.dumps({'ssid': 'BadWiFi', 'password': 'wrong'}).encode('utf-8')
        result = json.loads(sim.handle_write_config(config))

        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['message'], 'WiFi connect failed')
        self.assertNotIn('ip', result)

    def test_provisioning_failure_mqtt(self):
        sim = BLEProvisioningSimulator(
            simulate_success=False,
            failure_reason=FailureReason.MQTT_CONNECT_FAILED,
        )
        sim.handle_connect()
        sim.handle_subscribe(True)

        config = json.dumps({'ssid': 'Test', 'password': 'pass1234'}).encode('utf-8')
        result = json.loads(sim.handle_write_config(config))

        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['message'], 'MQTT connect failed')

    # 错误处理

    def test_write_empty_data(self):
        self.sim.handle_connect()
        result = json.loads(self.sim.handle_write_config(b''))
        self.assertEqual(result['status'], 'failed')

    def test_write_invalid_json(self):
        self.sim.handle_connect()
        result = json.loads(self.sim.handle_write_config(b'not json'))
        self.assertEqual(result['status'], 'failed')

    def test_write_missing_ssid(self):
        self.sim.handle_connect()
        data = json.dumps({'password': 'test'}).encode('utf-8')
        result = json.loads(self.sim.handle_write_config(data))
        self.assertEqual(result['status'], 'failed')

    def test_write_empty_ssid(self):
        self.sim.handle_connect()
        data = json.dumps({'ssid': '', 'password': 'test'}).encode('utf-8')
        result = json.loads(self.sim.handle_write_config(data))
        self.assertEqual(result['status'], 'failed')

    # 重置

    def test_reset(self):
        self.sim.handle_connect()
        self.sim.handle_subscribe(True)
        config = json.dumps({'ssid': 'Test', 'password': 'pass1234'}).encode('utf-8')
        self.sim.handle_write_config(config)

        self.sim.reset()
        self.assertEqual(self.sim.state, ProvisionState.IDLE)
        self.assertIsNone(self.sim.wifi_config)
        self.assertIsNone(self.sim.device_ip)
        self.assertFalse(self.sim.connected)
        self.assertFalse(self.sim.notify_enabled)

    # 事件记录

    def test_events_emitted(self):
        self.sim.handle_connect()
        self.assertTrue(any(e[0] == 'connection' for e in self.events))

        self.sim.handle_subscribe(True)
        self.assertTrue(any(e[0] == 'subscribe' for e in self.events))

        self.sim.handle_read_status()
        self.assertTrue(any(e[0] == 'read' for e in self.events))

        config = json.dumps({'ssid': 'Test', 'password': 'pass1234'}).encode('utf-8')
        self.sim.handle_write_config(config)
        self.assertTrue(any(e[0] == 'wifi_config' for e in self.events))


# ─── ConfigResult 数据类测试 ──────────────────────────────

class TestConfigResult(unittest.TestCase):

    def test_success_format(self):
        result = ConfigResult(status='success', ip='192.168.1.100', message='OK')
        data = json.loads(result.to_json())
        self.assertEqual(data['type'], 'config_result')
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['ip'], '192.168.1.100')
        self.assertEqual(data['message'], 'OK')

    def test_failed_format(self):
        result = ConfigResult(status='failed', message='WiFi connect failed')
        data = json.loads(result.to_json())
        self.assertNotIn('ip', data)
        self.assertEqual(data['status'], 'failed')

    def test_idle_format(self):
        result = ConfigResult()
        data = json.loads(result.to_json())
        self.assertEqual(data['status'], 'idle')
        self.assertEqual(data['message'], '等待配网')

    def test_bytes_encoding(self):
        result = ConfigResult(status='success', ip='10.0.0.1', message='成功')
        b = result.to_bytes()
        self.assertIsInstance(b, bytes)
        decoded = json.loads(b.decode('utf-8'))
        self.assertEqual(decoded['message'], '成功')

    def test_ensure_ascii_false(self):
        """确保中文不被转义"""
        result = ConfigResult(status='idle', message='等待配网')
        json_str = result.to_json()
        self.assertIn('等待配网', json_str)
        self.assertNotIn('\\u', json_str)


# ─── 真实 BLE 测试（可选）─────────────────────────────────

async def scan_for_esp32():
    """扫描附近的 ESP32 BLE 设备"""
    from bleak import BleakScanner

    print('正在扫描 BLE 设备...')
    print(f'目标设备名: {DEVICE_NAME}')
    print(f'目标 Service UUID: {BLE_SERVICE_UUID}')
    print()

    devices = await BleakScanner.discover(timeout=10.0)
    print(f'发现 {len(devices)} 个设备:')
    print()

    esp32_found = False
    for device in devices:
        name = device.name or '未知设备'
        rssi = device.rssi
        addr = device.address
        marker = ''
        if name == DEVICE_NAME:
            marker = ' ← 目标设备!'
            esp32_found = True
        print(f'  {name:30s} {addr:20s} RSSI: {rssi}dBm{marker}')

    print()
    if esp32_found:
        print(f'✓ 找到目标设备 {DEVICE_NAME}!')
    else:
        print(f'✗ 未找到 {DEVICE_NAME}')
        print('  提示: 确保 ESP32 已开机且处于配网模式')
        print('  如果设备之前已配网，需要先擦除 NVS: idf.py erase-flash')

    return esp32_found


async def test_ble_real():
    """真实 BLE 配网测试"""
    from bleak import BleakScanner, BleakClient

    print('正在扫描 ESP32 设备...')
    device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=10.0)

    if not device:
        print(f'✗ 未找到 {DEVICE_NAME}，跳过真实 BLE 测试')
        return False

    print(f'✓ 找到设备: {device.name} ({device.address})')
    print()

    async with BleakClient(device) as client:
        print(f'已连接，MTU: {client.mtu_size}')

        # 发现服务
        services = client.services
        print(f'发现 {len(list(services))} 个服务:')

        target_service = None
        for service in services:
            print(f'  Service: {service.uuid}')
            if service.uuid == BLE_SERVICE_UUID:
                target_service = service
                for char in service.characteristics:
                    props = ', '.join(char.properties)
                    print(f'    Char: {char.uuid} [{props}]')

        if not target_service:
            print(f'✗ 未找到目标服务 {BLE_SERVICE_UUID}')
            return False

        print()
        print('开始配网测试...')
        print()

        # 读取初始状态
        print('① 读取设备状态...')
        status_data = await client.read_gatt_char(BLE_CHAR_NOTIFY_UUID)
        status = json.loads(status_data.decode('utf-8'))
        print(f'  状态: {status}')
        print()

        # 启用通知
        print('② 启用 fff2 通知...')
        notification_received = asyncio.Event()
        notification_data = None

        def on_notify(sender, data):
            nonlocal notification_data
            notification_data = data
            notification_received.set()

        await client.start_notify(BLE_CHAR_NOTIFY_UUID, on_notify)
        print('  ✓ 通知已启用')
        print()

        # 写入 WiFi 配置
        print('③ 写入 WiFi 配置...')
        wifi_config = json.dumps({
            'ssid': 'TestNetwork',
            'password': 'test12345678',
        }).encode('utf-8')
        await client.write_gatt_char(BLE_CHAR_WRITE_UUID, wifi_config)
        print(f'  ✓ 已写入 ({len(wifi_config)} 字节)')
        print()

        # 等待通知
        print('④ 等待配网结果...')
        try:
            await asyncio.wait_for(notification_received.wait(), timeout=30.0)
            result = json.loads(notification_data.decode('utf-8'))
            print(f'  结果: {result}')
            print()
            if result.get('status') == 'success':
                print(f'  ✓ 配网成功! IP: {result.get("ip")}')
            else:
                print(f'  ✗ 配网失败: {result.get("message")}')
        except asyncio.TimeoutError:
            print('  ✗ 超时未收到结果')

        await client.stop_notify(BLE_CHAR_NOTIFY_UUID)

    return True


# ─── 主入口 ────────────────────────────────────────────────

def main():
    if '--scan' in sys.argv:
        asyncio.run(scan_for_esp32())
        return

    if '--ble' in sys.argv:
        print('=' * 60)
        print('  BLE 配网真实测试')
        print('=' * 60)
        print()
        success = asyncio.run(test_ble_real())
        if not success:
            print()
            print('提示: 真实 BLE 测试需要:')
            print('  1. 蓝牙适配器已开启')
            print('  2. ESP32 设备已开机且在广播')
            print('  3. 设备处于配网模式（NVS 无存储的 WiFi 凭据）')
        return

    # 默认运行 mock 单元测试
    print('=' * 60)
    print('  BLE 配网协议单元测试 (Mock 模式)')
    print('=' * 60)
    print()

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestProtocolValidator))
    suite.addTests(loader.loadTestsFromTestCase(TestBLEProvisioningSimulator))
    suite.addTests(loader.loadTestsFromTestCase(TestConfigResult))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print()
    if result.wasSuccessful():
        print('✓ 所有测试通过!')
    else:
        print(f'✗ {len(result.failures)} 个测试失败, {len(result.errors)} 个错误')

    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(main() or 0)
