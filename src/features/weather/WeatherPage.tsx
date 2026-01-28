import { useState, useEffect } from 'react';
import { Cloud, Droplets, Wind, Eye, Sun, Gauge, Umbrella, ArrowUp, ArrowDown, CloudSun, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';
import { motion } from 'framer-motion';
import { WeatherMap } from './WeatherMap';
import { getCachedWeather, getReverseGeocoding } from '../../utils/weather';
import { Card, CardContent } from '../../components/ui';

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
        const settingsRes = await fetch('/api/settings');
        const settings = await settingsRes.json();

        if (settings.weather_location) {
          let lat, lng;

          if (settings.weather_location.includes(',')) {
            const parts = settings.weather_location.split(',');
            if (parts.length === 2) {
              lat = parseFloat(parts[0].trim());
              lng = parseFloat(parts[1].trim());
              setLocation({ name: 'Local Coordinates', lat, lng });
            }
          }

          if (!lat) {
            const isZip = /^\d{5}$/.test(settings.weather_location.trim());
            if (isZip) {
              try {
                const zipRes = await fetch(`https://api.zippopotam.us/us/${settings.weather_location.trim()}`);
                if (zipRes.ok) {
                  const zipData = await zipRes.json();
                  lat = parseFloat(zipData.places[0].latitude);
                  lng = parseFloat(zipData.places[0].longitude);
                  setLocation({
                    name: `${zipData.places[0]['place name']}, ${zipData.places[0]['state abbreviation']}`,
                    lat,
                    lng,
                  });
                }
              } catch (e) {
                console.error(e);
              }
            }

            if (!lat) {
              const geoRes = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(settings.weather_location)}&count=1&language=en&format=json`
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
              if (!location?.name || location.name === 'Local Coordinates') {
                getReverseGeocoding(lat, lng).then(name => {
                  if (name) setLocation(prev => (prev ? { ...prev, name } : { name, lat, lng }));
                });
              }

              const omData = await getCachedWeather(lat, lng);

              if (omData && omData.daily && omData.current) {
                const mappedForecast = omData.daily.time.map((t: string, i: number) => ({
                  time: t,
                  values: {
                    temperatureMax: omData.daily.temperature_2m_max[i],
                    temperatureMin: omData.daily.temperature_2m_min[i],
                    precipitationProbabilityAvg: omData.daily.precipitation_probability_max[i],
                    weatherCode: omData.daily.weather_code[i],
                  },
                }));
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
                  precipitationProbabilityAvg: omData.daily.precipitation_probability_max[0],
                  weatherCode: omData.current.weather_code,
                });
              }
            } catch (e) {
              console.error('Forecast fetch failed', e);
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
    if (code === 0) return <Sun className="text-amber-400" size={size} />;
    if (code >= 1 && code <= 3) return <CloudSun className="text-amber-400" size={size} />;
    if (code >= 45 && code <= 48) return <Cloud className="text-gray-400" size={size} />;
    if (code >= 51 && code <= 67) return <CloudRain className="text-blue-400" size={size} />;
    if (code >= 71 && code <= 77) return <CloudSnow className="text-sky-200" size={size} />;
    if (code >= 80 && code <= 82) return <CloudRain className="text-blue-500" size={size} />;
    if (code >= 85 && code <= 86) return <CloudSnow className="text-sky-200" size={size} />;
    if (code >= 95 && code <= 99) return <CloudLightning className="text-purple-500" size={size} />;
    return <CloudSun className="text-amber-400" size={size} />;
  };

  const getWeatherLabel = (code: number) => {
    if (code === 0) return 'Sunny';
    if (code === 1) return 'Mainly Sunny';
    if (code === 2) return 'Partly Cloudy';
    if (code === 3) return 'Overcast';
    if (code >= 45 && code <= 48) return 'Foggy';
    if (code >= 51 && code <= 57) return 'Drizzle';
    if (code >= 61 && code <= 65) return 'Rainy';
    if (code >= 66 && code <= 67) return 'Freezing Rain';
    if (code >= 71 && code <= 77) return 'Snowy';
    if (code >= 80 && code <= 82) return 'Rain Showers';
    if (code >= 85 && code <= 86) return 'Snow Showers';
    if (code >= 95 && code <= 99) return 'Thunderstorm';
    return 'Clear';
  };

  if (loading)
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400">Loading Weather...</div>
      </div>
    );

  if (!location) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-white dark:bg-gray-800">
        <Cloud size={64} className="text-gray-300 dark:text-gray-600 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2">Location Not Set</h2>
        {!kiosk && (
          <p className="text-gray-500 dark:text-gray-400 max-w-md">
            Please go to Settings and enter your Zip Code or City.
          </p>
        )}
      </div>
    );
  }

  if (kiosk) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 pb-2 shrink-0"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {location?.name}
              </h2>
              <p className="text-gray-400 dark:text-gray-500 text-xs font-medium uppercase tracking-wider">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            {weather && (
              <div className="text-right flex items-center gap-3">
                {getWeatherIcon(weather.weatherCode, 32)}
                <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                  {Math.round(weather.temperatureAvg)}°
                </span>
              </div>
            )}
          </div>
        </motion.div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 px-6 pb-6">
          {/* Left Panel: Weather Details and Forecast */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
          >
            {weather && (
              <div className="py-2 grid grid-cols-2 gap-2 text-xs shrink-0">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 glass-panel rounded-xl px-3 py-2">
                  <Droplets size={14} className="text-blue-500" />
                  <span>{weather.humidityAvg}% humidity</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 glass-panel rounded-xl px-3 py-2">
                  <Wind size={14} className="text-gray-400" />
                  <span>{Math.round(weather.windSpeedAvg)} mph wind</span>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-2 mt-2">
              {forecast.map((day, index) => {
                const date = new Date(day.time);
                return (
                  <motion.div
                    key={day.time}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                    className="flex items-center justify-between p-3 rounded-xl glass-panel hover:bg-white/60 dark:hover:bg-white/10 transition-colors kiosk-touch"
                  >
                    <div className="text-xs font-bold text-gray-400 dark:text-gray-500 w-10">
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className="flex items-center gap-2">{getWeatherIcon(day.values.weatherCode)}</div>
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200 w-20 text-right">
                      {Math.round(day.values.temperatureMax)}°{' '}
                      <span className="text-gray-400 font-normal">
                        / {Math.round(day.values.temperatureMin)}°
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Right Panel: Radar */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full md:w-1/2 h-full rounded-2xl overflow-hidden border border-white/30 dark:border-white/10 relative z-0"
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

  return (
    <div className="h-full flex flex-col md:flex-row overflow-y-auto md:overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Left Panel: Current & Forecast */}
      <div className="w-full md:w-1/3 flex flex-col shrink-0 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto">
        <div className="p-8 pb-4">
          <h2 className="text-2xl font-bold text-charcoal dark:text-gray-100">
            {location?.name || 'Unknown Location'}
          </h2>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-medium">Daily Forecast</p>
        </div>

        {weather && (
          <div className="px-8 py-6 space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  {getWeatherIcon(weather.weatherCode)}
                  <span className="text-lg font-medium text-gray-600 dark:text-gray-300">
                    {getWeatherLabel(weather.weatherCode)}
                  </span>
                </div>
                <span className="text-7xl font-bold text-charcoal dark:text-gray-100 tracking-tighter">
                  {Math.round(weather.temperatureAvg)}°
                </span>
                <div className="text-gray-500 dark:text-gray-400 font-medium mt-1">
                  Feels like {Math.round(weather.temperatureApparentAvg)}°
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="flex items-center justify-end gap-2 text-orange-500 font-bold">
                  <ArrowUp size={16} /> {Math.round(weather.temperatureMax)}°
                </div>
                <div className="flex items-center justify-end gap-2 text-blue-500 font-bold">
                  <ArrowDown size={16} /> {Math.round(weather.temperatureMin)}°
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Droplets, label: 'Humidity', value: `${weather.humidityAvg}%`, color: 'blue' },
                { icon: Wind, label: 'Wind', value: `${Math.round(weather.windSpeedAvg)} mph`, color: 'gray' },
                { icon: Sun, label: 'UV Index', value: `${weather.uvIndexMax || 0}`, color: 'yellow' },
                {
                  icon: Eye,
                  label: 'Visibility',
                  value: weather.visibilityAvg ? `${Math.round(weather.visibilityAvg)} mi` : '--',
                  color: 'purple',
                },
                { icon: Gauge, label: 'Pressure', value: `${Math.round(weather.pressureSurfaceLevelAvg)} hPa`, color: 'teal' },
                { icon: Umbrella, label: 'Precip %', value: `${weather.precipitationProbabilityAvg}%`, color: 'indigo' },
              ].map(item => (
                <Card key={item.label} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 bg-${item.color}-100 dark:bg-${item.color}-900/30 text-${item.color}-600 dark:text-${item.color}-400 rounded-lg`}>
                      <item.icon size={20} />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase">
                        {item.label}
                      </div>
                      <div className="font-bold text-gray-700 dark:text-gray-200">{item.value}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 px-4 pb-4 space-y-2">
          {forecast.map(day => {
            const date = new Date(day.time);
            return (
              <div
                key={day.time}
                className="flex items-center justify-between p-3 md:p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border border-transparent hover:border-gray-100 dark:hover:border-gray-700 group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 text-center">
                    <div className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className="text-lg font-bold text-gray-700 dark:text-gray-200">
                      {date.getDate()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getWeatherIcon(day.values.weatherCode)}
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {getWeatherLabel(day.values.weatherCode)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden relative">
                    <div
                      className="absolute top-0 bottom-0 bg-gradient-to-r from-blue-400 to-orange-400 opacity-50"
                      style={{ left: '0%', right: '0%' }}
                    />
                  </div>
                  <div className="text-right w-20">
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                      {Math.round(day.values.temperatureMax)}°
                    </span>
                    <span className="text-sm text-gray-400 dark:text-gray-500 ml-2">
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
      <div className="w-full flex-1 h-[400px] md:h-full bg-gray-100 dark:bg-gray-950 p-2 md:p-4 relative">
        {location ? (
          <WeatherMap lat={location.lat} lng={location.lng} />
        ) : (
          <div className="h-full w-full rounded-3xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        )}
      </div>
    </div>
  );
}
