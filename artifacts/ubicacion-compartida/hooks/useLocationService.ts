import { useCallback } from 'react';
import * as Location from 'expo-location';

export type LocationCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type LocationPermission = {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
};

export type LocationSubscription = { remove: () => void };

export function useLocationService() {
  const [nativePermission, requestNativePermission] =
    Location.useForegroundPermissions();

  const requestPermission = useCallback(async () => {
    const result = await requestNativePermission();
    return {
      granted: result.granted,
      canAskAgain: result.canAskAgain,
      status: result.status,
    };
  }, [requestNativePermission]);

  const watchPosition = useCallback(
    (onUpdate: (coords: LocationCoordinates) => void) =>
      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,
          distanceInterval: 15,
        },
        (position) => onUpdate(position.coords),
      ),
    [],
  );

  return {
    permission: nativePermission
      ? {
          granted: nativePermission.granted,
          canAskAgain: nativePermission.canAskAgain,
          status: nativePermission.status,
        }
      : null,
    requestPermission,
    watchPosition,
  };
}
