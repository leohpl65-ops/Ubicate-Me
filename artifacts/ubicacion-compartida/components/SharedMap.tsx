import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
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
  ({ currentLocation, connections, selectedUserId, onSelectPerson }, ref) => {
    const colors = useColors();
    const mapRef = useRef<MapView>(null);
    const personWithLocation = connections.find(
      (person) =>
        person.userId === selectedUserId &&
        person.latitude != null &&
        person.longitude != null,
    );
    const anchor =
      currentLocation ??
      (personWithLocation?.latitude != null &&
      personWithLocation.longitude != null
        ? {
            latitude: personWithLocation.latitude,
            longitude: personWithLocation.longitude,
          }
        : null);

    useImperativeHandle(
      ref,
      () => ({
        centerOn(point: MapPoint) {
          mapRef.current?.animateToRegion(
            { ...point, latitudeDelta: 0.012, longitudeDelta: 0.012 },
            650,
          );
        },
      }),
      [],
    );

    if (!anchor) return null;

    return (
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          latitudeDelta: 0.018,
          longitudeDelta: 0.018,
        }}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        mapType={process.env.EXPO_OS === 'android' ? 'none' : 'standard'}
        accessibilityLabel="Mapa de ubicaciones compartidas"
      >
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          shouldReplaceMapContent={process.env.EXPO_OS === 'android'}
        />
        {currentLocation ? (
          <Marker
            coordinate={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
            }}
            title="Tu ubicación"
            description="Solo visible para tus personas vinculadas."
            tracksViewChanges={false}
          >
            <View style={[styles.pin, { backgroundColor: colors.primary }]}>
              <Ionicons name="navigate" size={19} color="#ffffff" />
            </View>
          </Marker>
        ) : null}
        {connections.map((person) =>
          person.latitude != null && person.longitude != null ? (
            <Marker
              key={person.userId}
              coordinate={{
                latitude: person.latitude,
                longitude: person.longitude,
              }}
              title={person.displayName}
              description={person.locationUpdatedAt?.toString() ?? 'Ubicación reciente'}
              onPress={() => onSelectPerson(person)}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.personPin,
                  {
                    backgroundColor:
                      selectedUserId === person.userId
                        ? colors.primary
                        : colors.foreground,
                  },
                ]}
              >
                <Ionicons name="person" size={17} color="#ffffff" />
              </View>
            </Marker>
          ) : null,
        )}
      </MapView>
    );
  },
);

SharedMap.displayName = 'SharedMap';
export default SharedMap;

const styles = StyleSheet.create({
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
});
