import { StyleSheet } from 'react-native';

import { colors } from '../lib/theme';

// Styles shared by the Add and Edit screens.
export const formStyles = StyleSheet.create({
  screen: { padding: 20, paddingBottom: 48, gap: 8 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  note: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  primaryButton: {
    marginTop: 28,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: colors.accentText, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  dangerButton: { marginTop: 12, paddingVertical: 14, alignItems: 'center' },
  dangerButtonText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
});
