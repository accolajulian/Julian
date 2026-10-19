import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { WorkoutCard } from '../../components/WorkoutCard';
import { CategoryId, categoryName } from '../../lib/categories';
import { useLibrary } from '../../lib/library';
import { colors } from '../../lib/theme';
import type { Workout } from '../../lib/types';

// One body part: its saved workouts as a grid of cards.
export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: CategoryId }>();
  const { workouts, deleteWorkout } = useLibrary();
  const items = workouts.filter((w) => w.categories.includes(id));

  // Opens the link. If the YouTube/TikTok/Instagram app is installed, the phone
  // usually opens it there; otherwise it opens in the browser.
  const open = (workout: Workout) => {
    Linking.openURL(workout.url).catch(() => Alert.alert("Couldn't open link", workout.url));
  };

  const confirmDelete = (workout: Workout) => {
    Alert.alert('Delete workout?', workout.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout(workout.id) },
    ]);
  };

  // Long press shows the options for a card. (Android pop-ups fit 3 buttons max.)
  const showOptions = (workout: Workout) => {
    Alert.alert(workout.title, undefined, [
      {
        text: 'Move / edit',
        onPress: () => router.push({ pathname: '/edit/[id]', params: { id: workout.id } }),
      },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(workout) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: categoryName(id),
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/add', params: { category: id } })}
              hitSlop={12}
              accessibilityLabel="Add workout"
            >
              <Text style={styles.headerAdd}>+</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(w) => w.id}
        numColumns={2}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          items.length > 0 ? <Text style={styles.hint}>Tap to watch · long press for options</Text> : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptyText}>Tap + to add one to {categoryName(id)}.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <WorkoutCard workout={item} onPress={() => open(item)} onLongPress={() => showOptions(item)} />
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40, gap: 12 },
  columns: { gap: 12 },
  // Each cell takes half the row; an odd last card stays half width.
  cell: { flex: 1, maxWidth: '50%' },
  hint: { color: colors.muted, fontSize: 13 },
  headerAdd: { color: colors.accent, fontSize: 28, fontWeight: '400' },
  empty: { alignItems: 'center', marginTop: 80, gap: 6 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  emptyText: { color: colors.muted, fontSize: 14 },
});
