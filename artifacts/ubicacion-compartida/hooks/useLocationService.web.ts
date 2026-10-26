import { useCallback, useState } from 'react';

export type LocationCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type LocationPermission = {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'undetermined';
};

export type LocationSubscription = { remove: () => void };

function permissionFromPosition(
  granted: boolean,
  canAskAgain: boolean,
): LocationPermission {
  return {
    granted,
    canAskAgain,
    status: granted ? 'granted' : canAskAgain ? 'undetermined' : 'denied',
  };
}

export function useLocationService() {
  const [permission, setPermission] = useState<LocationPermission | null>({
    granted: false,
    canAskAgain: true,
    status: 'undetermined',
  });

  const requestPermission = useCallback(
    () =>
      new Promise<LocationPermission>((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          const denied = permissionFromPosition(false, false);
          setPermission(denied);
          resolve(denied);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          () => {
            const allowed = permissionFromPosition(true, true);
            setPermission(allowed);
            resolve(allowed);
          },
          (error) => {
            const denied = permissionFromPosition(
              false,
              error.code !== error.PERMISSION_DENIED,
            );
            setPermission(denied);
            resolve(denied);
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 },
        );
      }),
    [],
  );

  const watchPosition = useCallback(
    (onUpdate: (coords: LocationCoordinates) => void) =>
      new Promise<LocationSubscription>((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          reject(new Error('La geolocalización no está disponible en este navegador.'));
          return;
        }

        const watchId = navigator.geolocation.watchPosition(
          ({ coords }) =>
            onUpdate({
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: coords.accuracy,
            }),
          reject,
          { enableHighAccuracy: false, maximumAge: 10000, timeout: 20000 },
        );
        resolve({ remove: () => navigator.geolocation.clearWatch(watchId) });
      }),
    [],
  );

  return { permission, requestPermission, watchPosition };
}
