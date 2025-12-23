import React from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { Header } from './Header';

export function Layout({ children, activeTab, onTabChange }) {
    return (
        <div className="flex h-screen w-full bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 overflow-hidden relative transition-colors duration-300">
            <Sidebar activeTab={activeTab} onTabChange={onTabChange} />

            <main className="flex-1 flex flex-col h-full relative overflow-hidden w-full">
                <Header />
                <div className="flex-1 overflow-auto p-4 pb-24 md:p-8 md:px-8">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 h-full w-full overflow-hidden relative">
                        {children}
                    </div>
                </div>
            </main>

            <MobileNav activeTab={activeTab} onTabChange={onTabChange} />
        </div>
    );
}
