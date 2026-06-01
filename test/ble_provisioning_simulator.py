import asyncio
import json
import logging
import signal
import sys
from datetime import datetime
from typing import Optional

from bleak import BleakScanner, BleakGATTCharacteristic
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('ble_simulator.log', encoding='utf-8'),
    ]
)
logger = logging.getLogger(__name__)

BLE_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb'
BLE_CHAR_WRITE_UUID = '0000fff1-0000-1000-8000-00805f9b34fb'
BLE_CHAR_NOTIFY_UUID = '0000fff2-0000-1000-8000-00805f9b34fb'
BLE_CHAR_READ_UUID = '0000fff3-0000-1000-8000-00805f9b34fb'

DEVICE_NAME = 'ESP32C3-Provision'


class BLEProvisioningSimulator:
    def __init__(self):
        self.running = False
        self.connected_clients: set[str] = set()
        self.wifi_config: Optional[dict] = None
        self.scan_results: list[BLEDevice] = []

    async def start(self):
        self.running = True
        logger.info(f'BLE 配网模拟器启动')
        logger.info(f'设备名称: {DEVICE_NAME}')
        logger.info(f'服务 UUID: {BLE_SERVICE_UUID}')
        logger.info('')
        logger.info('等待小程序连接...')
        logger.info('请在小程序中扫描并连接此设备')
        logger.info('')

        try:
            while self.running:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
        finally:
            logger.info('模拟器已停止')

    def stop(self):
        self.running = False

    async def scan_nearby_devices(self, duration: float = 5.0):
        logger.info(f'扫描附近的 BLE 设备 ({duration}秒)...')
        devices = await BleakScanner.discover(timeout=duration)
        self.scan_results = devices

        logger.info(f'发现 {len(devices)} 个设备:')
        for i, device in enumerate(devices, 1):
            logger.info(f'  {i}. {device.name or "未知设备"} ({device.address}) RSSI: {device.rssi}dBm')
        return devices

    def process_wifi_config(self, data: bytes) -> dict:
        try:
            json_str = data.decode('utf-8')
            config = json.loads(json_str)
            logger.info(f'收到 WiFi 配置:')
            logger.info(f'  SSID: {config.get("ssid", "N/A")}')
            logger.info(f'  密码: {config.get("password", "N/A")}')
            logger.info(f'  时间戳: {config.get("timestamp", "N/A")}')
            self.wifi_config = config
            return config
        except Exception as e:
            logger.error(f'解析 WiFi 配置失败: {e}')
            return {}

    def generate_config_result(self, success: bool = True) -> bytes:
        if success:
            result = {
                'type': 'config_result',
                'status': 'success',
                'ip': '192.168.1.100',
                'message': 'WiFi 连接成功'
            }
        else:
            result = {
                'type': 'config_result',
                'status': 'failed',
                'message': 'WiFi 连接失败，请检查密码'
            }
        return json.dumps(result).encode('utf-8')

    def generate_device_status(self) -> bytes:
        status = {
            'type': 'device_status',
            'wifiConnected': self.wifi_config is not None,
            'ip': '192.168.1.100' if self.wifi_config else None,
            'rssi': -45,
            'uptime': 12345
        }
        return json.dumps(status).encode('utf-8')


async def main():
    simulator = BLEProvisioningSimulator()

    def signal_handler(sig, frame):
        logger.info('收到退出信号，正在停止...')
        simulator.stop()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print('='*60)
    print('  ESP32-C3 BLE 配网模拟器')
    print('='*60)
    print()
    print('此脚本模拟 ESP32-C3 设备的 BLE 配网服务')
    print('用于测试小程序的蓝牙配网功能')
    print()
    print('BLE 服务配置:')
    print(f'  服务 UUID: {BLE_SERVICE_UUID}')
    print(f'  Write 特征值: {BLE_CHAR_WRITE_UUID}')
    print(f'  Notify 特征值: {BLE_CHAR_NOTIFY_UUID}')
    print(f'  Read 特征值: {BLE_CHAR_READ_UUID}')
    print()
    print('使用方法:')
    print('1. 保持此脚本运行')
    print('2. 在小程序中扫描 BLE 设备')
    print('3. 找到 "ESP32C3-Provision" 设备并连接')
    print('4. 发送 WiFi 配置进行测试')
    print()
    print('注意: 此模拟器仅用于开发测试，不会创建真实的 BLE 服务')
    print('      实际配网需要使用真实的 ESP32-C3 硬件')
    print()
    print('='*60)
    print()

    logger.info('模拟器初始化完成')
    logger.info('提示: 使用 Ctrl+C 停止模拟器')
    logger.info('')

    await simulator.start()


if __name__ == '__main__':
    asyncio.run(main())