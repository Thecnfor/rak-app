"""
BLE Scan v2 - 更全面的扫描，按名称和 UUID 搜索
"""
import asyncio
import sys
from bleak import BleakScanner

TARGET_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb"
TARGET_NAME = "RakESP32"


async def scan():
    print("=" * 60)
    print("BLE 深度扫描")
    print(f"目标名称: {TARGET_NAME}")
    print(f"目标 Service UUID: {TARGET_SERVICE_UUID}")
    print("=" * 60)

    # 方法1: 按名称检测
    print("\n[1/3] 按名称检测 'RakESP32'（10 秒）...")
    device = await BleakScanner.find_device_by_name(TARGET_NAME, timeout=10.0)
    if device:
        print(f"  找到! 地址: {device.address}, 名称: {device.name}")
    else:
        print("  未按名称找到。")

    # 方法2: 按 Service UUID 过滤检测
    print("\n[2/3] 按 Service UUID 检测（10 秒）...")
    device2 = await BleakScanner.find_device_by_filter(
        lambda d, ad: TARGET_SERVICE_UUID in (ad.service_uuids or []),
        timeout=10.0,
    )
    if device2:
        print(f"  找到! 地址: {device2.address}, 名称: {device2.name}")
    else:
        print("  未按 UUID 找到。")

    # 方法3: 全量扫描，列出所有设备的完整信息
    print("\n[3/3] 全量扫描（12 秒），列出所有设备详情...")
    devices = await BleakScanner.discover(timeout=12.0, return_adv=True)

    if not devices:
        print("  未发现任何设备。")
        return

    print(f"\n  共发现 {len(devices)} 个设备\n")

    # 按信号强度排序
    sorted_devs = sorted(devices.items(), key=lambda x: x[1][1].rssi or -999, reverse=True)

    for addr, (device, adv_data) in sorted_devs:
        name = device.name or adv_data.local_name or "(未知)"
        rssi = adv_data.rssi
        service_uuids = adv_data.service_uuids or []
        tx_power = adv_data.tx_power
        mfr_data = adv_data.manufacturer_data

        # 高亮可能的 ESP32 设备
        is_esp32 = False
        if TARGET_NAME.lower() in name.lower():
            is_esp32 = True
        if "esp" in name.lower():
            is_esp32 = True
        if TARGET_SERVICE_UUID in service_uuids:
            is_esp32 = True
        # 检查 manufacturer data 中是否有 Espressif OUI (0x02E5)
        if 0x02E5 in mfr_data:
            is_esp32 = True

        marker = " *** 可能是目标设备! ***" if is_esp32 else ""

        print(f"  {name:<30} | {addr:<20} | RSSI: {rssi:>4} dBm | UUIDs: {len(service_uuids)}{marker}")
        if service_uuids:
            for uuid in service_uuids:
                print(f"    Service: {uuid}")
        if mfr_data:
            for company_id, data in mfr_data.items():
                print(f"    MfrData: company=0x{company_id:04X} data={data.hex()}")
        if tx_power is not None:
            print(f"    TX Power: {tx_power} dBm")

    # 尝试连接名称最像 ESP32 的设备
    esp32_candidates = [
        (addr, dev, adv) for addr, (dev, adv) in devices.items()
        if any(kw in (dev.name or adv.local_name or "").lower() for kw in ["rak", "esp", "raktesp"])
        or TARGET_SERVICE_UUID in (adv.service_uuids or [])
    ]

    if esp32_candidates:
        addr, dev, adv = esp32_candidates[0]
        name = dev.name or adv.local_name or "(未知)"
        print(f"\n  尝试连接候选设备: {name} ({addr})...")
        try:
            from bleak import BleakClient
            async with BleakClient(addr, timeout=10.0) as client:
                print(f"  已连接: {client.is_connected}")
                print("\n  GATT 服务:")
                for service in client.services:
                    print(f"\n  Service: {service.uuid}")
                    for char in service.characteristics:
                        props = ", ".join(char.properties)
                        print(f"    Char: {char.uuid}  [{props}]")
                        if "read" in char.properties:
                            try:
                                val = await client.read_gatt_char(char.uuid)
                                print(f"      值: {val}")
                            except Exception as e:
                                print(f"      读取失败: {e}")
        except Exception as e:
            print(f"  连接失败: {e}")


if __name__ == "__main__":
    asyncio.run(scan())
