import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  Popup,
  WMSTileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import icon2x from "leaflet/dist/images/marker-icon-2x.png";
import icon1x from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import { supabase } from "@/lib/supabase";
import { useUnitPreferences } from "@/contexts/UnitPreferencesContext";
import { Link } from "react-router-dom";
import BuoyStats from "@/components/Buoy/BuoyStats";


// Fix default Leaflet marker icons under Vite
const buoyIcon = L.icon({
   iconUrl: "https://img.icons8.com/ios-filled/100/buoy.png",
   iconSize: [28, 28],      // tweak to your asset
   iconAnchor: [14, 28],
  popupAnchor: [0, -28],
 });

type Buoy = {
  id: number;
  buoy_id: string;
  name: string;
  latitude: number;
  longitude: number;
  description?: string | null;
  obs_dataset_id?: string | null;
  platform_id?: string | null;
  webcam?: string | null;
};

const LAKE_ERIE_BOUNDS: [number, number, number, number] = [41.3, -83.5, 42.9, -78.8];

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points).pad(0.15));
  }, [map, points]);
  return null;
}

const UNIT_OPTIONS: Record<keyof ReturnType<typeof useUnitPreferences>["unitPreferences"], string[]> = {
  temperature: ["°C", "K", "°F"],
  pressure: ["Pa", "Psi", "kPa"],
  speed: ["m/s", "cm/s", "knots", "mph"],
  distance: ["m", "ft"],
  concentration: ["g/L", "μg/L"],
};

