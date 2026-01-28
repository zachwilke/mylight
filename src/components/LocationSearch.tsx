import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Input } from './ui/Input';
import { useDebounce } from '../hooks/useDebounce';
import { cn } from '../lib/utils';

interface LocationSearchResult {
    id: number;
    name: string;
    admin1?: string; // State/Region
    country: string;
    latitude: number;
    longitude: number;
}

interface LocationSearchProps {
    onLocationSelect: (location: { name: string; lat: number; lng: number }) => void;
    initialValue?: string;
    className?: string;
}

export function LocationSearch({ onLocationSelect, initialValue = '', className }: LocationSearchProps) {
    const [query, setQuery] = useState(initialValue);
    const [results, setResults] = useState<LocationSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const debouncedQuery = useDebounce(query, 500);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Update internal state if initialValue changes externally (e.g. from saved settings)
    useEffect(() => {
        if (initialValue && query === '') {
            setQuery(initialValue);
        }
    }, [initialValue]);

    useEffect(() => {
        async function searchLocation() {
            if (!debouncedQuery || debouncedQuery.length < 3) {
                setResults([]);
                return;
            }

            // Don't search if the query exactly matches the initial value (avoid refetching on load)
            if (debouncedQuery === initialValue && !isOpen) return;

            setLoading(true);
            try {
                const res = await fetch(
                    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(debouncedQuery)}&count=10&language=en&format=json`
                );
                const data = await res.json();
                if (data.results) {
                    setResults(data.results);
                    setIsOpen(true);
                } else {
                    setResults([]);
                }
            } catch (err) {
                console.error('Location search failed', err);
                setResults([]);
            } finally {
                setLoading(false);
            }
        }

        searchLocation();
    }, [debouncedQuery]);

    const handleSelect = (result: LocationSearchResult) => {
        const name = `${result.name}${result.admin1 ? `, ${result.admin1}` : ''}, ${result.country}`;
        setQuery(name);
        setIsOpen(false);
        onLocationSelect({
            name,
            lat: result.latitude,
            lng: result.longitude,
        });
    };

    return (
        <div className={cn("relative", className)} ref={wrapperRef}>
            <div className="relative">
                <Input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    placeholder="Search City or Zip Code..."
                    icon={loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    onFocus={() => {
                        if (results.length > 0) setIsOpen(true);
                    }}
                    className="w-full"
                />
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 max-h-60 overflow-y-auto custom-scrollbar animate-scale-in">
                    <ul className="py-1">
                        {results.map((result) => (
                            <li key={result.id}>
                                <button
                                    onClick={() => handleSelect(result)}
                                    className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center gap-3 group"
                                >
                                    <div className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-lg group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-500 transition-colors">
                                        <MapPin size={16} />
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-900 dark:text-gray-100">
                                            {result.name}
                                        </div>
                                        <div className="text-xs text-gray-400 dark:text-gray-500">
                                            {result.admin1 ? `${result.admin1}, ` : ''}{result.country}
                                        </div>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {isOpen && query.length >= 3 && !loading && results.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 p-4 text-center text-sm text-gray-500 animate-scale-in">
                    No locations found.
                </div>
            )}
        </div>
    );
}
