import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Connection } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import type { MapPoint, SharedMapHandle } from './shared-map-types';

type SharedMapProps = {
  currentLocation: MapPoint | null;
  connections: Connection[];
  selectedUserId: string;
  onSelectPerson: (person: Connection) => void;
};

const SharedMap = forwardRef<SharedMapHandle, SharedMapProps>(
  (_props, ref) => {
    const colors = useColors();
    useImperativeHandle(ref, () => ({ centerOn: () => undefined }), []);

    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.webMap,
          { backgroundColor: colors.secondary },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.card }]}>
          <Ionicons name="map-outline" size={34} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          El mapa interactivo está en tu teléfono
        </Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          Abre la vista previa con Expo Go para ver las calles y ubicaciones.
        </Text>
      </View>
    );
  },
);

SharedMap.displayName = 'SharedMap';
export default SharedMap;

const styles = StyleSheet.create({
  webMap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 180,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 21, fontWeight: '700', textAlign: 'center' },
  copy: { marginTop: 9, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
