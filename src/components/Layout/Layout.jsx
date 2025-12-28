import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { Header } from './Header';

export function Layout({ children, activeTab, onTabChange }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    return (
        <div className="flex h-screen w-full bg-transparent overflow-hidden relative transition-colors duration-300">
            {isSidebarOpen && <Sidebar activeTab={activeTab} onTabChange={onTabChange} />}

            <main className="flex-1 flex flex-col h-full relative overflow-hidden w-full">
                <Header isSidebarOpen={isSidebarOpen} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
                <div className="flex-1 overflow-hidden p-2 pb-2 md:p-6 md:pr-6 md:pl-0">
                    <div className="bg-white/85 dark:bg-gray-800/85 backdrop-blur-2xl rounded-[2rem] shadow-xl border border-white/50 dark:border-white/10 h-full w-full overflow-hidden relative transition-all">
                        {children}
                    </div>
                </div>
            </main>

            <MobileNav activeTab={activeTab} onTabChange={onTabChange} />
        </div>
    );
}
