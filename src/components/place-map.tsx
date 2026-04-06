"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";

import type { PlaceAnalysis } from "@/lib/types";

const DEFAULT_CENTER = { latitude: -6.3088, longitude: 106.7045 };
const DEFAULT_ZOOM = 12;

type MarkerEntry = {
  marker: CircleMarker;
  priority: PlaceAnalysis["priority"];
  latitude: number;
  longitude: number;
};

function markerColor(priority: PlaceAnalysis["priority"]) {
  switch (priority) {
    case "high":
      return "#ef4444";
    case "medium":
      return "#f59e0b";
    default:
      return "#0fa968";
  }
}

function markerStyle(priority: PlaceAnalysis["priority"], isSelected: boolean) {
  return {
    color: isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.72)",
    fillColor: markerColor(priority),
    fillOpacity: isSelected ? 0.95 : 0.78,
    opacity: 1,
    weight: isSelected ? 2.6 : 1.2,
    radius: isSelected ? 10 : priority === "high" ? 7.4 : priority === "medium" ? 6.2 : 5.2,
  };
}

interface PlaceMapProps {
  places: PlaceAnalysis[];
  selectedPlaceId: string | null;
  onSelectPlace: (placeId: string) => void;
}

export function PlaceMap({
  places,
  selectedPlaceId,
  onSelectPlace,
}: PlaceMapProps) {
  const [isMapReady, setIsMapReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const markerRefs = useRef<Map<string, MarkerEntry>>(new Map());
  const previousPlacesKeyRef = useRef<string>("");
  const hasInitialFitRef = useRef(false);
  const handleSelectPlace = useEffectEvent((placeId: string) => {
    onSelectPlace(placeId);
  });

  const validPlaces = useMemo(
    () =>
      places.filter(
        (place) =>
          typeof place.latitude === "number" &&
          typeof place.longitude === "number",
      ),
    [places],
  );

  useEffect(() => {
    let isMounted = true;

    async function setupMap() {
      if (!containerRef.current || mapRef.current) {
        return;
      }

      const L = await import("leaflet");

      if (!isMounted || !containerRef.current || mapRef.current) {
        return;
      }

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], DEFAULT_ZOOM);

      L.control
        .zoom({
          position: "topright",
        })
        .addTo(map);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);

      mapRef.current = map;
      layerRef.current = layer;
      setIsMapReady(true);
    }

    void setupMap();

    return () => {
      isMounted = false;
      markerRefs.current.clear();
      layerRef.current = null;
      previousPlacesKeyRef.current = "";
      hasInitialFitRef.current = false;
      setIsMapReady(false);

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function syncMarkers() {
      if (!isMapReady || !mapRef.current || !layerRef.current) {
        return;
      }

      const placesKey = validPlaces.map((place) => place.placeId).join("|");
      const markersChanged = previousPlacesKeyRef.current !== placesKey;

      if (!markersChanged) {
        return;
      }

      const L = await import("leaflet");

      if (!isMounted || !mapRef.current || !layerRef.current) {
        return;
      }

      markerRefs.current.clear();
      layerRef.current.clearLayers();

      for (const place of validPlaces) {
        if (place.latitude == null || place.longitude == null) {
          continue;
        }

        const marker = L.circleMarker([place.latitude, place.longitude], markerStyle(place.priority, place.placeId === selectedPlaceId));
        marker.bindTooltip(place.name, {
          direction: "top",
          offset: [0, -10],
          opacity: 0.95,
        });
        marker.on("click", () => {
          handleSelectPlace(place.placeId);
        });
        marker.addTo(layerRef.current);

        markerRefs.current.set(place.placeId, {
          marker,
          priority: place.priority,
          latitude: place.latitude,
          longitude: place.longitude,
        });
      }

      if (validPlaces.length > 0) {
        const bounds = L.latLngBounds(
          validPlaces.map((place) => [place.latitude as number, place.longitude as number]),
        );

        if (!hasInitialFitRef.current) {
          mapRef.current.fitBounds(bounds.pad(0.08), {
            animate: false,
            maxZoom: 13,
          });
          hasInitialFitRef.current = true;
        } else {
          mapRef.current.fitBounds(bounds.pad(0.06), {
            animate: true,
            duration: 0.5,
            maxZoom: 13,
          });
        }
      } else {
        mapRef.current.setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], DEFAULT_ZOOM);
      }

      previousPlacesKeyRef.current = placesKey;
    }

    void syncMarkers();

    return () => {
      isMounted = false;
    };
  }, [handleSelectPlace, isMapReady, selectedPlaceId, validPlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    for (const [placeId, entry] of markerRefs.current.entries()) {
      entry.marker.setStyle(markerStyle(entry.priority, placeId === selectedPlaceId));

      if (placeId === selectedPlaceId) {
        entry.marker.bringToFront();
      }
    }

    if (!selectedPlaceId) {
      return;
    }

    const selected = markerRefs.current.get(selectedPlaceId);
    if (!selected) {
      return;
    }

    map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 13), {
      animate: true,
      duration: 0.55,
    });
    selected.marker.openTooltip();
  }, [selectedPlaceId]);

  return (
    <div className="map-shell">
      <div className="map-canvas" ref={containerRef} />
      {validPlaces.length === 0 ? (
        <div className="map-empty">
          <strong>Belum ada titik yang bisa dipetakan</strong>
          <span>Coba ubah filter atau jalankan sync ulang snapshot.</span>
        </div>
      ) : null}
    </div>
  );
}
