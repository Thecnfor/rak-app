export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/dashboard/index',
    'pages/config/index',
    'pages/debug/index',
    'pages/tutorial/index',
  ],
  tabBar: {
    color: '#BBBBBB',
    selectedColor: '#1A1A1A',
    backgroundColor: '#FAF8F5',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '设备',
        iconPath: 'assets/tab-device.png',
        selectedIconPath: 'assets/tab-device-active.png',
      },
      {
        pagePath: 'pages/dashboard/index',
        text: '控制台',
        iconPath: 'assets/tab-debug.png',
        selectedIconPath: 'assets/tab-debug-active.png',
      },
      {
        pagePath: 'pages/config/index',
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
      {
        pagePath: 'pages/tutorial/index',
        text: '教程',
        iconPath: 'assets/tab-tutorial.png',
        selectedIconPath: 'assets/tab-tutorial-active.png',
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