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
        fetch('http://localhost:3000/api/meals')
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
        // Assign a random nice color if new
        const colors = ['bg-orange-100 text-orange-800', 'bg-green-100 text-green-800', 'bg-blue-100 text-blue-800', 'bg-purple-100 text-purple-800'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        await fetch('http://localhost:3000/api/meals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...mealData, color: currentMeal?.color || randomColor })
        });
        fetchMeals();
    };

    return (
        <div className="h-full flex flex-col bg-white overflow-hidden">
            <div className="flex h-full">
                {/* Y-Axis Headers (Meal Types) */}
                <div className="w-24 md:w-32 flex-shrink-0 border-r border-gray-100 pt-10 bg-gray-50/30">
                    {MEAL_TYPES.map(type => (
                        <div key={type} className="h-32 flex items-center justify-center">
                            <span className="text-xs font-bold text-gray-400 uppercase rotate-0 tracking-wider">
                                {type}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Main Grid */}
                <div className="flex-1 flex flex-col overflow-auto">
                    {/* X-Axis Headers (Days) */}
                    <div className="flex border-b border-gray-100">
                        {DAYS.map(day => (
                            <div key={day} className="flex-1 py-4 text-center min-w-[100px]">
                                <span className="text-sm font-semibold text-gray-600">{day}</span>
                            </div>
                        ))}
                    </div>

                    {/* Grid Cells */}
                    <div className="flex-1 relative">
                        {/* Render Grid Rows */}
                        {MEAL_TYPES.map((type, rowIndex) => (
                            <div key={type} className="flex h-32 border-b border-gray-100 last:border-b-0">
                                {DAYS.map(day => {
                                    const key = `${day}-${type}`;
                                    const meal = meals[key];

                                    return (
                                        <div
                                            key={key}
                                            onClick={() => handleCellClick(day, type, meal)}
                                            className="flex-1 border-r border-gray-100 last:border-r-0 min-w-[100px] p-2 hover:bg-gray-50/50 transition-colors group relative cursor-pointer"
                                        >
                                            {meal ? (
                                                <div className={cn(
                                                    "w-full h-full rounded-xl p-3 shadow-sm flex items-start justify-between flex-col transition-all hover:scale-[1.02]",
                                                    meal.color || "bg-gray-100"
                                                )}>
                                                    <span className="font-semibold text-sm leading-tight text-current">{meal.title}</span>
                                                    <div className="w-full h-1 bg-black/5 rounded-full mt-auto" />
                                                </div>
                                            ) : (
                                                <button className="w-full h-full rounded-xl border-2 border-dashed border-gray-100 opacity-0 group-hover:opacity-100 flex items-center justify-center text-gray-300 hover:border-primary/30 hover:text-primary transition-all">
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
