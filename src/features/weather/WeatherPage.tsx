import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getCachedWeather, getReverseGeocoding } from "../../utils/weather";
import { WeatherMap } from "./WeatherMap";

interface WeatherData {
  temperatureAvg: number;
  temperatureApparentAvg: number;
  temperatureMax: number;
  temperatureMin: number;
  humidityAvg: number;
  windSpeedAvg: number;
  uvIndexMax: number;
  visibilityAvg: number | null;
  pressureSurfaceLevelAvg: number;
  precipitationProbabilityAvg: number;
  weatherCode: number;
}

interface ForecastDay {
  time: string;
  values: {
    temperatureMax: number;
    temperatureMin: number;
    precipitationProbabilityAvg: number;
    weatherCode: number;
  };
}

interface LocationData {
  name: string;
  lat: number;
  lng: number;
}

export function WeatherPage({ kiosk = false }: { kiosk?: boolean }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const settingsRes = await apiFetch("/api/settings");
        const settings = await settingsRes.json();

        if (settings.weather_location) {
          let lat, lng;

          if (settings.weather_location.includes(",")) {
            const parts = settings.weather_location.split(",");
            if (parts.length === 2) {
              lat = parseFloat(parts[0].trim());
              lng = parseFloat(parts[1].trim());
              setLocation({ name: "Local Coordinates", lat, lng });
            }
          }

          if (!lat) {
            const isZip = /^\d{5}$/.test(settings.weather_location.trim());
            if (isZip) {
              try {
                const zipRes = await apiFetch(
                  `https://api.zippopotam.us/us/${settings.weather_location.trim()}`,
                );
                if (zipRes.ok) {
                  const zipData = await zipRes.json();
                  lat = parseFloat(zipData.places[0].latitude);
                  lng = parseFloat(zipData.places[0].longitude);
                  setLocation({
                    name: `${zipData.places[0]["place name"]}, ${zipData.places[0]["state abbreviation"]}`,
                    lat,
                    lng,
                  });
                }
              } catch (e) {
                console.error(e);
              }
            }

            if (!lat) {
              const geoRes = await apiFetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(settings.weather_location)}&count=1&language=en&format=json`,
              );
              const geoData = await geoRes.json();
              if (geoData.results && geoData.results.length > 0) {
                lat = geoData.results[0].latitude;
                lng = geoData.results[0].longitude;
                setLocation({ name: geoData.results[0].name, lat, lng });
              }
            }
          }

          if (lat && lng) {
            try {
              if (!location?.name || location.name === "Local Coordinates") {
                getReverseGeocoding(lat, lng).then((name) => {
                  if (name)
                    setLocation((prev) =>
                      prev ? { ...prev, name } : { name, lat, lng },
                    );
                });
              }

              const omData = await getCachedWeather(lat, lng);

              if (omData && omData.daily && omData.current) {
                const mappedForecast = omData.daily.time.map(
                  (t: string, i: number) => ({
                    time: t,
                    values: {
                      temperatureMax: omData.daily.temperature_2m_max[i],
                      temperatureMin: omData.daily.temperature_2m_min[i],
                      precipitationProbabilityAvg:
                        omData.daily.precipitation_probability_max[i],
                      weatherCode: omData.daily.weather_code[i],
                    },
                  }),
                );
                setForecast(mappedForecast);

                setWeather({
                  temperatureAvg: omData.current.temperature_2m,
                  temperatureApparentAvg: omData.current.apparent_temperature,
                  temperatureMax: omData.daily.temperature_2m_max[0],
                  temperatureMin: omData.daily.temperature_2m_min[0],
                  humidityAvg: omData.current.relative_humidity_2m,
                  windSpeedAvg: omData.current.wind_speed_10m,
                  uvIndexMax: omData.daily.uv_index_max[0],
                  visibilityAvg: null,
                  pressureSurfaceLevelAvg: omData.current.surface_pressure,
                  precipitationProbabilityAvg:
                    omData.daily.precipitation_probability_max[0],
                  weatherCode: omData.current.weather_code,
                });
              }
            } catch (e) {
              console.error("Forecast fetch failed", e);
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const pollInfo = setInterval(fetchData, 30 * 60 * 1000);
    return () => clearInterval(pollInfo);
  }, []);

  const getWeatherIcon = (code: number, size = 24) => {
    if (code === 0)
      return <Sun className="text-amber-500 drop-shadow-sm" size={size} />;
    if (code >= 1 && code <= 3)
      return <CloudSun className="text-amber-400 drop-shadow-sm" size={size} />;
    if (code >= 45 && code <= 48)
      return <Cloud className="text-slate-400 drop-shadow-sm" size={size} />;
    if (code >= 51 && code <= 67)
      return (
        <CloudRain className="text-indigo-400 drop-shadow-sm" size={size} />
      );
    if (code >= 71 && code <= 77)
      return (
        <CloudSnow className="text-indigo-200 drop-shadow-sm" size={size} />
      );
    if (code >= 80 && code <= 82)
      return (
        <CloudRain className="text-indigo-500 drop-shadow-sm" size={size} />
      );
    if (code >= 85 && code <= 86)
      return (
        <CloudSnow className="text-indigo-200 drop-shadow-sm" size={size} />
      );
    if (code >= 95 && code <= 99)
      return (
        <CloudLightning
          className="text-purple-600 drop-shadow-sm"
          size={size}
        />
      );
    return <CloudSun className="text-amber-400 drop-shadow-sm" size={size} />;
  };

  const getWeatherLabel = (code: number) => {
    if (code === 0) return "Sunny";
    if (code === 1) return "Mainly Sunny";
    if (code === 2) return "Partly Cloudy";
    if (code === 3) return "Overcast";
    if (code >= 45 && code <= 48) return "Foggy";
    if (code >= 51 && code <= 57) return "Drizzle";
    if (code >= 61 && code <= 65) return "Rainy";
    if (code >= 66 && code <= 67) return "Freezing Rain";
    if (code >= 71 && code <= 77) return "Snowy";
    if (code >= 80 && code <= 82) return "Rain Showers";
    if (code >= 85 && code <= 86) return "Snow Showers";
    if (code >= 95 && code <= 99) return "Thunderstorm";
    return "Clear";
  };

  if (loading)
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <div className="text-gray-400 font-medium">Loading Weather...</div>
        </div>
      </div>
    );

  if (!location) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl shadow-indigo-500/5 ring-1 ring-black/5">
          <Cloud
            size={64}
            className="text-indigo-300 dark:text-indigo-700 mx-auto mb-6"
          />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Location Not Set
          </h2>
          {!kiosk && (
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Please go to{" "}
              <span className="font-semibold text-indigo-500">Settings</span>{" "}
              and enter your Zip Code or City to see the weather.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Kiosk Mode (Using the new design system lightly)
  if (kiosk) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 pb-2 shrink-0"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight tracking-tight">
                {location?.name}
              </h2>
              <p className="text-indigo-500 dark:text-indigo-400 text-sm font-semibold uppercase tracking-wider mt-1">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            {weather && (
              <div className="text-right flex items-center gap-4 bg-white dark:bg-gray-900 px-4 py-2 rounded-2xl shadow-sm ring-1 ring-black/5">
                {getWeatherIcon(weather.weatherCode, 32)}
                <span className="text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                  {Math.round(weather.temperatureAvg)}°
                </span>
              </div>
            )}
          </div>
        </motion.div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6 px-6 pb-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
          >
            {weather && (
              <div className="py-2 grid grid-cols-2 gap-3 text-sm shrink-0 mb-2">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 rounded-xl px-4 py-3 shadow-sm ring-1 ring-black/5">
                  <span>💧</span>
                  <span className="font-medium">
                    {weather.humidityAvg}% humidity
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 rounded-xl px-4 py-3 shadow-sm ring-1 ring-black/5">
                  <span>💨</span>
                  <span className="font-medium">
                    {Math.round(weather.windSpeedAvg)} mph wind
                  </span>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {forecast.map((day, index) => {
                const date = new Date(day.time);
                return (
                  <motion.div
                    key={day.time}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                    className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-black/5"
                  >
                    <div className="text-xs font-bold text-gray-400 dark:text-gray-500 w-12 uppercase tracking-wide">
                      {date.toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div className="flex items-center gap-2">
                      {getWeatherIcon(day.values.weatherCode)}
                    </div>
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200 w-24 text-right tabular-nums">
                      <span className="text-gray-900 dark:text-white">
                        {Math.round(day.values.temperatureMax)}°
                      </span>{" "}
                      <span className="text-gray-400 dark:text-gray-600 font-medium">
                        / {Math.round(day.values.temperatureMin)}°
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full md:w-1/2 h-full rounded-3xl overflow-hidden shadow-lg ring-4 ring-white dark:ring-gray-800 relative z-0"
          >
            {location ? (
              <WeatherMap lat={location.lat} lng={location.lng} />
            ) : (
              <div className="h-full w-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  // Desktop Main View
  return (
    <div className="h-full flex flex-col md:flex-row overflow-y-auto md:overflow-hidden bg-gray-50/50 dark:bg-gray-950">
      {/* Left Panel: Current & Forecast */}
      <div className="w-full md:w-[400px] lg:w-[450px] flex flex-col shrink-0 border-b md:border-b-0 md:border-r border-gray-200/50 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl overflow-y-auto z-10">
        <div className="p-8 pb-6">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-1">
            {location?.name || "Unknown Location"}
          </h2>
          <p className="text-indigo-500 dark:text-indigo-400 text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />{" "}
            Live Weather
          </p>
        </div>

        {weather && (
          <div className="px-8 pb-8 space-y-8">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden">
              {/* Decorative Circles */}
              <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 rounded-full bg-black/10 blur-2xl" />

              <div className="flex items-start justify-between relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1 opacity-90">
                    {getWeatherIcon(weather.weatherCode, 20)}
                    <span className="text-lg font-medium">
                      {getWeatherLabel(weather.weatherCode)}
                    </span>
                  </div>
                  <div className="text-7xl font-bold tracking-tighter mb-2">
                    {Math.round(weather.temperatureAvg)}°
                  </div>
                </div>
                <div className="text-right space-y-1 py-1">
                  <div className="flex items-center justify-end gap-1 font-medium bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg text-sm">
                    <ArrowUp size={14} /> {Math.round(weather.temperatureMax)}°
                  </div>
                  <div className="flex items-center justify-end gap-1 font-medium bg-black/10 backdrop-blur-sm px-3 py-1 rounded-lg text-sm">
                    <ArrowDown size={14} /> {Math.round(weather.temperatureMin)}
                    °
                  </div>
                </div>
              </div>
              <div className="relative z-10 text-white/80 font-medium text-sm mt-2">
                Feels like {Math.round(weather.temperatureApparentAvg)}°
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Humidity",
                  value: `${weather.humidityAvg}%`,
                  emoji: "💧",
                },
                {
                  label: "Wind",
                  value: `${Math.round(weather.windSpeedAvg)} mph`,
                  emoji: "💨",
                },
                {
                  label: "UV Index",
                  value: `${weather.uvIndexMax || 0}`,
                  emoji: "☀️",
                },
                {
                  label: "Visibility",
                  value: weather.visibilityAvg
                    ? `${Math.round(weather.visibilityAvg)} mi`
                    : "--",
                  emoji: "👁️",
                },
                {
                  label: "Pressure",
                  value: `${Math.round(weather.pressureSurfaceLevelAvg)} hPa`,
                  emoji: "🌡️",
                },
                {
                  label: "Precip",
                  value: `${weather.precipitationProbabilityAvg}%`,
                  emoji: "☔",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-colors"
                >
                  <div className="text-lg mb-1">{item.emoji}</div>
                  <div className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">
                    {item.label}
                  </div>
                  <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 px-4 pb-4 space-y-1">
          <h3 className="px-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            7-Day Forecast
          </h3>
          {forecast.map((day) => {
            const date = new Date(day.time);
            return (
              <div
                key={day.time}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14">
                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                      {date.toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-200">
                      {date.getDate()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getWeatherIcon(day.values.weatherCode)}
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {getWeatherLabel(day.values.weatherCode)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-right">
                    <span className="text-sm font-bold text-gray-900 dark:text-white w-8">
                      {Math.round(day.values.temperatureMax)}°
                    </span>
                    <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative">
                      <div
                        className="absolute inset-y-0 bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 rounded-full opacity-80"
                        style={{ left: "0%", right: "0%" }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 w-6 text-right">
                      {Math.round(day.values.temperatureMin)}°
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel: Map */}
      <div className="flex-1 h-[400px] md:h-full bg-gray-100 dark:bg-gray-950/50 p-3 md:p-6 relative">
        <div className="h-full w-full rounded-[2rem] overflow-hidden shadow-2xl shadow-indigo-500/5 ring-1 ring-black/5 dark:ring-white/5 relative z-0">
          {location ? (
            <WeatherMap lat={location.lat} lng={location.lng} />
          ) : (
            <div className="h-full w-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}
