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
import { Kiosk } from './features/kiosk/Kiosk';
import { HistoryPage } from './features/history/HistoryPage';

function App() {
  const [theme] = useTheme();
  const [activeTab, setActiveTab] = useState('calendar');
  const [isIdle, setIsIdle] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(1);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_TIMEOUT = timeoutMinutes * 60 * 1000;
  const lastManualTriggerRef = useRef(0);

  const resetIdleTimer = () => {
    // If we just manually triggered, ignore reset for 1 second to avoid immediate closure from the click/move
    if (Date.now() - lastManualTriggerRef.current < 1000) return;

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
    const manualTriggerHandler = () => {
      lastManualTriggerRef.current = Date.now();
      setIsIdle(true);
    };
    const updateTimeoutHandler = (e: Event) => {
      const customEvent = e as CustomEvent;
      setTimeoutMinutes(parseInt(customEvent.detail) || 1);
    };

    events.forEach(e => window.addEventListener(e, handler));
    window.addEventListener('trigger-screensaver', manualTriggerHandler);
    window.addEventListener('update-timeout', updateTimeoutHandler);

    // Fetch settings for timeout
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.screensaver_timeout) {
          setTimeoutMinutes(parseInt(data.screensaver_timeout) || 1);
        }
      })
      .catch(console.error);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(e => window.removeEventListener(e, handler));
      window.removeEventListener('trigger-screensaver', manualTriggerHandler);
      window.removeEventListener('update-timeout', updateTimeoutHandler);
    };
  }, [isIdle, timeoutMinutes]);

  // Simple routing for Kiosk
  if (window.location.pathname === '/kiosk') {
    return (
      <>
        {isIdle && <Screensaver onInteraction={resetIdleTimer} />}
        <Kiosk />
      </>
    );
  }

  return (
    <>
      {isIdle && <Screensaver onInteraction={resetIdleTimer} />}
      <Layout activeTab={activeTab} onTabChange={setActiveTab}>
        <div className="h-full w-full">
          {/* Main Content Area */}
          {activeTab === 'calendar' && <CalendarView />}

          {activeTab === 'chores' && <ChoreChart />}
          {activeTab === 'history' && <HistoryPage />}
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
