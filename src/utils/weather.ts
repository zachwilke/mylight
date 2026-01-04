

const CACHE_duration = 30 * 60 * 1000; // 30 minutes in milliseconds
const CACHE_KEY_PREFIX = 'mylight_weather_cache_';

/**
 * Fetches weather data from Open-Meteo with caching.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object|null>} - Weather data or null if failed
 */
export async function getCachedWeather(lat: number, lng: number) {
    if (!lat || !lng) return null;

    const key = `${CACHE_KEY_PREFIX}${lat.toFixed(4)}_${lng.toFixed(4)}`;

    // 1. Check Cache
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_duration) {
                // Cache is valid
                console.info('Using cached weather data');
                return data;
            }
        }
    } catch (e) {
        console.warn('Weather cache read failed', e);
    }

    // 2. Fetch Fresh Data (Combined Current + Daily for efficiency)
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;

        console.info('Fetching fresh weather data from Open-Meteo');
        const res = await fetch(url);
        if (!res.ok) throw new Error('Weather fetch failed');

        const data = await res.json();

        // 3. Update Cache
        try {
            localStorage.setItem(key, JSON.stringify({
                timestamp: Date.now(),
                data
            }));
        } catch (e) {
            console.warn('Weather cache write failed', e);
        }

        return data;
    } catch (err) {
        console.error(err);
        return null; // Return null (or expired cache if we implemented fallback)
    }
}


/**
 * Fetches RainViewer metadata with caching.
 * @returns {Promise<Object|null>} - RainViewer data or null if failed
 */
export async function getRainViewerData() {
    const key = `${CACHE_KEY_PREFIX}rainviewer`;
    const RAINVIEWER_CACHE_duration = 5 * 60 * 1000; // 5 minutes

    // 1. Check Cache
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < RAINVIEWER_CACHE_duration) {
                return data;
            }
        }
    } catch (e) {
        console.warn('RainViewer cache read failed', e);
    }

    // 2. Fetch Fresh Data
    try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        if (!res.ok) throw new Error('RainViewer fetch failed');
        const data = await res.json();

        // 3. Update Cache
        try {
            localStorage.setItem(key, JSON.stringify({
                timestamp: Date.now(),
                data
            }));
        } catch (e) {
            console.warn('RainViewer cache write failed', e);
        }

        return data;
    } catch (err) {
        console.error(err);
        return null;
    }
}

/**
 * Fetches reverse geocoding data to get town name from coordinates.
 * Using api.bigdatacloud.net (free, no key).
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string|null>} - Town/City name or null
 */
export async function getReverseGeocoding(lat: number, lng: number): Promise<string | null> {
    if (!lat || !lng) return null;

    const key = `${CACHE_KEY_PREFIX}revgeo_${lat.toFixed(4)}_${lng.toFixed(4)}`;

    // 1. Check Cache (Cache forever basically, or long time)
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            return cached;
        }
    } catch (e) {
        console.warn('RevGeo cache read failed', e);
    }

    // 2. Fetch Fresh Data
    try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
        if (!res.ok) throw new Error('Reverse geocoding fetch failed');
        const data = await res.json();

        // Extract best available name
        const name = data.locality || data.city || data.principalSubdivision || 'Unknown Location';

        // 3. Update Cache
        try {
            localStorage.setItem(key, name);
        } catch (e) {
            console.warn('RevGeo cache write failed', e);
        }

        return name;
    } catch (err) {
        console.error(err);
        return null;
    }
}
