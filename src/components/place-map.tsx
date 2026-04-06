"use client";

import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";

import type { PlaceAnalysis } from "@/lib/types";

const DEFAULT_CENTER = { latitude: -6.3088, longitude: 106.7045 };
const DEFAULT_ZOOM = 12;

type MarkerEntry = {
  marker: CircleMarker;
  latitude: number;
  longitude: number;
  priority: PlaceAnalysis["priority"];
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
    fillOpacity: isSelected ? 0.95 : 0.8,
    opacity: 1,
    weight: isSelected ? 2.6 : 1.2,
    radius: isSelected ? 9.5 : priority === "high" ? 6.8 : priority === "medium" ? 5.8 : 5,
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const markerRefs = useRef<Map<string, MarkerEntry>>(new Map());
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
        dragging: true,
        scrollWheelZoom: true,
        touchZoom: true,
        doubleClickZoom: true,
        boxZoom: false,
        keyboard: false,
        zoomSnap: 0.25,
      }).setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], DEFAULT_ZOOM);

      L.control
        .zoom({
          position: "topright",
        })
        .addTo(map);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);

      mapRef.current = map;
      layerRef.current = layer;

      requestAnimationFrame(() => {
        map.invalidateSize();
      });
    }

    void setupMap();

    return () => {
      isMounted = false;
      markerRefs.current.clear();
      layerRef.current = null;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function renderMarkers() {
      if (!mapRef.current || !layerRef.current) {
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

        const isSelected = place.placeId === selectedPlaceId;
        const marker = L.circleMarker(
          [place.latitude, place.longitude],
          markerStyle(place.priority, isSelected),
        );

        marker.bindTooltip(place.name, {
          direction: "top",
          offset: [0, -8],
          opacity: 0.95,
          sticky: true,
        });

        marker.on("click", () => {
          handleSelectPlace(place.placeId);
        });

        marker.addTo(layerRef.current);

        markerRefs.current.set(place.placeId, {
          marker,
          latitude: place.latitude,
          longitude: place.longitude,
          priority: place.priority,
        });
      }

      if (!validPlaces.length) {
        mapRef.current.setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], DEFAULT_ZOOM);
        return;
      }

      const selectedMarker = selectedPlaceId ? markerRefs.current.get(selectedPlaceId) : null;

      if (selectedMarker) {
        mapRef.current.setView(
          [selectedMarker.latitude, selectedMarker.longitude],
          Math.max(mapRef.current.getZoom(), 14),
        );
        selectedMarker.marker.openTooltip();
        return;
      }

      if (validPlaces.length === 1) {
        mapRef.current.setView(
          [validPlaces[0].latitude as number, validPlaces[0].longitude as number],
          14,
        );
        return;
      }

      const bounds = L.latLngBounds(
        validPlaces.map((place) => [place.latitude as number, place.longitude as number]),
      );
      mapRef.current.fitBounds(bounds.pad(0.1), {
        animate: false,
        maxZoom: 13,
      });
    }

    void renderMarkers();

    return () => {
      isMounted = false;
    };
  }, [handleSelectPlace, selectedPlaceId, validPlaces]);

  useEffect(() => {
    for (const [placeId, entry] of markerRefs.current.entries()) {
      const isSelected = placeId === selectedPlaceId;
      entry.marker.setStyle(markerStyle(entry.priority, isSelected));

      if (isSelected) {
        entry.marker.bringToFront();
      }
    }
  }, [selectedPlaceId]);

  return (
    <div className="map-shell">
      <div className="map-canvas" ref={containerRef} />
      {!validPlaces.length ? (
        <div className="map-empty">
          <strong>Pin lokasi belum tersedia</strong>
          <span>Tempat yang dipilih belum punya koordinat publik yang cukup.</span>
        </div>
      ) : null}
    </div>
  );
}
