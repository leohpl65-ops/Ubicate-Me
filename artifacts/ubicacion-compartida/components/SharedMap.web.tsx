import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  ({ currentLocation, connections, selectedUserId }, ref) => {
    const colors = useColors();
    useImperativeHandle(ref, () => ({ centerOn: () => undefined }), []);

    const selectedPerson = connections.find(
      (person) =>
        person.userId === selectedUserId &&
        person.latitude != null &&
        person.longitude != null,
    );
    const anchor: MapPoint | null =
      selectedPerson?.latitude != null && selectedPerson.longitude != null
        ? {
            latitude: selectedPerson.latitude,
            longitude: selectedPerson.longitude,
          }
        : currentLocation;

    if (!anchor) return null;

    const zoom = 15;
    const tileCount = 2 ** zoom;
    const latitudeRadians = (anchor.latitude * Math.PI) / 180;
    const worldX = ((anchor.longitude + 180) / 360) * tileCount;
    const worldY =
      ((1 -
        Math.log(
          Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians),
        ) /
          Math.PI) /
        2) *
      tileCount;
    const centerTileX = Math.floor(worldX);
    const centerTileY = Math.floor(worldY);
    const mapSize = 768;
    const tileSize = 256;
    const markerLeft = tileSize + (worldX - centerTileX) * tileSize;
    const markerTop = tileSize + (worldY - centerTileY) * tileSize;

    return (
      <View style={StyleSheet.absoluteFill}>
        <div
          role="img"
          aria-label={
            selectedPerson
              ? `Mapa de ${selectedPerson.displayName}`
              : 'Mapa de tu ubicación'
          }
          style={{
            position: 'absolute',
            width: mapSize,
            height: mapSize,
            left: '50%',
            top: '48%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          {[-1, 0, 1].flatMap((row) =>
            [-1, 0, 1].map((column) => {
              const tileY = Math.max(
                0,
                Math.min(tileCount - 1, centerTileY + row),
              );
              const rawTileX = centerTileX + column;
              const tileX = ((rawTileX % tileCount) + tileCount) % tileCount;
              return (
                <img
                  key={`${row}-${column}`}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  src={`https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`}
                  style={{
                    position: 'absolute',
                    width: tileSize,
                    height: tileSize,
                    left: (column + 1) * tileSize,
                    top: (row + 1) * tileSize,
                    userSelect: 'none',
                  }}
                />
              );
            }),
          )}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: markerLeft,
              top: markerTop,
              width: 18,
              height: 18,
              border: '3px solid white',
              borderRadius: '50%',
              background: '#16766e',
              boxShadow: '0 1px 6px rgba(0,0,0,0.45)',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
        <View style={[styles.mapLabel, { backgroundColor: colors.card }]}>
          <Text style={[styles.mapLabelText, { color: colors.foreground }]}>
            {selectedPerson?.displayName ?? 'Tu ubicación'}
          </Text>
        </View>
        <Text style={[styles.attribution, { color: colors.foreground }]}>
          © OpenStreetMap
        </Text>
      </View>
    );
  },
);

SharedMap.displayName = 'SharedMap';
export default SharedMap;

const styles = StyleSheet.create({
  mapLabel: {
    position: 'absolute',
    top: 90,
    left: 18,
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    elevation: 5,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  mapLabelText: { fontSize: 14, fontWeight: '600' },
  attribution: {
    position: 'absolute',
    bottom: 350,
    right: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
    fontSize: 10,
  },
});
