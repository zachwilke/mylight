import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Plus } from 'lucide-react';
import { MealModal } from './components/MealModal';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MealPlanner() {
    const [meals, setMeals] = useState({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState({ day: '', type: '' });
    const [currentMeal, setCurrentMeal] = useState(null);

    const fetchMeals = () => {
        fetch('/api/meals')
            .then(res => res.json())
            .then(data => setMeals(data))
            .catch(err => console.error(err));
    };

    useEffect(() => {
        fetchMeals();
    }, []);

    const handleCellClick = (day, type, meal) => {
        setSelectedSlot({ day, type });
        setCurrentMeal(meal);
        setIsModalOpen(true);
    };

    const handleSaveMeal = async (mealData) => {
        if (mealData.delete) {
            await fetch(`/api/meals/${currentMeal.id}`, { method: 'DELETE' });
        } else {
            // Assign a random nice color if new
            const colors = ['bg-orange-100 text-orange-800', 'bg-green-100 text-green-800', 'bg-blue-100 text-blue-800', 'bg-purple-100 text-purple-800'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];

            await fetch('/api/meals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...mealData, color: currentMeal?.color || randomColor })
            });
        }
        fetchMeals();
    };

    return (
        <div className="h-full flex flex-col bg-transparent overflow-hidden">
            <div className="flex h-full">
                {/* Y-Axis Headers (Meal Types - Sticky Left) */}
                <div className="w-24 md:w-32 flex-shrink-0 border-r border-black/5 dark:border-white/5 pt-10 bg-white/40 dark:bg-black/40 backdrop-blur-xl sticky left-0 z-30 shadow-lg shadow-black/5">
                    {MEAL_TYPES.map(type => (
                        <div key={type} className="h-32 flex items-center justify-center relative">
                            <span className="text-[10px] md:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase rotate-0 tracking-widest text-center px-1">
                                {type}
                            </span>
                            {/* Subtle separator */}
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[1px] bg-black/5 dark:bg-white/5 mx-auto" />
                        </div>
                    ))}
                </div>

                {/* Main Grid */}
                <div className="flex-1 flex flex-col overflow-x-auto overflow-y-auto custom-scrollbar">
                    <div className="min-w-max">
                        {/* X-Axis Headers (Days) */}
                        <div className="flex border-b border-black/5 dark:border-white/5 sticky top-0 bg-white/40 dark:bg-black/40 backdrop-blur-xl z-20">
                            {DAYS.map(day => (
                                <div key={day} className="w-[140px] md:w-auto md:flex-1 py-4 text-center min-w-[140px]">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-widest text-[10px] md:text-xs">{day}</span>
                                </div>
                            ))}
                        </div>

                        {/* Grid Cells */}
                        {/* Render Grid Rows */}
                        {MEAL_TYPES.map((type, rowIndex) => (
                            <div key={type} className="flex h-32 border-b border-black/5 dark:border-white/5 last:border-b-0">
                                {DAYS.map(day => {
                                    const key = `${day}-${type}`;
                                    const meal = meals[key];

                                    return (
                                        <div
                                            key={key}
                                            onClick={() => handleCellClick(day, type, meal)}
                                            className="w-[140px] md:w-auto md:flex-1 border-r border-black/5 dark:border-white/5 last:border-r-0 min-w-[140px] p-2 hover:bg-white/40 dark:hover:bg-white/5 transition-all group relative cursor-pointer"
                                        >
                                            {meal ? (
                                                <div className={cn(
                                                    "w-full h-full rounded-2xl p-3 shadow-sm border border-black/5 flex items-start justify-between flex-col transition-all hover:scale-[1.02] hover:shadow-md",
                                                    meal.color || "bg-white/60 dark:bg-white/10 backdrop-blur-sm text-gray-800 dark:text-gray-100"
                                                )}>
                                                    <span className="font-semibold text-xs md:text-sm leading-snug line-clamp-3">{meal.title}</span>
                                                    <div className="w-full h-1 bg-black/10 dark:bg-white/10 rounded-full mt-auto" />
                                                </div>
                                            ) : (
                                                <button className="w-full h-full rounded-2xl border border-dashed border-black/10 dark:border-white/10 opacity-0 group-hover:opacity-100 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all duration-300">
                                                    <Plus size={20} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <MealModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                day={selectedSlot.day}
                type={selectedSlot.type}
                currentMeal={currentMeal}
                onSave={handleSaveMeal}
            />
        </div>
    );
}
