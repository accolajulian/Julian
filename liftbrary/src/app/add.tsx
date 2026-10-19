import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CategoryPicker } from '../components/CategoryPicker';
import { formStyles } from '../components/formStyles';
import { CATEGORIES, CategoryId } from '../lib/categories';
import { useLibrary } from '../lib/library';
import { detectPlatform, fetchPreview, LinkPreview, normalizeUrl, PLATFORM_LABEL } from '../lib/oembed';
import { colors } from '../lib/theme';

export default function AddScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const startCategory = CATEGORIES.find((c) => c.id === params.category)?.id;

  const { addWorkout } = useLibrary();
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [categories, setCategories] = useState<CategoryId[]>(startCategory ? [startCategory] : []);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState(false);

  const url = normalizeUrl(link);
  const platform = url ? detectPlatform(url) : 'other';

  // Remember which link the current request is for, so a slow old
  // request can't overwrite the details of a newer link.
  const latestUrl = useRef<string | null>(null);

  // A moment after you paste or type a link, look up its title and thumbnail.
  useEffect(() => {
    latestUrl.current = url;
    setPreview(null);
    if (!url) return;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await fetchPreview(url);
      if (latestUrl.current !== url) return;
      setPreview(result);
      setLoading(false);
      if (result.title) setTitle((current) => (titleEdited && current ? current : result.title!));
    }, 500);
    return () => {
      clearTimeout(timer);
      setLoading(false);
    };
    // Only re-run when the link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setLink(text.trim());
  };

  const canSave = !!url && categories.length > 0 && !loading;

  const save = () => {
    if (!url || !canSave) return;
    addWorkout({
      url,
      title: title.trim() || `${PLATFORM_LABEL[platform]} workout`,
      thumbnailUrl: preview?.thumbnailUrl,
      platform,
      categories,
    });
    router.back();
  };

  const fetchFailed = !!url && !loading && preview !== null && !preview.title;

  return (
    <ScrollView
      contentContainerStyle={formStyles.screen}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={formStyles.label}>LINK</Text>
      <View style={styles.linkRow}>
        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="Paste a YouTube, TikTok or Instagram link"
          placeholderTextColor={colors.muted}
          style={[formStyles.input, styles.linkInput]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
        />
        <Pressable onPress={paste} style={styles.pasteButton}>
          <Text style={styles.pasteText}>Paste</Text>
        </Pressable>
      </View>
      {link.length > 0 && !url && <Text style={formStyles.note}>That doesn't look like a link yet.</Text>}

      {url && (loading || preview?.thumbnailUrl) ? (
        <View style={styles.preview}>
          {preview?.thumbnailUrl ? (
            <Image source={{ uri: preview.thumbnailUrl }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>
      ) : null}

      <Text style={formStyles.label}>TITLE</Text>
      <TextInput
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          setTitleEdited(true);
        }}
        placeholder={loading ? 'Looking up title…' : 'Give it a name'}
        placeholderTextColor={colors.muted}
        style={formStyles.input}
        returnKeyType="done"
      />
      {fetchFailed && (
        <Text style={formStyles.note}>
          {PLATFORM_LABEL[platform]} didn't share the title. Type your own — the link will still be saved.
        </Text>
      )}

      <Text style={formStyles.label}>BODY PARTS</Text>
      <CategoryPicker selected={categories} onChange={setCategories} />

      <Pressable onPress={save} disabled={!canSave} style={[formStyles.primaryButton, !canSave && formStyles.disabled]}>
        <Text style={formStyles.primaryButtonText}>Save</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  linkRow: { flexDirection: 'row', gap: 8 },
  linkInput: { flex: 1 },
  pasteButton: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pasteText: { color: colors.text, fontWeight: '600' },
  preview: {
    marginTop: 12,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '100%' },
});
