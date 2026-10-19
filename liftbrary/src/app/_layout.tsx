import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { LibraryProvider } from '../lib/library';
import { colors } from '../lib/theme';

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
  },
};

// This file wraps every screen: dark theme, saved data, and the screen stack.
export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <LibraryProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'LiftBrary' }} />
          <Stack.Screen name="category/[id]" options={{ title: '' }} />
          <Stack.Screen name="add" options={{ title: 'Add workout', presentation: 'modal' }} />
          <Stack.Screen name="edit/[id]" options={{ title: 'Edit workout', presentation: 'modal' }} />
        </Stack>
      </LibraryProvider>
    </ThemeProvider>
  );
}
