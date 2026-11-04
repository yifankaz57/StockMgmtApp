import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Section({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.card}>{children}</View>
      {footer ? (typeof footer === 'string' ? <Text style={styles.sectionFooter}>{footer}</Text> : footer) : null}
    </View>
  );
}

export function Row({ children, last, style }: { children: ReactNode; last?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, !last && styles.rowBorder, style]}>{children}</View>;
}

export function LabeledRow({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <Row last={last}>
      <Text style={styles.label}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={styles.value} selectable>
          {value}
        </Text>
      ) : (
        value
      )}
    </Row>
  );
}

export function FieldRow({ label, last, ...props }: { label: string; last?: boolean } & TextInputProps) {
  return (
    <Row last={last}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#A0A0A6" style={styles.input} {...props} />
    </Row>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'plain';

export function Button({
  title,
  icon,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  title: string;
  icon?: IconName;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const color = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? Colors.danger : Colors.tint;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: Colors.tint },
        variant === 'secondary' && { backgroundColor: Colors.tintLight },
        variant === 'danger' && { backgroundColor: '#FDECEA' },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 },
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={18} color={color} /> : null}
      <Text style={[styles.buttonText, { color }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityLabel={label} hitSlop={10} onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, paddingHorizontal: 4 }]}>
      <Ionicons name={icon} size={24} color={Colors.tint} />
    </Pressable>
  );
}

export function EmptyState({ icon, title, message, children }: { icon: IconName; title: string; message?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={Colors.secondaryText} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {children}
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.error}>
      <Ionicons name="alert-circle" size={18} color={Colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  section: { marginTop: 20, marginHorizontal: 16 },
  sectionTitle: { fontSize: 13, color: Colors.secondaryText, marginBottom: 6, marginLeft: 12 },
  sectionFooter: { fontSize: 12, color: Colors.secondaryText, marginTop: 6, marginHorizontal: 12, lineHeight: 17 },
  card: { backgroundColor: Colors.card, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 48, paddingVertical: 10, gap: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  label: { fontSize: 16, color: Colors.text },
  value: { flex: 1, fontSize: 16, color: Colors.secondaryText, textAlign: 'right' },
  input: { flex: 1, fontSize: 16, color: Colors.text, textAlign: 'right', paddingVertical: 4 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  emptyMessage: { fontSize: 14, color: Colors.secondaryText, textAlign: 'center', lineHeight: 20 },
  error: { flexDirection: 'row', gap: 6, alignItems: 'center', marginHorizontal: 16, marginTop: 16 },
  errorText: { color: Colors.danger, fontSize: 14, flexShrink: 1 },
});

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={segStyles.container} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[segStyles.item, selected && segStyles.itemSelected]}>
            <Text style={[segStyles.text, selected && segStyles.textSelected]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: Colors.fill, borderRadius: 10, padding: 3 },
  item: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  itemSelected: {
    backgroundColor: Colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  text: { fontSize: 14, color: Colors.secondaryText, fontWeight: '500' },
  textSelected: { color: Colors.text, fontWeight: '700' },
});
