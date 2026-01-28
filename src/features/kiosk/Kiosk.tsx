import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KioskSidebar } from './KioskSidebar';

export function Kiosk() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('kiosk_sidebar_collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('kiosk_sidebar_collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  return (
    <div className="h-screen w-screen flex overflow-hidden relative">
      {/* Pastel gradient background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(135deg, #D6E4E5 0%, #F5E1DA 50%, #D9E8D8 100%)',
        }}
      />

      {/* Dark mode overlay */}
      <div className="absolute inset-0 -z-10 dark:bg-gray-950/90" />

      {/* Decorative blobs */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full pointer-events-none -z-5"
        style={{
          background: 'radial-gradient(circle, rgba(217, 232, 216, 0.6) 0%, transparent 70%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
        className="absolute -bottom-32 -left-32 w-[600px] h-[600px] rounded-full pointer-events-none -z-5"
        style={{
          background: 'radial-gradient(circle, rgba(245, 225, 218, 0.6) 0%, transparent 70%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full pointer-events-none -z-5"
        style={{
          background: 'radial-gradient(circle, rgba(214, 228, 229, 0.4) 0%, transparent 70%)',
        }}
      />

      {/* Dark mode decorative blobs */}
      <div className="dark:block hidden">
        <div
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full pointer-events-none opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.3) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-[600px] h-[600px] rounded-full pointer-events-none opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, transparent 70%)',
          }}
        />
      </div>

      <KioskSidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />

      <main className="flex-1 relative overflow-hidden transition-all duration-300 p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="h-full w-full glass-card overflow-hidden"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
