"""
BLE Scan Script - 扫描 ESP32-C3 配网设备
扫描附近 BLE 设备，过滤出暴露 FFF0 服务的设备
"""
import asyncio
import sys
from bleak import BleakScanner

# 目标 Service UUID（ESP32 配网服务）
TARGET_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb"


async def scan():
    print("=" * 60)
    print("BLE 设备扫描")
    print(f"目标 Service UUID: {TARGET_SERVICE_UUID}")
    print("=" * 60)

    print("\n[1/2] 扫描所有 BLE 设备（8 秒）...")
    devices = await BleakScanner.discover(timeout=8.0, return_adv=True)

    if not devices:
        print("  未发现任何 BLE 设备。")
        print("  请确认：")
        print("    - Windows 蓝牙已开启")
        print("    - ESP32 设备已通电并在广播")
        return

    print(f"\n  共发现 {len(devices)} 个设备：\n")
    print(f"  {'地址':<20} {'RSSI':>6}  {'名称':<30}  {'服务 UUID'}")
    print(f"  {'-'*20} {'-'*6}  {'-'*30}  {'-'*40}")

    target_found = None

    for addr, (device, adv_data) in devices.items():
        name = device.name or adv_data.local_name or "(未知)"
        rssi = adv_data.rssi if adv_data.rssi else "N/A"
        service_uuids = adv_data.service_uuids or []
        services_str = ", ".join(service_uuids) if service_uuids else "(无)"

        marker = ""
        if TARGET_SERVICE_UUID in service_uuids:
            marker = " <<< 目标设备!"
            target_found = (addr, name, rssi, adv_data)

        print(f"  {addr:<20} {str(rssi):>6}  {name:<30}  {services_str}{marker}")

    print()

    if target_found:
        addr, name, rssi, adv_data = target_found
        print("[2/2] 发现目标 ESP32 设备，尝试连接...")
        print(f"  地址: {addr}")
        print(f"  名称: {name}")
        print(f"  RSSI: {rssi}")

        try:
            from bleak import BleakClient
            async with BleakClient(addr, timeout=10.0) as client:
                print(f"\n  已连接: {client.is_connected}")

                print("\n  服务列表:")
                for service in client.services:
                    print(f"\n  Service: {service.uuid} ({service.description})")
                    for char in service.characteristics:
                        props = ", ".join(char.properties)
                        print(f"    Characteristic: {char.uuid}")
                        print(f"      属性: {props}")
                        print(f"      描述: {char.description}")

                        # 尝试读取可读特征值
                        if "read" in char.properties:
                            try:
                                value = await client.read_gatt_char(char.uuid)
                                print(f"      当前值: {value.hex()} ({value})")
                            except Exception as e:
                                print(f"      读取失败: {e}")

                print("\n  连接测试成功!")
        except Exception as e:
            print(f"\n  连接失败: {e}")
            print("  可能原因: 设备不在范围内 / 连接被拒绝 / 超时")
    else:
        print("[2/2] 未发现目标 ESP32 设备（Service UUID 不匹配）。")
        print("  请确认 ESP32 固件正在广播 FFF0 服务。")


if __name__ == "__main__":
    asyncio.run(scan())
