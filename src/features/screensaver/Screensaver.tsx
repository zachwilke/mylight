import React, { useState, useEffect } from 'react';
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

        // Fetch weather (simplified reuse from Header logic)
        // ideally this should be in a context
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
                                latitude = parseFloat(zipData.places[0].latitude);
                                longitude = parseFloat(zipData.places[0].longitude);
                            }
                        } catch (e) {
                            console.error('Zip fetch failed', e);
                        }
                    }

                    if (!latitude) {
                        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(data.weather_location)}&count=1&language=en&format=json`);
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
        // Refresh weather every 15 mins
        const weatherTimer = setInterval(fetchWeather, 15 * 60 * 1000);

        return () => {
            clearInterval(timer);
            clearInterval(weatherTimer);
        };
    }, []);

    // Rotate photos every 10 seconds
    useEffect(() => {
        if (photos.length === 0) return;
        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % photos.length);
        }, 10000);
        return () => clearInterval(interval);
    }, [photos]);

    const getWeatherIcon = (code: number) => {
        if (code === 0) return <Sun className="text-white" size={48} />;
        if (code >= 1 && code <= 3) return <CloudSun className="text-white" size={48} />;
        if (code >= 45 && code <= 48) return <Cloud className="text-white" size={48} />;
        if (code >= 51 && code <= 67) return <CloudRain className="text-white" size={48} />;
        if (code >= 71 && code <= 77) return <CloudSnow className="text-white" size={48} />;
        if (code >= 80 && code <= 82) return <CloudRain className="text-white" size={48} />;
        if (code >= 95 && code <= 99) return <CloudLightning className="text-white" size={48} />;
        return <CloudSun className="text-white" size={48} />;
    };

    return (
        <div
            className="fixed inset-0 z-[9999] bg-black cursor-none"
            onClick={onInteraction}
            onMouseMove={onInteraction}
            onTouchStart={onInteraction}
            onKeyDown={onInteraction}
        >
            <AnimatePresence mode="wait">
                {photos.length > 0 ? (
                    <motion.img
                        key={currentIndex}
                        src={photos[currentIndex].url}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1 }}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-900">
                        <span className="text-gray-500 text-xl">No photos uploaded</span>
                    </div>
                )}
            </AnimatePresence>

            {/* Overlay */}
            <div className="absolute bottom-12 left-12 flex flex-col drop-shadow-lg">
                <h1 className="text-8xl font-thin text-white tracking-tighter">
                    {time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </h1>
                <p className="text-2xl text-white/80 font-medium ml-2">
                    {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
            </div>

            {weather && (
                <div className="absolute bottom-12 right-12 flex items-center gap-4 drop-shadow-lg">
                    {getWeatherIcon(weather.weather_code)}
                    <span className="text-6xl font-bold text-white tracking-tight">{Math.round(weather.temperature_2m)}°</span>
                </div>
            )}
        </div>
    );
}
