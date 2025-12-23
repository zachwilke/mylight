import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, useMap, Marker } from 'react-leaflet';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const [frames, setFrames] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const playerRef = useRef(null);

    useEffect(() => {
        // Fetch RainViewer timestamps
        fetch('https://api.rainviewer.com/public/weather-maps.json')
            .then(res => res.json())
            .then(data => {
                let allFrames = [];
                if (data.radar && data.radar.past) {
                    allFrames = [...data.radar.past];
                }
                if (data.radar && data.radar.nowcast) {
                    allFrames = [...allFrames, ...data.radar.nowcast];
                }

                // Sort by time just in case
                allFrames.sort((a, b) => a.time - b.time);

                setFrames(allFrames);

                // Start at the last "past" frame (current time essentially)
                // Filter where 'path' starts with /v2/radar/ (past) vs /v2/radar/nowcast (future) if desired, 
                // OR just pick the last one. Usually better to start at "now".
                // If we have nowcast, "now" is the last of 'past'.
                if (data.radar && data.radar.past) {
                    setCurrentIndex(data.radar.past.length - 1);
                } else {
                    setCurrentIndex(allFrames.length - 1);
                }
            })
            .catch(console.error);
    }, []);

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
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />

                    {/* Radar Layer (RainViewer) */}
                    {currentFrame && (
                        <TileLayer
                            key={currentFrame.path} // Key change forces re-render of layer
                            url={`https://tile.rainviewer.com${currentFrame.path}/256/{z}/{x}/{y}/2/1_1.png`}
                            opacity={0.6}
                            zIndex={100}
                        />
                    )}

                    <Marker position={[lat, lng]}>
                    </Marker>

                    <MapController coords={{ lat, lng }} />
                </MapContainer>

                {/* Attribution Overlay */}
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-2 py-1 rounded text-[10px] text-gray-500 z-[1000] pointer-events-none shadow-sm">
                    RainViewer Radar
                </div>
            </div>

            {/* Timeline Controls */}
            {frames.length > 0 && (
                <div className="bg-white border-t border-gray-200 p-4 flex flex-col gap-2 z-10">
                    <div className="flex items-center justify-between text-sm font-bold text-gray-700">
                        <div className="flex items-center gap-2">
                            <span className="w-16">{currentFrame ? formatTime(currentFrame.time) : '--:--'}</span>
                            {currentFrame && currentFrame.path && currentFrame.path.includes('nowcast') && (
                                <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Forecast</span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={16} /></button>
                            <button onClick={togglePlay} className="flex items-center gap-1 hover:text-primary transition-colors">
                                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                            </button>
                            <button onClick={() => setCurrentIndex(Math.min(frames.length - 1, currentIndex + 1))} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight size={16} /></button>
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
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                    />

                    <div className="flex justify-between text-[10px] text-gray-400 font-medium px-1">
                        <span>Past (-2h)</span>
                        <span>Now</span>
                        <span>Forecast (+30m)</span>
                    </div>
                </div>
            )}
        </div>
    );
}
