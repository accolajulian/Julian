import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput } from 'react-native';

import { CategoryPicker } from '../../components/CategoryPicker';
import { formStyles } from '../../components/formStyles';
import { CategoryId } from '../../lib/categories';
import { useLibrary } from '../../lib/library';
import { colors } from '../../lib/theme';

// Rename a workout, move it to other body parts, or delete it.
export default function EditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, updateWorkout, deleteWorkout } = useLibrary();
  const workout = workouts.find((w) => w.id === id);

  const [title, setTitle] = useState(workout?.title ?? '');
  const [categories, setCategories] = useState<CategoryId[]>(workout?.categories ?? []);

  if (!workout) {
    return (
      <ScrollView contentContainerStyle={formStyles.screen}>
        <Text style={formStyles.note}>This workout no longer exists.</Text>
      </ScrollView>
    );
  }

  const canSave = categories.length > 0;

  const save = () => {
    updateWorkout(workout.id, { title: title.trim() || workout.title, categories });
    router.back();
  };

  const remove = () => {
    Alert.alert('Delete workout?', workout.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteWorkout(workout.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={formStyles.screen}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={formStyles.label}>TITLE</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholderTextColor={colors.muted}
        style={formStyles.input}
        returnKeyType="done"
      />

      <Text style={formStyles.label}>BODY PARTS</Text>
      <CategoryPicker selected={categories} onChange={setCategories} />
      <Text style={formStyles.note}>Unselect the old one and select the new one to move it.</Text>

      <Pressable onPress={save} disabled={!canSave} style={[formStyles.primaryButton, !canSave && formStyles.disabled]}>
        <Text style={formStyles.primaryButtonText}>Save changes</Text>
      </Pressable>
      <Pressable onPress={remove} style={formStyles.dangerButton}>
        <Text style={formStyles.dangerButtonText}>Delete workout</Text>
      </Pressable>
    </ScrollView>
  );
}
