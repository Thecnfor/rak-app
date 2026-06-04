export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/dashboard/index',
    'pages/provision/index',
    'pages/debug/index',
  ],
  tabBar: {
    color: '#BBBBBB',
    selectedColor: '#1A1A1A',
    backgroundColor: '#FAF8F5',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/dashboard/index',
        text: '控制',
        iconPath: 'assets/tab-device.png',
        selectedIconPath: 'assets/tab-device-active.png',
      },
      {
        pagePath: 'pages/provision/index',
        text: '配网',
        iconPath: 'assets/tab-config.png',
        selectedIconPath: 'assets/tab-config-active.png',
      },
      {
        pagePath: 'pages/debug/index',
        text: '日志',
        iconPath: 'assets/tab-debug.png',
        selectedIconPath: 'assets/tab-debug-active.png',
      },
    ],
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FAF8F5',
    navigationBarTitleText: 'Raro',
    navigationBarTextStyle: 'black',
  },
})
