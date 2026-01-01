import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
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
        <div className="h-screen w-screen bg-gray-50 dark:bg-gray-950 flex overflow-hidden">
            <KioskSidebar
                isCollapsed={isCollapsed}
                onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
            />

            <main className="flex-1 relative overflow-hidden transition-all duration-300">
                <div className="absolute inset-0 p-6">
                    <div className="h-full w-full bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 relative z-10">
                        <Outlet />
                    </div>
                </div>

                {/* Background Decor */}
                <div className="absolute -top-20 -right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
            </main>
        </div>
    );
}
