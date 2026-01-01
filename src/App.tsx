import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
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

function ProtectedRoute({ children, kiosk = false }: { children: React.ReactNode; kiosk?: boolean }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function KioskWrapper() {
  const [isIdle, setIsIdle] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(1);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_TIMEOUT = timeoutMinutes * 60 * 1000;
  const lastManualTriggerRef = useRef(0);

  const resetIdleTimer = () => {
    if (Date.now() - lastManualTriggerRef.current < 1000) return;
    if (isIdle) setIsIdle(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsIdle(true);
    }, IDLE_TIMEOUT);
  };

  useEffect(() => {
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

  return (
    <>
      {isIdle && <Screensaver onInteraction={resetIdleTimer} />}
      <Kiosk />
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Kiosk Routes */}
      <Route path="/kiosk" element={
        <ProtectedRoute kiosk>
          <KioskWrapper />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="chores" replace />} />
        <Route path="chores" element={<ChoreChart kiosk={true} />} />
        <Route path="calendar" element={<CalendarView kiosk={true} />} />
        <Route path="weather" element={<WeatherPage kiosk={true} />} />
      </Route>

      {/* Desktop Routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <DesktopLayout />
        </ProtectedRoute>
      }>
        <Route index element={<DashboardHome />} />
        <Route path="calendar" element={<CalendarView />} />
        <Route path="chores" element={<ChoreChart />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="weather" element={<WeatherPage />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
