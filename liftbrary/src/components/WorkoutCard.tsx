import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PLATFORM_LABEL } from '../lib/oembed';
import { colors } from '../lib/theme';
import type { Workout } from '../lib/types';

type Props = {
  workout: Workout;
  onPress: () => void;
  onLongPress: () => void;
};

export function WorkoutCard({ workout, onPress, onLongPress }: Props) {
  // Thumbnail links can expire (TikTok's do), so fall back to a plain box.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = workout.thumbnailUrl && !imageFailed;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.thumb}>
        {showImage ? (
          <Image
            source={{ uri: workout.thumbnailUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text style={styles.placeholder}>▶</Text>
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{PLATFORM_LABEL[workout.platform]}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {workout.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.7 },
  thumb: {
    aspectRatio: 4 / 5,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: { color: colors.muted, fontSize: 28 },
  badge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  badgeText: { color: colors.text, fontSize: 11, fontWeight: '600' },
  title: { color: colors.text, fontSize: 14, fontWeight: '500', padding: 10, lineHeight: 19 },
});
