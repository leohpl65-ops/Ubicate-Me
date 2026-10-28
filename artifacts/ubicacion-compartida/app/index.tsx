import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { useAuth, useClerk, useUser } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetConnectionsQueryKey,
  getGetMyProfileQueryKey,
  setAuthTokenGetter,
  useAcceptInvite,
  useCreateInvite,
  useGetConnections,
  useGetMyProfile,
  usePreviewInvite,
  useRemoveConnection,
  useSaveMyProfile,
  useUpdateLocation,
  useUpdateSharing,
} from '@workspace/api-client-react';
import type { Connection, Invite } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useLocationService } from '@/hooks/useLocationService';
import type {
  LocationCoordinates,
  LocationSubscription,
} from '@/hooks/useLocationService';
import SharedMap from '@/components/SharedMap';
import type { SharedMapHandle } from '@/components/shared-map-types';

function LoadingScreen() {
  const colors = useColors();
  return (
    <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
        Preparando tu mapa…
      </Text>
    </View>
  );
}

export default function IndexScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  return <LocationHome />;
}

function LocationHome() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const { signOut } = useClerk();
  const mapRef = useRef<SharedMapHandle>(null);
  const syncedUserId = useRef<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [currentLocation, setCurrentLocation] =
    useState<LocationCoordinates | null>(null);
  const [locationError, setLocationError] = useState('');
  const { permission, requestPermission, watchPosition } = useLocationService();

  const saveProfile = useSaveMyProfile({
    mutation: {
      onSuccess: () => {
        setProfileError('');
        setProfileReady(true);
        void queryClient.invalidateQueries({
          queryKey: getGetMyProfileQueryKey(),
        });
      },
      onError: () => {
        setProfileError('No se pudo guardar tu cuenta. Revisa tu conexión e inténtalo de nuevo.');
      },
    },
  });
  const profileQuery = useGetMyProfile({
    query: { enabled: profileReady, retry: false },
  });
  const sharingEnabled = Boolean(profileQuery.data?.sharingEnabled);
  const connectionsQuery = useGetConnections({
    query: {
      enabled: profileReady,
      refetchInterval: 7000,
      refetchIntervalInBackground: false,
    },
  });
  const connections = connectionsQuery.data ?? [];
  const selected = useMemo(
    () => connections.find((person) => person.userId === selectedUserId) ?? connections[0],
    [connections, selectedUserId],
  );
  const createInvite = useCreateInvite();
  const previewQuery = usePreviewInvite(inviteCode, {
    query: {
      enabled: /^\d{5}$/.test(inviteCode),
      retry: false,
    },
  });
  const acceptInvite = useAcceptInvite();
  const updateLocation = useUpdateLocation();
  const updateSharing = useUpdateSharing();
  const removeConnection = useRemoveConnection();
  const locationSub = useRef<LocationSubscription | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  useEffect(() => {
    if (!userLoaded || !user || syncedUserId.current === user.id) return;
    syncedUserId.current = user.id;
    const email = user.primaryEmailAddress?.emailAddress ?? null;
    const displayName =
      user.firstName?.trim() || user.fullName?.trim() || 'Mi cuenta';
    saveProfile.mutate({ data: { displayName, email } });
  }, [userLoaded, user, saveProfile]);

  useEffect(() => {
    if (profileQuery.data?.sharingEnabled === undefined) return;
    setProfileReady(true);
  }, [profileQuery.data?.sharingEnabled]);

  useEffect(() => {
    if (!connections.length) {
      setSelectedUserId('');
      return;
    }
    if (!connections.some((person) => person.userId === selectedUserId)) {
      setSelectedUserId(connections[0].userId);
    }
  }, [connections, selectedUserId]);

  useEffect(() => {
    if (!sharingEnabled || !permission?.granted) {
      locationSub.current?.remove();
      locationSub.current = null;
      return;
    }

    let active = true;
    setLocationError('');
    void watchPosition((coords) => {
        if (!active) return;
        setCurrentLocation(coords);
        updateLocation.mutate({
          data: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          },
        });
      })
      .then((subscription) => {
        if (active) locationSub.current = subscription;
        else subscription.remove();
      })
      .catch(() => setLocationError('No se pudo obtener tu ubicación.'));

    return () => {
      active = false;
      locationSub.current?.remove();
      locationSub.current = null;
    };
  }, [sharingEnabled, permission?.granted, watchPosition, updateLocation.mutate]);

  const askForSharing = useCallback(async () => {
    setLocationError('');
    try {
      const currentPermission =
        permission?.granted ? permission : await requestPermission();
      if (!currentPermission.granted) {
        setLocationError(
          currentPermission.canAskAgain
            ? 'Necesitas permitir la ubicación mientras usas la app.'
            : Platform.OS === 'web'
              ? 'Permite la ubicación en los ajustes de este navegador para compartirla.'
              : 'Permite la ubicación desde los ajustes del teléfono para compartirla.',
        );
        return;
      }
      await updateSharing.mutateAsync({ data: { enabled: true } });
      await queryClient.invalidateQueries({
        queryKey: getGetMyProfileQueryKey(),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setLocationError('No se pudo activar el uso compartido. Inténtalo de nuevo.');
    }
  }, [permission, requestPermission, updateSharing, queryClient]);

  const pauseSharing = useCallback(async () => {
    try {
      await updateSharing.mutateAsync({ data: { enabled: false } });
      await queryClient.invalidateQueries({
        queryKey: getGetMyProfileQueryKey(),
      });
      setCurrentLocation(null);
      await Haptics.selectionAsync();
    } catch {
      setLocationError('No se pudo pausar la ubicación. Inténtalo de nuevo.');
    }
  }, [updateSharing, queryClient]);

  const generateCode = useCallback(async () => {
    try {
      const invite = await createInvite.mutateAsync();
      setCreatedInvite(invite);
      setInviteCode('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('No se pudo generar el código', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  }, [createInvite]);

  const askToAccept = useCallback(() => {
    const name = previewQuery.data?.displayName;
    if (!name) return;
    Alert.alert(
      'Confirmar vínculo',
      `¿Seguro que quieres vincularte con ${name}? Tendrá acceso a tu ubicación mientras compartir esté activado.\n\nNo compartas códigos con personas desconocidas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Agregar',
          onPress: () => {
            void acceptInvite
              .mutateAsync({ code: inviteCode })
              .then(async (connection) => {
                setSelectedUserId(connection.userId);
                setInviteCode('');
                setCreatedInvite(null);
                setActionsOpen(false);
                await queryClient.invalidateQueries({
                  queryKey: getGetConnectionsQueryKey(),
                });
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              })
              .catch(() => {
                Alert.alert(
                  'No se pudo agregar',
                  'El código pudo vencer o ya no está disponible. Pide otro código.',
                );
              });
          },
        },
      ],
      { cancelable: true },
    );
  }, [previewQuery.data, acceptInvite, inviteCode, queryClient]);

  const centerOn = useCallback(
    (person?: Connection) => {
      const point =
        person?.latitude != null && person.longitude != null
          ? { latitude: person.latitude, longitude: person.longitude }
          : currentLocation;
      if (!point) {
        Alert.alert(
          'Ubicación no disponible',
          person
            ? `${person.displayName} aún no está compartiendo una ubicación actual.`
            : 'Activa compartir ubicación para centrar el mapa.',
        );
        return;
      }
      mapRef.current?.centerOn(point);
      if (person) setSelectedUserId(person.userId);
      void Haptics.selectionAsync();
    },
    [currentLocation],
  );

  const confirmRemove = useCallback(
    (person: Connection) => {
      Alert.alert(
        'Quitar vínculo',
        `¿Quieres dejar de compartir ubicación con ${person.displayName}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Quitar',
            style: 'destructive',
            onPress: () => {
              void removeConnection
                .mutateAsync({ userId: person.userId })
                .then(() =>
                  queryClient.invalidateQueries({
                    queryKey: getGetConnectionsQueryKey(),
                  }),
                )
                .catch(() =>
                  Alert.alert('No se pudo quitar', 'Inténtalo de nuevo en unos momentos.'),
                );
            },
          },
        ],
      );
    },
    [removeConnection, queryClient],
  );

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Cerrar sesión',
      'Tus vínculos se conservarán en tu cuenta. Tu ubicación dejará de actualizarse en este teléfono.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          onPress: () => {
            void signOut();
          },
        },
      ],
    );
  }, [signOut]);

  if (!userLoaded || !user || (!profileReady && saveProfile.isPending)) {
    return <LoadingScreen />;
  }

  const profileName =
    user.firstName?.trim() || user.fullName?.trim() || 'Mi cuenta';
  const usableCoords = connections.filter(
    (person) => person.latitude != null && person.longitude != null,
  );
  const mapAnchor =
    currentLocation ??
    (selected?.latitude != null && selected.longitude != null
      ? { latitude: selected.latitude, longitude: selected.longitude }
      : null);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {mapAnchor ? (
        <SharedMap
          ref={mapRef}
          currentLocation={currentLocation}
          connections={connections}
          selectedUserId={selected?.userId ?? ''}
          onSelectPerson={(person) => setSelectedUserId(person.userId)}
        />
      ) : (
        <View style={[styles.mapEmpty, { backgroundColor: colors.secondary }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
            <Ionicons
              name="map-outline"
              size={34}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Tu mapa empieza aquí
          </Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
            Activa compartir ubicación o vincula a alguien para ver sus ubicaciones.
          </Text>
        </View>
      )}

      <View
        style={[
          styles.topBar,
          { paddingTop: Platform.OS === 'web' ? 67 : 12 },
        ]}
      >
        <View style={[styles.brandPill, { backgroundColor: colors.card }]}>
          <View style={[styles.brandDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.brandText, { color: colors.foreground }]}>Ubícame</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable
            testID="add-person"
            accessibilityRole="button"
            onPress={() => setActionsOpen(true)}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.84 : 1,
              },
            ]}
          >
            <Ionicons name="add" size={21} color={colors.primaryForeground} />
            <Text style={[styles.addLabel, { color: colors.primaryForeground }]}>
              Agregar
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
            testID="sign-out"
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.accountButton,
              { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.accountInitial, { color: colors.primary }]}>
              {profileName.trim().charAt(0).toUpperCase()}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.mapCredit}>
        <Text style={[styles.mapCreditText, { color: colors.foreground }]}>
          © OpenStreetMap
        </Text>
      </View>

      <View
        style={[
          styles.bottomPanel,
          {
            backgroundColor: colors.card,
            paddingBottom: Platform.OS === 'web' ? 34 : 22,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.panelHandle} />
        <View style={styles.panelHeading}>
          <View style={styles.panelTitleGroup}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              TU ESPACIO
            </Text>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>
              {connections.length
                ? `${connections.length} ${connections.length === 1 ? 'persona vinculada' : 'personas vinculadas'}`
                : 'Comparte con confianza'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ubicar persona"
            testID="center-location"
            onPress={() => centerOn(selected)}
            style={({ pressed }) => [
              styles.locateButton,
              {
                backgroundColor: colors.secondary,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Ionicons name="locate" size={17} color={colors.primary} />
            <Text style={[styles.locateText, { color: colors.primary }]}>Ubicar</Text>
          </Pressable>
        </View>

        {connections.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.peopleRow}
          >
            {connections.map((person) => (
              <Pressable
                key={person.userId}
                onPress={() => {
                  setSelectedUserId(person.userId);
                  centerOn(person);
                }}
                style={[
                  styles.personCard,
                  {
                    backgroundColor:
                      selected?.userId === person.userId
                        ? colors.secondary
                        : colors.background,
                    borderColor:
                      selected?.userId === person.userId
                        ? colors.primary
                        : colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.avatarLetter}>
                    {person.displayName.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.personTextGroup}>
                  <Text
                    numberOfLines={1}
                    style={[styles.personName, { color: colors.foreground }]}
                  >
                    {person.displayName}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[styles.personStatus, { color: colors.mutedForeground }]}
                  >
                    {connectionStatus(person)}
                  </Text>
                  {person.locationUpdatedAt ? (
                    <Text
                      numberOfLines={1}
                      style={[styles.personLastSeen, { color: colors.mutedForeground }]}
                    >
                      Última vez: {formatLastSeen(person.locationUpdatedAt)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={[styles.noPeopleText, { color: colors.mutedForeground }]}>
            Genera un código temporal o agrega a alguien con su código.
          </Text>
        )}

        {profileError ? (
          <Pressable
            onPress={() => {
              if (!user) return;
              saveProfile.mutate({
                data: {
                  displayName: profileName,
                  email: user.primaryEmailAddress?.emailAddress ?? null,
                },
              });
            }}
            style={styles.inlineError}
          >
            <Text style={styles.errorText}>{profileError} Toca para reintentar.</Text>
          </Pressable>
        ) : null}

        {locationError ? (
          <View style={styles.inlineError}>
            <Text style={styles.errorText}>{locationError}</Text>
            {permission?.status === 'denied' && !permission.canAskAgain ? (
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') void Linking.openSettings();
                }}
              >
                <Text style={[styles.settingsLink, { color: colors.primary }]}>
                  Abrir ajustes
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.shareRow}>
          <View style={styles.shareCopy}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: sharingEnabled ? '#2d8b66' : colors.mutedForeground,
                },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.shareTitle, { color: colors.foreground }]}>
                {sharingEnabled ? 'Compartiendo ahora' : 'Ubicación pausada'}
              </Text>
              <Text style={[styles.shareSubtitle, { color: colors.mutedForeground }]}>
                {sharingEnabled
                  ? 'Con tus personas vinculadas mientras usas la app'
                  : 'Tú decides cuándo activarla'}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            testID="toggle-sharing"
            disabled={updateSharing.isPending}
            onPress={sharingEnabled ? pauseSharing : askForSharing}
            style={({ pressed }) => [
              styles.shareButton,
              {
                backgroundColor: sharingEnabled ? colors.secondary : colors.primary,
                opacity: pressed || updateSharing.isPending ? 0.76 : 1,
              },
            ]}
          >
            {updateSharing.isPending ? (
              <ActivityIndicator
                size="small"
                color={sharingEnabled ? colors.primary : colors.primaryForeground}
              />
            ) : (
              <Text
                style={[
                  styles.shareButtonText,
                  {
                    color: sharingEnabled
                      ? colors.primary
                      : colors.primaryForeground,
                  },
                ]}
              >
                {sharingEnabled ? 'Pausar' : 'Activar'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      <Modal
        visible={actionsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setActionsOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setActionsOpen(false)}
            accessibilityLabel="Cerrar"
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: Platform.OS === 'web' ? 34 : 24,
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  Agregar una persona
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                  El vínculo solo se crea cuando confirmas.
                </Text>
              </View>
              <Pressable
                testID="close-add-modal"
                onPress={() => setActionsOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                style={styles.closeIcon}
              >
                <Ionicons name="close" size={23} color={colors.foreground} />
              </Pressable>
            </View>

            <Pressable
              testID="generate-code"
              accessibilityRole="button"
              disabled={createInvite.isPending}
              onPress={generateCode}
              style={({ pressed }) => [
                styles.generateCard,
                {
                  backgroundColor: colors.secondary,
                  opacity: pressed || createInvite.isPending ? 0.72 : 1,
                },
              ]}
            >
              <View style={[styles.generateIcon, { backgroundColor: colors.card }]}>
                {createInvite.isPending ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="keypad-outline" size={22} color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.generateTitle, { color: colors.foreground }]}>
                  Generar código de 5 dígitos
                </Text>
                <Text style={[styles.generateHint, { color: colors.mutedForeground }]}>
                  Vence en 10 minutos y se usa una sola vez.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color={colors.mutedForeground} />
            </Pressable>

            {createdInvite ? (
              <View
                style={[
                  styles.codeCard,
                  { borderColor: colors.border, backgroundColor: colors.background },
                ]}
              >
                <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>
                  TU CÓDIGO TEMPORAL
                </Text>
                <Text style={[styles.codeValue, { color: colors.foreground }]}>
                  {createdInvite.code}
                </Text>
                <Text style={[styles.codeHint, { color: colors.mutedForeground }]}>
                  Dáselo solo a la persona que quieres vincular.
                </Text>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
              Agregar persona por código
            </Text>
            <View
              style={[
                styles.codeInputWrap,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <TextInput
                testID="invite-code-input"
                accessibilityLabel="Código de cinco dígitos"
                value={inviteCode}
                onChangeText={(value) => setInviteCode(value.replace(/\D/g, '').slice(0, 5))}
                placeholder="00000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                maxLength={5}
                style={[styles.codeInput, { color: colors.foreground }]}
              />
              <Pressable
                testID="preview-invite"
                disabled={inviteCode.length !== 5 || previewQuery.isFetching}
                onPress={() => void previewQuery.refetch()}
                style={({ pressed }) => [
                  styles.previewButton,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      pressed || inviteCode.length !== 5 || previewQuery.isFetching
                        ? 0.55
                        : 1,
                  },
                ]}
              >
                {previewQuery.isFetching ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={[styles.previewText, { color: colors.primaryForeground }]}>
                    Revisar
                  </Text>
                )}
              </Pressable>
            </View>
            {previewQuery.data ? (
              <View style={styles.previewResult}>
                <Ionicons
                  name="person-circle-outline"
                  size={21}
                  color={colors.primary}
                />
                <Text style={[styles.previewResultText, { color: colors.foreground }]}>
                  Código de {previewQuery.data.displayName}
                </Text>
                <Pressable
                  testID="confirm-add-person"
                  accessibilityRole="button"
                  onPress={askToAccept}
                  style={({ pressed }) => [
                    styles.confirmButton,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <Text style={[styles.previewText, { color: colors.primaryForeground }]}>
                    Agregar
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {previewQuery.isError ? (
              <Text style={styles.errorText}>
                Código incorrecto o vencido. Pide uno nuevo a esa persona.
              </Text>
            ) : null}
            {acceptInvite.isPending ? (
              <View style={styles.pendingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.pendingText, { color: colors.mutedForeground }]}>
                  Creando el vínculo…
                </Text>
              </View>
            ) : null}

            {connections.length ? (
              <View style={styles.linkedSection}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                  Personas vinculadas
                </Text>
                {connections.map((person) => (
                  <View key={person.userId} style={styles.linkedPerson}>
                    <Text style={[styles.linkedName, { color: colors.foreground }]}>
                      {person.displayName}
                    </Text>
                    <Pressable
                      testID={`remove-${person.userId}`}
                      onPress={() => confirmRemove(person)}
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar a ${person.displayName}`}
                    >
                      <Text style={styles.removeLink}>Quitar</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={[styles.safetyNote, { color: colors.mutedForeground }]}>
              Compartir ubicación es opcional. Puedes pausarlo o quitar un vínculo cuando quieras.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function connectionStatus(person: Connection): string {
  if (!person.sharingEnabled) return 'Ubicación pausada';
  if (!person.locationUpdatedAt) return 'Esperando ubicación';

  const ageMs = Date.now() - new Date(person.locationUpdatedAt).getTime();
  if (ageMs >= 2 * 60_000) return 'Sin actualizar · posible apagado';
  return 'Compartiendo ubicación';
}

function formatLastSeen(timestamp: string | Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontSize: 14 },
  mapEmpty: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 190,
  },
  emptyIcon: {
    height: 76,
    width: 76,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptyCopy: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 310,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandPill: {
    height: 43,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    shadowColor: '#123438',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  brandDot: { width: 9, height: 9, borderRadius: 5 },
  brandText: { fontSize: 14, fontWeight: '700' },
  topActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  addButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    elevation: 3,
  },
  addLabel: { fontSize: 14, fontWeight: '600' },
  accountButton: {
    width: 42,
    height: 42,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  accountInitial: { fontSize: 16, fontWeight: '700' },
  mapCredit: {
    position: 'absolute',
    right: 12,
    bottom: 290,
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  mapCreditText: { fontSize: 10, fontWeight: '500' },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  personPin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: '#123438',
    shadowOpacity: 0.11,
    shadowRadius: 18,
    elevation: 10,
  },
  panelHandle: {
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: '#c8d0c9',
    alignSelf: 'center',
    marginBottom: 17,
  },
  panelHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  panelTitleGroup: { flex: 1 },
  greeting: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  panelTitle: { marginTop: 5, fontSize: 20, fontWeight: '700', letterSpacing: -0.35 },
  locateButton: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locateText: { fontSize: 13, fontWeight: '700' },
  peopleRow: { gap: 10, paddingTop: 14, paddingBottom: 4 },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 188,
    minHeight: 72,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
    gap: 10,
  },
  avatar: {
    height: 37,
    width: 37,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  personTextGroup: { flex: 1 },
  personName: { fontSize: 13, fontWeight: '600' },
  personStatus: { marginTop: 3, fontSize: 11 },
  personLastSeen: { marginTop: 2, fontSize: 10 },
  noPeopleText: { marginTop: 10, fontSize: 13, lineHeight: 19 },
  inlineError: { marginTop: 9 },
  errorText: { color: '#b54235', fontSize: 12, lineHeight: 18 },
  settingsLink: { marginTop: 5, fontSize: 13, fontWeight: '700' },
  shareRow: {
    marginTop: 15,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#e9ece5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 6 },
  shareTitle: { fontSize: 14, fontWeight: '700' },
  shareSubtitle: { marginTop: 3, fontSize: 11 },
  shareButton: {
    minWidth: 83,
    height: 41,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  shareButtonText: { fontSize: 13, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 35, 34, 0.38)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 21,
    paddingTop: 10,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#c7cfca',
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetTitle: { fontSize: 23, fontWeight: '700', letterSpacing: -0.5 },
  sheetSubtitle: { marginTop: 5, fontSize: 13, lineHeight: 19 },
  closeIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateCard: {
    marginTop: 22,
    minHeight: 74,
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  generateIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateTitle: { fontSize: 14, fontWeight: '700' },
  generateHint: { marginTop: 4, fontSize: 11, lineHeight: 15 },
  codeCard: {
    marginTop: 11,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  codeLabel: { fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  codeValue: {
    marginTop: 4,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: 8,
  },
  codeHint: { marginTop: 2, fontSize: 11 },
  fieldLabel: { marginTop: 20, marginBottom: 8, fontSize: 13, fontWeight: '700' },
  codeInputWrap: {
    height: 51,
    borderWidth: 1,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
  },
  codeInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 10,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
  },
  previewButton: {
    height: 38,
    minWidth: 82,
    paddingHorizontal: 13,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewText: { fontSize: 13, fontWeight: '700' },
  previewResult: {
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewResultText: { flex: 1, fontSize: 13, fontWeight: '600' },
  confirmButton: {
    minHeight: 35,
    paddingHorizontal: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingRow: { marginTop: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingText: { fontSize: 12 },
  linkedSection: { marginTop: 4 },
  linkedPerson: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#edf0ea',
  },
  linkedName: { fontSize: 13, fontWeight: '600' },
  removeLink: { color: '#b54235', fontSize: 12, fontWeight: '700' },
  safetyNote: { marginTop: 15, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
