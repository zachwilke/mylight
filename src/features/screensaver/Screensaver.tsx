import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, Sun } from 'lucide-react';
import { getCachedWeather } from '../../utils/weather';
import { Photo, CurrentWeather } from '../../types';

interface ScreensaverProps {
  onInteraction: () => void;
}

export default function Screensaver({ onInteraction }: ScreensaverProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [kenBurnsDirection, setKenBurnsDirection] = useState(0);

  useEffect(() => {
    // Fetch photos
    fetch('/api/photos')
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          setPhotos(data);
        }
      })
      .catch(console.error);

    // Time ticker
    const timer = setInterval(() => setTime(new Date()), 1000);

    // Fetch weather
    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.weather_location) {
          let latitude: number | undefined, longitude: number | undefined;

          const isZip = /^\d{5}$/.test(data.weather_location.trim());
          if (isZip) {
            try {
              const zipRes = await fetch(`https://api.zippopotam.us/us/${data.weather_location.trim()}`);
              if (zipRes.ok) {
                const zipData = await zipRes.json();
                if (zipData.places && zipData.places.length > 0) {
                  latitude = parseFloat(zipData.places[0].latitude);
                  longitude = parseFloat(zipData.places[0].longitude);
                }
              }
            } catch (e) {
              console.error('Zip fetch failed', e);
            }
          }

          if (!latitude) {
            const geoRes = await fetch(
              `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(data.weather_location)}&count=1&language=en&format=json`
            );
            const geoData = await geoRes.json();
            if (geoData.results && geoData.results.length > 0) {
              latitude = geoData.results[0].latitude;
              longitude = geoData.results[0].longitude;
            }
          }

          if (latitude && longitude) {
            const weatherData = await getCachedWeather(latitude, longitude);
            if (weatherData && weatherData.current) {
              setWeather(weatherData.current);
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, 15 * 60 * 1000);

    return () => {
      clearInterval(timer);
      clearInterval(weatherTimer);
    };
  }, []);

  // Rotate photos every 10 seconds with Ken Burns direction change
  useEffect(() => {
    if (photos.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length);
      setKenBurnsDirection(prev => (prev + 1) % 4);
    }, 10000);
    return () => clearInterval(interval);
  }, [photos]);

  const getWeatherIcon = useCallback((code: number) => {
    const iconProps = { className: 'text-white drop-shadow-lg', size: 48 };
    if (code === 0) return <Sun {...iconProps} />;
    if (code >= 1 && code <= 3) return <CloudSun {...iconProps} />;
    if (code >= 45 && code <= 48) return <Cloud {...iconProps} />;
    if (code >= 51 && code <= 67) return <CloudRain {...iconProps} />;
    if (code >= 71 && code <= 77) return <CloudSnow {...iconProps} />;
    if (code >= 80 && code <= 82) return <CloudRain {...iconProps} />;
    if (code >= 95 && code <= 99) return <CloudLightning {...iconProps} />;
    return <CloudSun {...iconProps} />;
  }, []);

  // Ken Burns animation variants
  const getKenBurnsVariants = (direction: number) => {
    const transforms = [
      { scale: 1.1, x: '-2%', y: '-2%' },
      { scale: 1.15, x: '2%', y: '-2%' },
      { scale: 1.1, x: '2%', y: '2%' },
      { scale: 1.15, x: '-2%', y: '2%' },
    ];

    return {
      initial: { opacity: 0, scale: 1, x: '0%', y: '0%' },
      animate: {
        opacity: 1,
        ...transforms[direction],
        transition: {
          opacity: { duration: 1.5, ease: 'easeOut' },
          scale: { duration: 10, ease: 'linear' },
          x: { duration: 10, ease: 'linear' },
          y: { duration: 10, ease: 'linear' },
        },
      },
      exit: {
        opacity: 0,
        transition: { duration: 1.5, ease: 'easeIn' },
      },
    };
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black cursor-none overflow-hidden"
      onClick={onInteraction}
      onMouseMove={onInteraction}
      onTouchStart={onInteraction}
      onKeyDown={onInteraction}
    >
      {/* Photo with Ken Burns Effect */}
      <AnimatePresence mode="sync">
        {photos.length > 0 ? (
          <motion.img
            key={`${currentIndex}-${photos[currentIndex]?.id}`}
            src={photos[currentIndex]?.url}
            variants={getKenBurnsVariants(kenBurnsDirection)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
            <span className="text-gray-500 text-xl">No photos uploaded</span>
          </div>
        )}
      </AnimatePresence>

      {/* Gradient overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

      {/* Time and Date Overlay */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="absolute bottom-12 left-12 flex flex-col"
      >
        <h1 className="text-8xl font-thin text-white tracking-tighter drop-shadow-2xl">
          {time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </h1>
        <p className="text-2xl text-white/80 font-medium ml-2 drop-shadow-lg">
          {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </motion.div>

      {/* Weather Overlay */}
      {weather && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="absolute bottom-12 right-12 flex items-center gap-4"
        >
          <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-md">
            {getWeatherIcon(weather.weather_code)}
          </div>
          <span className="text-6xl font-bold text-white tracking-tight drop-shadow-2xl">
            {Math.round(weather.temperature_2m)}°
          </span>
        </motion.div>
      )}
    </div>
  );
}
