import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', type = 'danger' }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
                        type === 'danger' ? "bg-red-100 text-red-500" : "bg-blue-100 text-blue-500"
                    )}>
                        <AlertTriangle size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed mb-6">
                        {message}
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => { onConfirm(); onClose(); }}
                            className={cn(
                                "flex-1 px-4 py-2.5 text-white font-bold rounded-xl transition-colors shadow-lg shadow-gray-200",
                                type === 'danger' ? "bg-red-500 hover:bg-red-600" : "bg-charcoal hover:bg-gray-800"
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
