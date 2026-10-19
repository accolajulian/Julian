import { router, Stack } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { CATEGORIES, CategoryId } from '../lib/categories';
import { useLibrary } from '../lib/library';
import { colors } from '../lib/theme';

// Home screen: the list of body parts, each with how many workouts it holds.
export default function HomeScreen() {
  const { workouts } = useLibrary();

  const countFor = (id: CategoryId) => workouts.filter((w) => w.categories.includes(id)).length;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/add')}
              hitSlop={12}
              style={styles.addButton}
              accessibilityLabel="Add workout"
            >
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={CATEGORIES}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={
          workouts.length === 0 ? (
            <Text style={styles.hint}>Tap + to save your first workout video.</Text>
          ) : undefined
        }
        renderItem={({ item }) => {
          const count = countFor(item.id);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/category/[id]', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.name}>{item.name}</Text>
              <Text style={[styles.count, count > 0 && styles.countActive]}>{count}</Text>
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  gap: { height: 10 },
  hint: { color: colors.muted, fontSize: 14, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  count: { color: colors.muted, fontSize: 16, fontVariant: ['tabular-nums'] },
  countActive: { color: colors.accent, fontWeight: '600' },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: colors.accentText, fontSize: 24, fontWeight: '600', lineHeight: 26 },
});
