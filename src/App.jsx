import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout/Layout';
import { CalendarView } from './features/calendar/CalendarView';
import { ChoreChart } from './features/chores/ChoreChart';
import { MealPlanner } from './features/meals/MealPlanner';
import { Settings } from './features/settings/Settings';
import { Lists } from './features/lists/Lists';
import { WeatherPage } from './features/weather/WeatherPage';
import Screensaver from './features/screensaver/Screensaver';
import { useTheme } from './hooks/useTheme';

function App() {
  const [theme] = useTheme();
  const [activeTab, setActiveTab] = useState('calendar');
  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef(null);

  const IDLE_TIMEOUT = 60 * 1000; // 1 minute

  const resetIdleTimer = () => {
    if (isIdle) setIsIdle(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsIdle(true);
    }, IDLE_TIMEOUT);
  };

  useEffect(() => {
    // Initial timer
    resetIdleTimer();

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    const handler = () => resetIdleTimer();

    events.forEach(e => window.addEventListener(e, handler));
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(e => window.removeEventListener(e, handler));
    };
  }, [isIdle]);

  return (
    <>
      {isIdle && <Screensaver onInteraction={resetIdleTimer} />}
      <Layout activeTab={activeTab} onTabChange={setActiveTab}>
        <div className="p-8 h-full">
          {/* Main Content Area */}
          {activeTab === 'calendar' && <CalendarView />}

          {activeTab === 'chores' && <ChoreChart />}
          {activeTab === 'meals' && <MealPlanner />}

          {activeTab === 'lists' && <Lists />}
          {activeTab === 'weather' && <WeatherPage />}
          {activeTab === 'settings' && <Settings />}
        </div>
      </Layout>
    </>
  );
}

export default App;
