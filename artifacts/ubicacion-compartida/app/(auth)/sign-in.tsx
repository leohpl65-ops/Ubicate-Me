import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSignIn, useSignUp } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type AuthMode = 'sign-in' | 'sign-up';

function getAuthErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: string;
      errors?: Array<{ longMessage?: string; message?: string }>;
    };
    const detail = candidate.errors?.find(
      (item) => item.longMessage || item.message,
    );
    const message = detail?.longMessage || detail?.message || candidate.message;

    if (message) {
      const normalized = message.toLowerCase();
      if (
        normalized.includes('email_address') ||
        normalized.includes('email address') ||
        normalized.includes('username is not enabled')
      ) {
        return 'La configuración de cuentas debe permitir nombre de usuario y contraseña, sin exigir correo.';
      }
      return message;
    }
  }

  return 'No se pudo completar el acceso. Revisa tus datos e inténtalo de nuevo.';
}

export default function SignInScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isBusy =
    busy ||
    signInFetchStatus === 'fetching' ||
    signUpFetchStatus === 'fetching';

  const finishAuthentication = async (navigate: () => void) => {
    setError('');
    navigate();
  };

  const handleSignIn = async () => {
    if (!username.trim() || !password) {
      setError('Escribe tu nombre de usuario y contraseña.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await signIn.password({
        identifier: username.trim(),
        password,
      });
      if (result.error) {
        setError(getAuthErrorMessage(result.error));
        return;
      }

      if (signIn.status === 'complete') {
        await signIn.finalize({
          navigate: async ({ decorateUrl }) => {
            await finishAuthentication(() =>
              router.replace(decorateUrl('/') as never),
            );
          },
        });
      } else {
        setError('No se pudo completar el inicio de sesión. Inténtalo de nuevo.');
      }
    } catch (caught) {
      setError(getAuthErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async () => {
    if (!name.trim() || !username.trim() || !password) {
      setError('Completa tu nombre, nombre de usuario y contraseña.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await signUp.password({
        firstName: name.trim(),
        username: username.trim(),
        password,
      });
      if (result.error) {
        setError(getAuthErrorMessage(result.error));
        return;
      }

      if (signUp.status === 'complete') {
        await signUp.finalize({
          navigate: async ({ decorateUrl }) => {
            await finishAuthentication(() =>
              router.replace(decorateUrl('/') as never),
            );
          },
        });
      } else {
        setError(
          'Clerk todavía pide otro dato. Activa usuario, contraseña y nombre, y deja el correo sin requisitos.',
        );
      }
    } catch (caught) {
      setError(getAuthErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 24),
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 24),
        },
      ]}
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.content}>
        <View style={[styles.mark, { backgroundColor: colors.primary }]}>
          <Ionicons name="navigate" size={33} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.brand, { color: colors.foreground }]}>Ubícame</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>
          {mode === 'sign-up' ? 'Crea tu cuenta' : 'Qué bueno verte'}
        </Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          {mode === 'sign-up'
            ? 'Usa tu nombre, un nombre de usuario y una contraseña. Tus contactos verán tu nombre.'
            : 'Entra con tu nombre de usuario y contraseña para ver tus vínculos.'}
        </Text>

        {mode === 'sign-up' ? (
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Nombre que verán tus contactos
            </Text>
            <TextInput
              accessibilityLabel="Nombre visible"
              testID="display-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Tu nombre"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              maxLength={80}
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  color: colors.foreground,
                },
              ]}
            />
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            Nombre de usuario
          </Text>
          <TextInput
            accessibilityLabel="Nombre de usuario"
            testID="username-input"
            value={username}
            onChangeText={setUsername}
            placeholder="Tu usuario"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            maxLength={64}
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
                color: colors.foreground,
              },
            ]}
          />
          {mode === 'sign-up' ? (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Solo se usa para iniciar sesión; no se muestra a tus contactos.
            </Text>
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            Contraseña
          </Text>
          <TextInput
            accessibilityLabel="Contraseña"
            testID="password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="Tu contraseña"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={() => {
              void (mode === 'sign-up' ? handleSignUp() : handleSignIn());
            }}
            maxLength={128}
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
                color: colors.foreground,
              },
            ]}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          testID={mode === 'sign-up' ? 'create-account-button' : 'sign-in-button'}
          disabled={isBusy}
          onPress={() => {
            void (mode === 'sign-up' ? handleSignUp() : handleSignIn());
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              borderRadius: colors.radius,
              opacity: pressed || isBusy ? 0.75 : 1,
            },
          ]}
        >
          {isBusy ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              {mode === 'sign-up' ? 'Crear cuenta' : 'Iniciar sesión'}
            </Text>
          )}
        </Pressable>

        {error ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, { color: colors.destructive }]}
          >
            {error}
          </Text>
        ) : null}

        <View style={styles.switchRow}>
          <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
            {mode === 'sign-up' ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}
          </Text>
          <Pressable
            accessibilityRole="button"
            testID={mode === 'sign-up' ? 'show-sign-in' : 'show-sign-up'}
            disabled={isBusy}
            onPress={() =>
              switchMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')
            }
          >
            <Text style={[styles.switchAction, { color: colors.primary }]}>
              {mode === 'sign-up' ? 'Inicia sesión' : 'Crear cuenta'}
            </Text>
          </Pressable>
        </View>

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
        Solo compartes con personas que aceptes vincular por código.
      </Text>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
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
    marginTop: 24,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  copy: { marginTop: 14, fontSize: 16, lineHeight: 24 },
  fieldGroup: { marginTop: 20 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 54,
    marginTop: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  hint: { marginTop: 8, fontSize: 12, lineHeight: 17 },
  primaryButton: {
    minHeight: 56,
    marginTop: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700' },
  error: {
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
  },
  switchText: { fontSize: 14 },
  switchAction: { fontSize: 14, fontWeight: '700' },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 26,
  },
  privacy: { flex: 1, fontSize: 13, lineHeight: 18 },
  footer: {
    marginTop: 28,
    marginBottom: 12,
    fontSize: 12,
    textAlign: 'center',
  },
});
