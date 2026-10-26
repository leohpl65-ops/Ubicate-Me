export type MapPoint = {
  latitude: number;
  longitude: number;
};

export type SharedMapHandle = {
  centerOn: (point: MapPoint) => void;
};
