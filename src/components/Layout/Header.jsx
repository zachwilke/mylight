import React, { useState, useEffect } from 'react';
import { CloudSun, Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Wind } from 'lucide-react';

export function Header() {
    const [time, setTime] = useState(new Date());
    const [familyName, setFamilyName] = useState('The Miller Family');
    const [weather, setWeather] = useState(null);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);

        const fetchSettingsAndWeather = async () => {
            try {
                // 1. Fetch Settings
                const res = await fetch('http://localhost:3000/api/settings');
                const data = await res.json();

                if (data.family_name) setFamilyName(data.family_name);

                if (data.weather_location) {
                    // 2. Geocode City
                    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(data.weather_location)}&count=1&language=en&format=json`);
                    const geoData = await geoRes.json();

                    if (geoData.results && geoData.results.length > 0) {
                        const { latitude, longitude } = geoData.results[0];

                        // 3. Fetch Weather
                        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`);
                        const weatherData = await weatherRes.json();

                        setWeather(weatherData.current);
                    }
                }
            } catch (err) {
                console.error("Weather fetch failed", err);
            }
        };

        fetchSettingsAndWeather();

        return () => clearInterval(timer);
    }, []);

    const getWeatherIcon = (code) => {
        // WMO Weather interpretation codes (http://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM)
        if (code === 0) return <Sun className="text-amber-400" size={24} />;
        if (code >= 1 && code <= 3) return <CloudSun className="text-amber-400" size={24} />;
        if (code >= 45 && code <= 48) return <Cloud className="text-gray-400" size={24} />;
        if (code >= 51 && code <= 67) return <CloudRain className="text-blue-400" size={24} />;
        if (code >= 71 && code <= 77) return <CloudSnow className="text-sky-200" size={24} />;
        if (code >= 80 && code <= 82) return <CloudRain className="text-blue-500" size={24} />;
        if (code >= 95 && code <= 99) return <CloudLightning className="text-purple-500" size={24} />;
        return <CloudSun className="text-amber-400" size={24} />;
    };

    const getWeatherLabel = (code) => {
        if (code === 0) return 'Sunny';
        if (code >= 1 && code <= 3) return 'Partly Cloudy';
        if (code >= 45 && code <= 48) return 'Foggy';
        if (code >= 51 && code <= 67) return 'Rainy';
        if (code >= 71 && code <= 77) return 'Snowy';
        if (code >= 80 && code <= 82) return 'Heavy Rain';
        if (code >= 95 && code <= 99) return 'Thunderstorm';
        return 'Clear';
    }

    return (
        <header className="h-20 px-8 flex items-center justify-between bg-transparent flex-shrink-0">
            <div>
                <h2 className="text-3xl font-semibold text-charcoal tracking-tight">{familyName}</h2>
                <p className="text-sm text-gray-500 font-medium">
                    {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
            </div>

            <div className="flex items-center gap-6">
                {weather ? (
                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100">
                        {getWeatherIcon(weather.weather_code)}
                        <div className="flex flex-col">
                            <span className="text-lg font-bold text-gray-700 leading-none">{Math.round(weather.temperature_2m)}°</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{getWeatherLabel(weather.weather_code)}</span>
                        </div>
                    </div>
                ) : (
                    <div className="text-sm text-gray-400 italic">No Location Set</div>
                )}

                <div className="text-right">
                    <div className="text-4xl font-light text-charcoal tracking-tighter">
                        {time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                </div>
            </div>
        </header>
    );
}
