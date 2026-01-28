import { CloudSun, Calendar, CheckSquare, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { NavLink } from 'react-router-dom';

interface KioskSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function KioskSidebar({ isCollapsed, onToggleCollapse }: KioskSidebarProps) {
  const navItems = [
    {
      id: 'weather',
      label: 'Weather',
      icon: CloudSun,
      gradient: 'from-blue-400 to-sky-500',
      bgGradient: 'bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/30 dark:to-sky-900/30',
      path: '/kiosk/weather',
    },
    {
      id: 'calendar',
      label: 'Calendar',
      icon: Calendar,
      gradient: 'from-purple-400 to-violet-500',
      bgGradient: 'bg-gradient-to-br from-purple-100 to-violet-100 dark:from-purple-900/30 dark:to-violet-900/30',
      path: '/kiosk/calendar',
    },
    {
      id: 'chores',
      label: 'Chores',
      icon: CheckSquare,
      gradient: 'from-green-400 to-emerald-500',
      bgGradient: 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30',
      path: '/kiosk/chores',
    },
  ];

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 96 : 280 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="h-full glass-sidebar flex flex-col z-20 relative"
    >
      {/* Header / Toggle */}
      <div className="p-5 border-b border-white/20 dark:border-white/5 flex items-center justify-between shrink-0 h-24">
        <AnimatePresence mode="wait">
          {!isCollapsed && (
            <motion.h1
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="text-2xl font-bold bg-gradient-to-r from-primary-500 to-purple-500 bg-clip-text text-transparent"
            >
              MyLight
            </motion.h1>
          )}
        </AnimatePresence>
        <button
          onClick={onToggleCollapse}
          className={cn(
            'p-4 rounded-2xl hover:bg-white/30 dark:hover:bg-white/10 transition-all kiosk-touch',
            isCollapsed && 'mx-auto'
          )}
        >
          <Menu size={28} className="text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-3 overflow-y-auto">
        {navItems.map((item, index) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'w-full flex items-center p-5 rounded-3xl transition-all duration-200 group relative overflow-hidden kiosk-touch',
                isCollapsed ? 'justify-center' : 'gap-5',
                isActive
                  ? 'bg-white/60 dark:bg-white/10 shadow-glass'
                  : 'hover:bg-white/40 dark:hover:bg-white/5'
              )
            }
          >
            {({ isActive }) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-5 w-full"
              >
                {/* Icon with gradient background */}
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    'p-3 rounded-2xl transition-all duration-300 flex items-center justify-center shrink-0',
                    item.bgGradient,
                    isActive && 'shadow-md'
                  )}
                >
                  <item.icon
                    size={28}
                    strokeWidth={2}
                    className={cn(
                      'transition-colors',
                      `bg-gradient-to-br ${item.gradient} bg-clip-text`,
                      isActive
                        ? 'text-gray-800 dark:text-white'
                        : 'text-gray-600 dark:text-gray-300'
                    )}
                  />
                </motion.div>

                <AnimatePresence mode="wait">
                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className={cn(
                        'text-xl font-semibold tracking-tight',
                        isActive
                          ? 'text-gray-900 dark:text-white'
                          : 'text-gray-600 dark:text-gray-300'
                      )}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-gradient-to-b from-primary-400 to-primary-600 rounded-r-full"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </motion.div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-5 text-center text-gray-400 dark:text-gray-500 text-sm border-t border-white/20 dark:border-white/5"
          >
            Kiosk Mode
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
