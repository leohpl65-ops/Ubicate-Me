import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSSO } from '@clerk/expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

export default function SignInScreen() {
  const colors = useColors();
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useWarmUpBrowser();

  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({
          scheme: 'ubicacion-compartida',
        }),
      });
      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: async ({ decorateUrl }) => {
            router.replace(decorateUrl('/') as never);
          },
        });
      } else {
        setError('No se pudo completar el inicio de sesión. Inténtalo de nuevo.');
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'No se pudo iniciar sesión.';
      setError(
        message.toLowerCase().includes('oauth')
          ? 'Google todavía no está activado para esta app. Activa Google en la configuración de autenticación.'
          : message,
      );
    } finally {
      setBusy(false);
    }
  }, [router, startSSOFlow]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.mark, { backgroundColor: colors.primary }]}>
          <Ionicons name="navigate" size={33} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.brand, { color: colors.foreground }]}>Ubícame</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>
          Cerca de quienes te importan.
        </Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          Inicia sesión con Google para guardar tus vínculos y compartir tu
          ubicación solo con personas que tú aceptes.
        </Text>

        <Pressable
          accessibilityRole="button"
          testID="google-sign-in"
          disabled={busy}
          onPress={signInWithGoogle}
          style={({ pressed }) => [
            styles.googleButton,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed || busy ? 0.75 : 1,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={colors.foreground} />
              <Text style={[styles.googleText, { color: colors.foreground }]}>
                Continuar con Google
              </Text>
            </>
          )}
        </Pressable>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.privacyRow}>
          <Ionicons
            name="lock-closed-outline"
            size={16}
            color={colors.primary}
          />
          <Text style={[styles.privacy, { color: colors.mutedForeground }]}>
            Tu ubicación no se comparte hasta que tú la actives.
          </Text>
        </View>
      </View>
      <Text style={[styles.footer, { color: colors.mutedForeground }]}>
        Solo compartes con personas vinculadas por código.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  content: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  mark: {
    width: 68,
    height: 68,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  brand: { fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
  heading: {
    marginTop: 30,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  copy: { marginTop: 14, fontSize: 16, lineHeight: 24 },
  googleButton: {
    minHeight: 58,
    marginTop: 34,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  googleText: { fontSize: 16, fontWeight: '600' },
  error: {
    color: '#b54235',
    marginTop: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 26,
  },
  privacy: { flex: 1, fontSize: 13, lineHeight: 18 },
  footer: {
    position: 'absolute',
    bottom: 26,
    alignSelf: 'center',
    fontSize: 12,
    textAlign: 'center',
  },
});
