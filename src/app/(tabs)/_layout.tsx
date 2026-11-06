import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';

import { Colors } from '@/constants/theme';
import { useMyStatus, useSharedSession } from '@/shared-master/api';

export default function TabLayout() {
  // 運営者としてログインしたときだけ「管理」タブを出す
  const { session } = useSharedSession();
  const { status } = useMyStatus(session);
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
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarIcon: ({ color, size }) => <Ionicons name="options-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: '管理',
          href: status?.is_admin ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" color={color as string} size={size} />,
        }}
      />
    </Tabs>
  );
}
