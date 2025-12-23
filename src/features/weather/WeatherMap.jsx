import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, useMap, Marker } from 'react-leaflet';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../hooks/useTheme';
import { getRainViewerData } from '../../utils/weather';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icon not finding images in webpack/vite environments
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function MapController({ coords }) {
    const map = useMap();
    useEffect(() => {
        if (coords) {
            map.setView([coords.lat, coords.lng], 10);
        }
    }, [coords, map]);
    return null;
}

export function WeatherMap({ lat, lng }) {
    const [apiData, setApiData] = useState(null);
    const [activeLayer, setActiveLayer] = useState('radar'); // 'radar' or 'satellite'
    const [frames, setFrames] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [theme] = useTheme();
    const [host, setHost] = useState('https://tilecache.rainviewer.com');
    const playerRef = useRef(null);

    // Determine if we are effectively in dark mode
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    useEffect(() => {
        // Fetch RainViewer timestamps using cached utility
        getRainViewerData()
            .then(data => {
                if (data) {
                    setApiData(data);
                    if (data.host) setHost(data.host);
                }
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!apiData) return;

        const data = apiData;
        let allFrames = [];
        let startingIndex = 0;

        if (activeLayer === 'radar') {
            if (data.radar && data.radar.past) {
                allFrames = [...data.radar.past];
            }
            if (data.radar && data.radar.nowcast) {
                allFrames = [...allFrames, ...data.radar.nowcast];
            }
            // Start at the last "past" frame (current time)
            startingIndex = data.radar.past ? data.radar.past.length - 1 : 0;
        } else {
            // Satellite
            if (data.satellite && data.satellite.past) {
                allFrames = [...data.satellite.past];
            }
            // Start at the latest available satellite frame
            startingIndex = allFrames.length - 1;
        }

        // Sort by time
        allFrames.sort((a, b) => a.time - b.time);

        setFrames(allFrames);
        setCurrentIndex(startingIndex >= 0 ? startingIndex : 0);
        setIsPlaying(false); // Stop playing when switching layers
    }, [apiData, activeLayer]);

    useEffect(() => {
        if (isPlaying) {
            playerRef.current = setInterval(() => {
                setCurrentIndex(prev => {
                    const next = prev + 1;
                    if (next >= frames.length) {
                        return 0; // Loop
                    }
                    return next;
                });
            }, 500); // 500ms per frame
        } else {
            clearInterval(playerRef.current);
        }
        return () => clearInterval(playerRef.current);
    }, [isPlaying, frames]);

    const togglePlay = () => setIsPlaying(!isPlaying);

    // Formatting time for display
    const formatTime = (ts) => {
        return new Date(ts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    if (!lat || !lng) return null;

    const currentFrame = frames[currentIndex];

    return (
        <div className="h-full w-full rounded-3xl overflow-hidden relative z-0 flex flex-col">
            <div className="flex-1 relative">
                <MapContainer
                    center={[lat, lng]}
                    zoom={10}
                    className="h-full w-full"
                    scrollWheelZoom={true} // Enabled scroll zoom
                    touchZoom={true} // Enabled touch zoom
                    attributionControl={false}
                >
                    {/* Base Map */}
                    <TileLayer
                        url={isDark
                            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                        }
                    />

                    {/* Radar Layer (RainViewer) */}
                    {currentFrame && (
                        <TileLayer
                            url={`${host}${currentFrame.path}/256/{z}/{x}/{y}/2/1_1.png`}
                            opacity={isDark ? 0.8 : 0.6}
                            zIndex={100}
                        />
                    )}

                    <Marker position={[lat, lng]}>
                    </Marker>

                    <MapController coords={{ lat, lng }} />
                </MapContainer>

                {/* Layer Selector */}
                <div className="absolute top-4 left-14 z-[1000] flex bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-xl p-1 shadow-lg border border-gray-100 dark:border-gray-700">
                    <button
                        onClick={() => setActiveLayer('radar')}
                        className={cn(
                            "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                            activeLayer === 'radar'
                                ? "bg-charcoal dark:bg-gray-100 text-white dark:text-charcoal shadow-sm"
                                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                        )}
                    >
                        Rain
                    </button>
                    <button
                        onClick={() => setActiveLayer('satellite')}
                        className={cn(
                            "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                            activeLayer === 'satellite'
                                ? "bg-charcoal dark:bg-gray-100 text-white dark:text-charcoal shadow-sm"
                                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                        )}
                    >
                        Clouds
                    </button>
                </div>

                {/* Attribution Overlay */}
                <div className="absolute top-4 right-4 bg-white/90 dark:bg-gray-800/90 dark:text-gray-300 backdrop-blur-md px-2 py-1 rounded text-[10px] text-gray-500 z-[1000] pointer-events-none shadow-sm dark:border dark:border-gray-700/50">
                    {activeLayer === 'radar' ? 'RainViewer Radar' : 'RainViewer Satellite'}
                </div>
            </div>

            {/* Timeline Controls */}
            {frames.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-2 z-10">
                    <div className="flex items-center justify-between text-sm font-bold text-gray-700 dark:text-gray-200">
                        <div className="flex items-center gap-2">
                            <span className="w-16">{currentFrame ? formatTime(currentFrame.time) : '--:--'}</span>
                            {currentFrame && currentFrame.path && currentFrame.path.includes('nowcast') && (
                                <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Forecast</span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"><ChevronLeft size={16} /></button>
                            <button onClick={togglePlay} className="flex items-center gap-1 hover:text-primary transition-colors">
                                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                            </button>
                            <button onClick={() => setCurrentIndex(Math.min(frames.length - 1, currentIndex + 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"><ChevronRight size={16} /></button>
                        </div>
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={frames.length - 1}
                        value={currentIndex}
                        onChange={(e) => {
                            setIsPlaying(false);
                            setCurrentIndex(parseInt(e.target.value));
                        }}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                    />

                    <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 font-medium px-1">
                        <span>Past ({activeLayer === 'radar' ? '-2h' : '-2h'})</span>
                        <span>Now</span>
                        <span>{activeLayer === 'radar' ? 'Forecast (+30m)' : ''}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
