import asyncio
import json
import unittest
from unittest.mock import MagicMock, patch

from ble_provisioning_simulator import BLEProvisioningSimulator


class TestBLEProvisioningSimulator(unittest.TestCase):
    def setUp(self):
        self.simulator = BLEProvisioningSimulator()

    def test_process_wifi_config_valid(self):
        # ESP32 expects: {"ssid": "...", "password": "..."}
        config = {
            'ssid': 'TestWiFi',
            'password': 'password123'
        }
        data = json.dumps(config).encode('utf-8')
        result = self.simulator.process_wifi_config(data)
        self.assertEqual(result['ssid'], 'TestWiFi')
        self.assertEqual(result['password'], 'password123')

    def test_process_wifi_config_invalid(self):
        data = b'invalid json'
        result = self.simulator.process_wifi_config(data)
        self.assertEqual(result, {})

    def test_generate_config_result_success(self):
        data = self.simulator.generate_config_result(success=True)
        result = json.loads(data.decode('utf-8'))
        self.assertEqual(result['type'], 'config_result')
        self.assertEqual(result['status'], 'success')
        self.assertIn('ip', result)

    def test_generate_config_result_failure(self):
        data = self.simulator.generate_config_result(success=False)
        result = json.loads(data.decode('utf-8'))
        self.assertEqual(result['type'], 'config_result')
        self.assertEqual(result['status'], 'failed')
        self.assertNotIn('ip', result)

    def test_generate_device_status_disconnected(self):
        data = self.simulator.generate_device_status()
        result = json.loads(data.decode('utf-8'))
        self.assertEqual(result['type'], 'device_status')
        self.assertFalse(result['wifiConnected'])
        self.assertIsNone(result['ip'])

    def test_generate_device_status_connected(self):
        self.simulator.wifi_config = {'ssid': 'TestWiFi'}
        data = self.simulator.generate_device_status()
        result = json.loads(data.decode('utf-8'))
        self.assertTrue(result['wifiConnected'])
        self.assertIsNotNone(result['ip'])


class TestProtocol(unittest.TestCase):
    def test_wifi_config_format(self):
        # ESP32 expects: {"ssid": "...", "password": "..."}
        config = {
            'ssid': 'MyWiFi',
            'password': 'mypassword'
        }
        json_str = json.dumps(config)
        data = json_str.encode('utf-8')
        decoded = json.loads(data.decode('utf-8'))
        self.assertNotIn('type', decoded)
        self.assertEqual(decoded['ssid'], 'MyWiFi')
        self.assertEqual(decoded['password'], 'mypassword')

    def test_config_result_format(self):
        result = {
            'type': 'config_result',
            'status': 'success',
            'ip': '192.168.1.100',
            'message': '连接成功'
        }
        json_str = json.dumps(result)
        data = json_str.encode('utf-8')
        decoded = json.loads(data.decode('utf-8'))
        self.assertEqual(decoded['type'], 'config_result')
        self.assertEqual(decoded['status'], 'success')
        self.assertEqual(decoded['ip'], '192.168.1.100')

    def test_device_status_format(self):
        status = {
            'type': 'device_status',
            'wifiConnected': True,
            'ip': '192.168.1.100',
            'rssi': -50,
            'uptime': 60000
        }
        json_str = json.dumps(status)
        data = json_str.encode('utf-8')
        decoded = json.loads(data.decode('utf-8'))
        self.assertEqual(decoded['type'], 'device_status')
        self.assertTrue(decoded['wifiConnected'])
        self.assertEqual(decoded['rssi'], -50)


if __name__ == '__main__':
    unittest.main()