export default function MapView() {
  const [buoys, setBuoys] = useState<Buoy[]>([]);
  const [selected, setSelected] = useState<Buoy | null>(null);
  const [showUnits, setShowUnits] = useState(false);
  const [showTemp, setShowTemp] = useState(false);
  const { unitPreferences, updatePreference } = useUnitPreferences();

  const [wmsTime, setWmsTime] = useState<string>("");
  const user = import.meta.env.VITE_METEOMATICS_USERNAME as string | undefined;
  const pass = import.meta.env.VITE_METEOMATICS_PASSWORD as string | undefined;
  const [token, setToken] = useState<string | null>(null);
  const credsPresent = Boolean(user && pass);

  // Fetch buoys
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("buoys").select("*").order("name");
      if (!alive) return;
      if (!error) setBuoys((data ?? []) as Buoy[]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // WMS time (rounded to minute)
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      now.setSeconds(0, 0);
      setWmsTime(now.toISOString().replace(/\.\d{3}Z$/, "Z"));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // Meteomatics token
  const fetchToken = useCallback(async () => {
    if (!credsPresent) return;
    try {
      const res = await fetch("https://login.meteomatics.com/api/v1/token", {
        headers: { Authorization: "Basic " + btoa(`${user}:${pass}`) },
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { access_token?: string };
      setToken(j.access_token ?? null);
    } catch {
      setToken(null);
    }
  }, [credsPresent, user, pass]);

  useEffect(() => {
    if (!token && credsPresent) fetchToken();
  }, [token, credsPresent, fetchToken]);

  // Points for fit-bounds
  const points = useMemo<[number, number][]>(() => buoys.map((b) => [b.latitude, b.longitude]), [buoys]);

  // Default center from bounds
  const defaultCenter: [number, number] = [
    (LAKE_ERIE_BOUNDS[0] + LAKE_ERIE_BOUNDS[2]) / 2,
    (LAKE_ERIE_BOUNDS[1] + LAKE_ERIE_BOUNDS[3]) / 2,
  ];

  return (
    <div className="relative">
      {/* Layer toggle (top-left) */}
      <div className="absolute left-3 top-3 z-[1000]">
        <button
          className="rounded-xl border border-border bg-card/80 backdrop-blur px-3 py-2 text-xs shadow-soft disabled:opacity-60"
          onClick={() => setShowTemp((s) => !s)}
          disabled={!credsPresent}
          aria-pressed={showTemp}
          aria-label="Toggle Air Temperature Layer"
          title={
            credsPresent ? (showTemp ? "Hide Air Temp (Meteomatics)" : "Show Air Temp (Meteomatics)")
            : "Set VITE_METEOMATICS_USERNAME & VITE_METEOMATICS_PASSWORD to enable"
          }
        >
          {showTemp ? "Hide" : "Show"} Air Temp
        </button>
      </div>

      {/* Map */}
      <MapContainer
        center={defaultCenter}
        zoom={8}
        scrollWheelZoom
        className="h-[calc(100dvh-3.5rem-4rem)] w-full"  // 3.5rem header (h-14) + 4rem bottom nav (h-16)
    >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Optional WMS Air Temperature layer */}
 {showTemp && token && wmsTime && (
  <WMSTileLayer
    // Pass the TIME parameter in the URL to avoid TS narrow typing on WMSParams
    url={`https://api.meteomatics.com/wms?access_token=${token}&time=${encodeURIComponent(wmsTime)}`}
    layers="t_2m:K"
    format="image/png"
    transparent
    version="1.3.0"
    opacity={0.6}
    attribution="&copy; Meteomatics"
    crs={L.CRS.EPSG4326}
  />
)}
        {points.length > 0 && <FitBounds points={points} />}

        <MarkerClusterGroup chunkedLoading showCoverageOnHover={false} spiderLegPolylineOptions={{ weight: 0 }}>
          {buoys.map(b => (
         <Marker key={b.id} position={[b.latitude, b.longitude]} icon={buoyIcon}>
  {/* Name under the marker */}
  <Tooltip
    permanent
    direction="bottom"
    offset={[0, 14]}
    className="label-under"
  >
    {b.name}
  </Tooltip>

  {/* Actions only; uniform surface via .popup-bare */}
  <Popup className="popup-bare">
    <div className="min-w-[220px] p-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          className="h-9 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition ease-out-custom"
          onClick={() => setSelected(b)}
          aria-label={`Open realtime data for ${b.name}`}
        >
          Realtime Data
        </button>

        <Link
          className="h-9 rounded-lg border border-border text-sm grid place-items-center hover:bg-white/5 transition ease-out-custom"
          to={`/trends?buoy=${encodeURIComponent(b.buoy_id ?? String(b.id))}`}
          aria-label={`View trends for ${b.name}`}
        >
          View Trends
        </Link>
      </div>
    </div>
  </Popup>
</Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Fullscreen overlay for selected buoy */}
      {selected && (
        <div
          className="fixed inset-0 z-[1100] bg-gradient-to-br from-[#0b1a2b] to-[#132c47] text-white"
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute right-4 top-3">
            <button
              onClick={() => setSelected(null)}
              className="rounded-md border border-white/50 px-3 py-1 text-sm hover:bg-white/10"
              aria-label="Back"
            >
              ← Back
            </button>
          </div>

          <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 p-4 pt-14">
            <div className="text-center">
              <h2 className="text-xl font-semibold">{selected.name}</h2>
              <div className="mt-1 text-sm text-white/80">
                <b>Lat:</b> {selected.latitude}, <b>Lon:</b> {selected.longitude}
              </div>
              {selected.description && (
                <div className="mt-1 text-sm text-white/80">{selected.description}</div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/80">
              {selected.obs_dataset_id && <span>Dataset: {selected.obs_dataset_id}</span>}
              {selected.platform_id && <span>Platform: {selected.platform_id}</span>}
              <Link
                to={`/trends?buoy=${selected.id}`}
                className="rounded-xl border border-white/30 px-3 py-1 text-white hover:bg-white/10"
              >
                Open Trends →
              </Link>
            </div>

            {/* Webcam, if present */}
            {selected.webcam && (
              <div className="mx-auto w-full max-w-4xl grow">
                <video
                  className="h-[60vh] w-full rounded-lg border border-white/30 object-cover"
                  controls
                  autoPlay
                  muted
                  playsInline
                >
                  <source src={selected.webcam} type="video/mp4" />
                </video>
              </div>
            )}

            {/* Units floating button (bottom-right) */}
      <div className="fixed right-3 bottom-[1.5rem] z-[1300] pb-[env(safe-area-inset-bottom)]">
        <button
          className="rounded-xl border-2 border-solid border-blue-500 border-border bg-card/80 backdrop-blur px-3 py-2 text-sm text-black shadow-soft"
          onClick={() => setShowUnits((s) => !s)}
          aria-expanded={showUnits}
        >
          ⚙️ Units
        </button>

        {showUnits && (
          <div className="absolute right-0 bottom-full mb-2 w-64 rounded-xl border border-border bg-card/95 p-3 shadow-soft">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Unit Preferences</h3>
              <button
                className="text-sm text-muted hover:opacity-80"
                onClick={() => setShowUnits(false)}
                aria-label="Close unit panel"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {(Object.keys(unitPreferences) as Array<keyof typeof unitPreferences>).map((key) => (
                <label key={key} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
                  <span className="capitalize">{key}</span>
                  <select
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                    value={unitPreferences[key]}
                    onChange={(e) => updatePreference(key, e.target.value as any)}
                  >
                    {UNIT_OPTIONS[key].map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>


            {selected && (
              <BuoyStats
              buoy={selected}
              onClose={() => setSelected(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
