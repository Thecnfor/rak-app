import { Component, PropsWithChildren } from "react";
import { View, Text } from "@tarojs/components";
import { observer } from "mobx-react";
import "./index.css";

@observer
class Index extends Component<PropsWithChildren> {
  render() {
    return (
      <View className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <View className="text-center">
          <Text className="block text-3xl font-bold text-gray-900 mb-2">
            Taro Template
          </Text>
          <Text className="block text-sm text-gray-500">
            TailwindCSS + MobX + TypeScript
          </Text>
        </View>
        <View className="mt-6 px-4 py-2 bg-green-600 rounded-full">
          <Text className="text-white text-sm">Start Building</Text>
        </View>
      </View>
    );
  }
}

export default Index;
