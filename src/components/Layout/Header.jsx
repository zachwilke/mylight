import React, { useState, useEffect } from 'react';
import { CloudSun, Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Wind } from 'lucide-react';
import { getCachedWeather } from '../../utils/weather';

export function Header() {
    const [time, setTime] = useState(new Date());
    const [familyName, setFamilyName] = useState('The Miller Family');
    const [weather, setWeather] = useState(null);

    useEffect(() => {
        // Clock tick
        const timer = setInterval(() => setTime(new Date()), 1000);

        // Weather Fetch Logic
        const fetchWeather = async () => {
            try {
                // 1. Fetch Settings
                const res = await fetch('/api/settings');
                const data = await res.json();

                if (data.family_name) setFamilyName(data.family_name);

                if (data.weather_location) {
                    // 2. Resolve Location
                    let latitude, longitude;

                    if (data.weather_location.includes(',')) {
                        const parts = data.weather_location.split(',');
                        if (parts.length === 2) {
                            latitude = parseFloat(parts[0].trim());
                            longitude = parseFloat(parts[1].trim());
                        }
                    }

                    if (!latitude) {
                        const isZip = /^\d{5}$/.test(data.weather_location.trim());
                        if (isZip) {
                            try {
                                const zipRes = await fetch(`https://api.zippopotam.us/us/${data.weather_location.trim()}`);
                                if (zipRes.ok) {
                                    const zipData = await zipRes.json();
                                    latitude = zipData.places[0].latitude;
                                    longitude = zipData.places[0].longitude;
                                }
                            } catch (e) { console.error(e); }
                        }
                        if (!latitude) {
                            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(data.weather_location)}&count=1&language=en&format=json`);
                            const geoData = await geoRes.json();
                            if (geoData.results && geoData.results.length > 0) {
                                latitude = geoData.results[0].latitude;
                                longitude = geoData.results[0].longitude;
                            }
                        }
                    }

                    if (latitude && longitude) {
                        // 3. Use Cached Weather Utility
                        const weatherData = await getCachedWeather(latitude, longitude);

                        if (weatherData && weatherData.current) {
                            setWeather({
                                temp: weatherData.current.temperature_2m,
                                code: weatherData.current.weather_code,
                                source: 'open-meteo'
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("Weather fetch failed", err);
            }
        };

        // Initial Fetch
        fetchWeather();

        // Poll every 30 minutes (aligns with cache duration)
        const weatherTimer = setInterval(fetchWeather, 30 * 60 * 1000);

        return () => {
            clearInterval(timer);
            clearInterval(weatherTimer);
        };
    }, []);

    const getWeatherIcon = (code) => {
        if (code === 0) return <Sun className="text-amber-400" size={24} />;
        if (code >= 1 && code <= 3) return <CloudSun className="text-amber-400" size={24} />;
        if (code >= 45 && code <= 48) return <Cloud className="text-gray-400" size={24} />;
        if (code >= 51 && code <= 67) return <CloudRain className="text-blue-400" size={24} />;
        if (code >= 71 && code <= 77) return <CloudSnow className="text-sky-200" size={24} />;
        if (code >= 80 && code <= 82) return <CloudRain className="text-blue-500" size={24} />;
        if (code >= 85 && code <= 86) return <CloudSnow className="text-sky-200" size={24} />;
        if (code >= 95 && code <= 99) return <CloudLightning className="text-purple-500" size={24} />;
        return <CloudSun className="text-amber-400" size={24} />;
    };

    const getWeatherLabel = (code) => {
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
    }

    return (
        <header className="h-auto md:h-20 px-6 py-4 md:py-0 md:px-8 flex flex-col md:flex-row items-start md:items-center justify-between bg-transparent flex-shrink-0 gap-4 md:gap-0">
            <div>
                <h2 className="text-xl md:text-3xl font-semibold text-charcoal tracking-tight">{familyName}</h2>
                <p className="text-xs md:text-sm text-gray-500 font-medium">
                    {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
            </div>

            <div className="flex items-center justify-between w-full md:w-auto gap-4 md:gap-6">
                {weather ? (
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl shadow-sm border border-gray-100">
                        {getWeatherIcon(weather.code)}
                        <div className="flex flex-col">
                            <span className="text-sm md:text-lg font-bold text-gray-700 leading-none">{Math.round(weather.temp)}°</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden md:block">{getWeatherLabel(weather.code)}</span>
                        </div>
                    </div>
                ) : (
                    <div className="text-xs md:text-sm text-gray-400 italic hidden md:block">No Location Set</div>
                )}

                <div className="text-right ml-auto md:ml-0">
                    <div className="text-2xl md:text-4xl font-light text-charcoal tracking-tighter">
                        {time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                </div>
            </div>
        </header>
    );
}
