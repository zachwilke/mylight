import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function Layout({ children, activeTab, onTabChange }) {
    return (
        <div className="flex h-screen w-full bg-gradient-to-br from-gray-50 via-white to-gray-100 overflow-hidden">
            <Sidebar activeTab={activeTab} onTabChange={onTabChange} />

            <main className="flex-1 flex flex-col h-full relative overflow-hidden">
                <Header />
                <div className="flex-1 overflow-auto p-2 pb-6 px-6 md:px-8">
                    <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 h-full w-full overflow-hidden relative">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}
