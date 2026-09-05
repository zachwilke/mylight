import { Loader2 } from "lucide-react";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { DesktopLayout } from "./components/Layout/DesktopLayout";
import { SystemStatus } from "./components/SystemStatus";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./features/auth/LoginPage";
import { SetupPage } from "./features/auth/SetupPage";
import { PairPage } from "./features/auth/PairPage";
import { DisplayPage } from "./features/kiosk/DisplayPage";
import { DashboardHome } from "./features/dashboard/DashboardHome";
import { Kiosk } from "./features/kiosk/Kiosk";
import { useTheme } from "./hooks/useTheme";
import { apiFetch } from "./lib/api";

const CalendarView = lazy(() =>
  import("./features/calendar/CalendarView").then((m) => ({
    default: m.CalendarView,
  })),
);
const ChoreChart = lazy(() =>
  import("./features/chores/ChoreChart").then((m) => ({
    default: m.ChoreChart,
  })),
);
const HistoryPage = lazy(() =>
  import("./features/history/HistoryPage").then((m) => ({
    default: m.HistoryPage,
  })),
);
const Lists = lazy(() =>
  import("./features/lists/Lists").then((m) => ({ default: m.Lists })),
);
const MealPlanner = lazy(() =>
  import("./features/meals/MealPlanner").then((m) => ({
    default: m.MealPlanner,
  })),
);
const Settings = lazy(() =>
  import("./features/settings/Settings").then((m) => ({ default: m.Settings })),
);
const WeatherPage = lazy(() =>
  import("./features/weather/WeatherPage").then((m) => ({
    default: m.WeatherPage,
  })),
);
const Screensaver = lazy(() => import("./features/screensaver/Screensaver"));

function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
  kiosk?: boolean;
}) {
  const { user, isLoading, needsSetup, error } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (error)
    return (
      <main className="p-12">
        <h1>Could not connect to MyLight</h1>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try again</button>
      </main>
    );
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (user.role === "display") return <Navigate to="/display" replace />;

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
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
    ];
    const handler = () => resetIdleTimer();
    const manualTriggerHandler = () => {
      lastManualTriggerRef.current = Date.now();
      setIsIdle(true);
    };
    const updateTimeoutHandler = (e: Event) => {
      const customEvent = e as CustomEvent;
      setTimeoutMinutes(parseInt(customEvent.detail) || 1);
    };

    events.forEach((e) => window.addEventListener(e, handler));
    window.addEventListener("trigger-screensaver", manualTriggerHandler);
    window.addEventListener("update-timeout", updateTimeoutHandler);

    apiFetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.screensaver_timeout) {
          setTimeoutMinutes(parseInt(data.screensaver_timeout) || 1);
        }
      })
      .catch(console.error);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach((e) => window.removeEventListener(e, handler));
      window.removeEventListener("trigger-screensaver", manualTriggerHandler);
      window.removeEventListener("update-timeout", updateTimeoutHandler);
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
  useTheme();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/pair" element={<PairPage />} />
      <Route path="/display" element={<DisplayPage />} />

      {/* Kiosk Routes */}
      <Route
        path="/kiosk"
        element={
          <ProtectedRoute kiosk>
            <KioskWrapper />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="chores" element={<ChoreChart kiosk={true} />} />
        <Route path="calendar" element={<CalendarView kiosk={true} />} />
        <Route path="weather" element={<WeatherPage kiosk={true} />} />
        <Route path="meals" element={<MealPlanner />} />
        <Route path="lists" element={<Lists />} />
      </Route>

      {/* Desktop Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DesktopLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="calendar" element={<CalendarView />} />
        <Route path="chores" element={<ChoreChart />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="weather" element={<WeatherPage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="meals" element={<MealPlanner />} />
        <Route path="lists" element={<Lists />} />
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
        <Suspense
          fallback={
            <div role="status" className="p-8 text-center">
              Getting things ready…
            </div>
          }
        >
          <AppRoutes />
        </Suspense>
        <SystemStatus />
      </AuthProvider>
    </BrowserRouter>
  );
}
