import React, { useState, useEffect, useRef } from 'react';
import { DesktopLayout } from './components/Layout/DesktopLayout';
import { CalendarView } from './features/calendar/CalendarView';
import { ChoreChart } from './features/chores/ChoreChart';
import { Settings } from './features/settings/Settings';
import { WeatherPage } from './features/weather/WeatherPage';
import { DashboardHome } from './features/dashboard/DashboardHome';
import { Kiosk } from './features/kiosk/Kiosk';
import Screensaver from './features/screensaver/Screensaver';
import { HistoryPage } from './features/history/HistoryPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, isLoading } = useAuth();
  // Default to dashboard for desktop, chores for kiosk (handled below)
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isIdle, setIsIdle] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(1);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_TIMEOUT = timeoutMinutes * 60 * 1000;
  const lastManualTriggerRef = useRef(0);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Determine mode based on URL
  const isKiosk = window.location.pathname === '/kiosk';

  // Set initial tab based on mode (if it's the first render)
  useEffect(() => {
    if (isKiosk && (activeTab === 'dashboard' || activeTab === 'settings')) {
      setActiveTab('chores');
    }
  }, [isKiosk]);

  const resetIdleTimer = () => {
    // Only run idle timer in Kiosk mode
    if (!isKiosk) return;

    // If we just manually triggered, ignore reset for 1 second to avoid immediate closure from the click/move
    if (Date.now() - lastManualTriggerRef.current < 1000) return;

    if (isIdle) setIsIdle(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsIdle(true);
    }, IDLE_TIMEOUT);
  };

  useEffect(() => {
    if (!isKiosk) return;

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
  }, [isIdle, timeoutMinutes, isKiosk]);

  // Adjust active tab if settings is hidden and we are on it (fallback)
  useEffect(() => {
    if (isKiosk && activeTab === 'settings') {
      setActiveTab('chores');
    }
  }, [isKiosk, activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardHome onNavigate={setActiveTab} />;
      case 'calendar': return <CalendarView />;
      case 'chores': return <ChoreChart />;
      case 'history': return <HistoryPage />;
      case 'weather': return <WeatherPage />;
      case 'settings': return <Settings />;
      default: return <DashboardHome onNavigate={setActiveTab} />;
    }
  };

  if (isKiosk) {
    return (
      <>
        {isIdle && <Screensaver onInteraction={resetIdleTimer} />}
        <Kiosk />
      </>
    );
  }

  // Desktop Admin View
  return (
    <DesktopLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </DesktopLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
