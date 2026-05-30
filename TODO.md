# rak-app 任务清单

> 状态：基本完成，仅需维护

---

## 当前状态

BLE 配网小程序已完成：设备扫描 → WiFi 配置 → 状态机 → 超时处理。Python BLE 模拟器可用。

---

## 维护任务

- [ ] M1. 修复 `services/ble.ts` 和 `utils/parser.ts` 之间的 buffer 工具函数重复
- [ ] M2. 确认 MobX store (`store/provisioning.ts`) 是否可以删除（当前无页面引用）
- [ ] M3. BLE 连接稳定性测试（不同手机型号兼容性）

---

## 无新增功能需求

rak-app 在比赛架构中属于"辅助工具"层，配网功能已完成。如有新增需求（如设备管理），应在 Xra-space 前端实现。
