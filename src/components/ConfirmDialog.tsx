import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', type = 'danger' }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 dark:bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
                        type === 'danger' ? "bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400" : "bg-blue-100 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400"
                    )}>
                        <AlertTriangle size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">{title}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6">
                        {message}
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => { onConfirm(); onClose(); }}
                            className={cn(
                                "flex-1 px-4 py-2.5 text-white font-bold rounded-xl transition-colors shadow-lg shadow-gray-200 dark:shadow-none",
                                type === 'danger' ? "bg-red-500 hover:bg-red-600" : "bg-charcoal dark:bg-gray-100 dark:text-charcoal hover:bg-gray-800 dark:hover:bg-white"
                            )}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
