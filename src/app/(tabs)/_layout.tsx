import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';

import { Colors } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.tint,
        headerTintColor: Colors.tint,
        headerTitleStyle: { color: Colors.text },
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'スキャン',
          tabBarIcon: ({ color, size }) => <Ionicons name="barcode-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="use"
        options={{
          title: '単純利用',
          tabBarLabel: '利用',
          tabBarIcon: ({ color, size }) => <Ionicons name="color-fill-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: '在庫一覧',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '履歴',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" color={color as string} size={size} />,
        }}
      />
    </Tabs>
  );
}
