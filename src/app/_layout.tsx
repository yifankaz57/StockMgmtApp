import { Stack } from 'expo-router/stack';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '@/constants/theme';
import { DATABASE_NAME, migrateDatabase } from '@/db/database';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDatabase}>
      <Stack
        screenOptions={{
          headerTintColor: Colors.tint,
          headerTitleStyle: { color: Colors.text },
          headerBackTitle: '戻る',
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ title: '商品詳細' }} />
        <Stack.Screen name="product/edit" options={{ presentation: 'modal', title: '商品' }} />
        <Stack.Screen name="adjust/[id]" options={{ presentation: 'modal', title: '在庫操作' }} />
      </Stack>
      <StatusBar style="dark" />
    </SQLiteProvider>
  );
}
