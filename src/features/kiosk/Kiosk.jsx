import React from 'react';
import { WeatherPage } from '../weather/WeatherPage';
import { CalendarView } from '../calendar/CalendarView';
import { ChoreChart } from '../chores/ChoreChart';

export function Kiosk() {
    return (
        <div className="h-screen w-screen bg-gray-50 dark:bg-gray-950 flex flex-col p-4 gap-4 overflow-hidden">
            {/* Top Row: Weather & Calendar */}
            <div className="flex-1 flex gap-4 min-h-0">
                {/* Weather: 30% width */}
                <div className="w-[30%] bg-white dark:bg-gray-900 rounded-[2rem] shadow-sm overflow-hidden border border-gray-100 dark:border-gray-800">
                    <WeatherPage kiosk={true} />
                </div>

                {/* Calendar: 70% width */}
                <div className="flex-1 bg-white dark:bg-gray-900 rounded-[2rem] shadow-sm overflow-hidden border border-gray-100 dark:border-gray-800">
                    <CalendarView kiosk={true} />
                </div>
            </div>

            {/* Bottom Row: Chores */}
            <div className="h-[45%] bg-white dark:bg-gray-900 rounded-[2rem] shadow-sm overflow-hidden border border-gray-100 dark:border-gray-800">
                <ChoreChart kiosk={true} />
            </div>
        </div>
    );
}
