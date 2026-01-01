import React, { useState, useEffect } from 'react';
import { X, Utensils, Trash2, Save } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

import { Meal } from '../../../types';

interface MealModalProps {
    isOpen: boolean;
    onClose: () => void;
    day: string;
    type: string | null;
    currentMeal: Meal | null;
    onSave: (data: any) => Promise<void>;
}

export function MealModal({ isOpen, onClose, day, type, currentMeal, onSave }: MealModalProps) {
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (currentMeal) {
            setTitle(currentMeal.title);
        } else {
            setTitle('');
        }
    }, [currentMeal, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave({ day, type, title });
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = () => {
        onSave({ ...currentMeal, delete: true });
        onClose();
        setShowDeleteConfirm(false);
    };

    return (
        <>
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Delete Meal"
                message="Are you sure you want to remove this meal from the plan?"
                confirmText="Remove"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 dark:bg-black/50 backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Plan Meal</h3>
                            <p className="text-sm text-gray-500 font-medium">{day} — {type}</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">What's on the menu?</label>
                            <div className="relative">
                                <Utensils className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g. Tacos, Spaghetti..."
                                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="pt-2 flex gap-3">
                            {currentMeal && (
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="px-5 py-4 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl font-bold transition-colors"
                                >
                                    <Trash2 size={20} />
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={loading || !title}
                                className={cn(
                                    "flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all",
                                    loading ? "bg-gray-400" : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5"
                                )}
                            >
                                <Save size={20} />
                                {loading ? 'Saving...' : 'Save Meal'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}
