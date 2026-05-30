import { Component, PropsWithChildren } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import './index.css'

interface TutorialState {
  expandedSection: number | null
}

class Tutorial extends Component<PropsWithChildren, TutorialState> {
  state: TutorialState = {
    expandedSection: null,
  }

  toggleSection = (index: number) => {
    this.setState({
      expandedSection: this.state.expandedSection === index ? null : index,
    })
  }

  render() {
    const { expandedSection } = this.state

    const sections = [
      {
        title: '准备工作',
        content: [
          '确保 ESP32-C3 开发板已烧录配网固件',
          '确保手机蓝牙已开启',
          '确保微信已获取蓝牙权限',
          '准备好要连接的 WiFi 名称和密码',
        ],
      },
      {
        title: '配网流程',
        content: [
          '进入"设备"页面，点击"开始扫描"',
          '等待扫描到 ESP32-C3 设备',
          '点击设备进行连接',
          '连接成功后进入"配网"页面',
          '输入 WiFi 名称和密码',
          '点击"开始配网"发送配置',
          '等待设备返回配网结果',
          '配网成功后设备将自动连接网络',
        ],
      },
      {
        title: 'BLE 协议说明',
        content: [
          '服务 UUID: 0000fff0-0000-1000-8000-00805f9b34fb',
          '',
          '特征值:',
          'Write (fff1): 写入 WiFi 配置',
          'Notify (fff2): 接收配网结果',
          'Read (fff3): 读取设备状态',
          '',
          '数据格式: JSON over BLE',
        ],
      },
      {
        title: '常见问题',
        content: [
          '扫描不到设备？确保 ESP32-C3 已上电且处于配网模式',
          '连接失败？尝试靠近设备，确保距离在 5 米以内',
          '配网失败？检查 WiFi 名称和密码是否正确，确保是 2.4GHz',
          '配网成功但无法联网？检查路由器是否正常工作',
          '如何重新配网？在调试页面点击"重新配网"按钮',
        ],
      },
    ]

    return (
      <View className="min-h-screen bg-[#FAF8F5]">
        <ScrollView className="px-5 pt-6" scrollY>
          {/* Header */}
          <Text className="text-[11px] tracking-[0.2em] text-[#999] uppercase mb-1">Raro</Text>
          <Text className="text-2xl font-semibold text-[#1A1A1A] mb-1">使用教程</Text>
          <Text className="text-sm text-[#999] mb-6">
            ESP32-C3 蓝牙配网指南
          </Text>

          {/* Sections */}
          {sections.map((section, index) => (
            <View
              key={index}
              className="bg-white rounded-xl mb-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
            >
              <View
                className="p-4 flex justify-between items-center"
                onClick={() => this.toggleSection(index)}
              >
                <View className="flex items-center gap-3">
                  <Text className="text-[10px] text-[#CCC] font-mono w-4">
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Text className="text-sm text-[#1A1A1A] font-medium">{section.title}</Text>
                </View>
                <Text className="text-[#CCC] text-xs">
                  {expandedSection === index ? '−' : '+'}
                </Text>
              </View>

              {expandedSection === index && (
                <View className="px-4 pb-4 border-t border-[#F5F3F0]">
                  <View className="ml-7 mt-2">
                    {section.content.map((line, lineIndex) => (
                      <Text
                        key={lineIndex}
                        className={`text-xs leading-relaxed ${
                          line.startsWith('0000')
                            ? 'text-[#999] font-mono text-[10px]'
                            : line === ''
                            ? 'h-2 block'
                            : 'text-[#666]'
                        }`}
                      >
                        {line || ' '}
                      </Text>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ))}

          {/* Quick Reference */}
          <View className="bg-[#1A1A1A] rounded-xl p-4 mb-4">
            <Text className="text-[10px] tracking-[0.15em] text-[#666] uppercase mb-3">BLE UUID 速查</Text>
            <Text className="text-[10px] text-[#999] font-mono leading-loose">
              Service · 0000fff0-0000-1000-8000-00805f9b34fb{'\n'}
              Write   · 0000fff1-0000-1000-8000-00805f9b34fb{'\n'}
              Notify  · 0000fff2-0000-1000-8000-00805f9b34fb{'\n'}
              Read    · 0000fff3-0000-1000-8000-00805f9b34fb
            </Text>
          </View>

          {/* Flow */}
          <View className="bg-white rounded-xl p-4 mb-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Text className="text-[10px] tracking-[0.15em] text-[#999] uppercase mb-3">配网流程</Text>
            <View className="flex flex-col gap-1">
              {['扫描设备', '选择设备', '建立连接', '输入配置', '发送配网', '等待响应'].map((step, i) => (
                <View key={i} className="flex items-center gap-2">
                  <Text className="text-[10px] text-[#CCC] font-mono w-3">{i + 1}</Text>
                  <Text className="text-xs text-[#666]">{step}</Text>
                  {i < 5 && <Text className="text-[#E5E2DD] text-[10px] ml-auto">→</Text>}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    )
  }
}

export default Tutorial
