import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CATEGORIES, CategoryId } from '../lib/categories';
import { colors } from '../lib/theme';

type Props = {
  selected: CategoryId[];
  onChange: (selected: CategoryId[]) => void;
};

// A grid of tappable chips. Tap to select, tap again to unselect.
export function CategoryPicker({ selected, onChange }: Props) {
  const toggle = (id: CategoryId) =>
    onChange(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]);

  return (
    <View style={styles.wrap}>
      {CATEGORIES.map((c) => {
        const on = selected.includes(c.id);
        return (
          <Pressable
            key={c.id}
            onPress={() => toggle(c.id)}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '500' },
  chipTextOn: { color: colors.accentText, fontWeight: '600' },
});
