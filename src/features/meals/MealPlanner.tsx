import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import { List, Meal } from "../../types";
import { MealModal } from "./components/MealModal";

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];

export function MealPlanner() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    date: Date | null;
    type: string | null;
  }>({ date: null, type: null });
  const [currentMeal, setCurrentMeal] = useState<Meal | null>(null);
  const [addingToShop, setAddingToShop] = useState(false);
  const requestVersion = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require movement of 3px before drag starts to prevent accidental clicks
      activationConstraint: {
        distance: 3,
      },
    }),
  );

  const fetchMeals = async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      // Fetch broadly for the view (could optimize with start/end dates later)
      const res = await apiFetch("/api/meals");
      const data = await res.json();
      if (version === requestVersion.current) setMeals(data);
    } catch (err) {
      console.error("Failed to fetch meals", err);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeals();
    window.addEventListener("system-update", fetchMeals);
    return () => {
      requestVersion.current++;
      window.removeEventListener("system-update", fetchMeals);
    };
  }, [currentMonth]); // Refetch if we change logic to depend on range

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleCellClick = (date: Date, type: string, meal: Meal | null) => {
    setSelectedSlot({ date, type });
    setCurrentMeal(meal);
    setIsModalOpen(true);
  };

  const handleSaveMeal = async (mealData: any) => {
    if (!selectedSlot.date) return;
    const dateStr = format(selectedSlot.date, "yyyy-MM-dd");

    if (mealData.delete) {
      if (currentMeal) {
        await apiFetch(`/api/meals/${currentMeal.id}`, { method: "DELETE" });
      }
    } else {
      // Keep existing color if exists, else random
      const colors = [
        "bg-orange-100 text-orange-800",
        "bg-green-100 text-green-800",
        "bg-blue-100 text-blue-800",
        "bg-purple-100 text-purple-800",
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      await apiFetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr,
          type: selectedSlot.type,
          title: mealData.title,
          color: currentMeal?.color || randomColor,
        }),
      });
    }
    fetchMeals();
  };

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const mealId = active.id;
    // Droppable ID format: "dateString|type"
    const [targetDateStr, targetType] = over.id.split("|");

    // Find the dragged meal
    const meal = meals.find((m) => m.id === mealId);
    if (!meal) return;

    // If dropped on same slot, do nothing
    if (meal.date === targetDateStr && meal.type === targetType) return;

    // Optimistic UI update could go here, but let's just wait for server for safety
    try {
      await apiFetch(`/api/meals/${meal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: targetDateStr,
          type: targetType,
          title: meal.title,
          color: meal.color,
        }),
      });

      fetchMeals();
    } catch (err: any) {
      console.error("Failed to move meal", err);
    }
  };

  const addToShoppingList = async () => {
    setAddingToShop(true);
    // Add meals from currently visible month? Or just this week?
    // Let's add all visible meals to grocery list
    // Filter meals in current view
    try {
      const start = startOfWeek(startOfMonth(currentMonth));
      const end = endOfWeek(endOfMonth(currentMonth));

      const visibleMeals = meals.filter((m) => {
        if (!m.date) return false;
        const d = parseISO(m.date);
        return isValid(d) && d >= start && d <= end;
      });

      // Get 'Groceries' list ID - assumption: it exists or we fetch it.
      // For now, let's just fetch all lists and find 'Groceries'
      const listsRes = await apiFetch("/api/lists");
      const lists: List[] = await listsRes.json();
      let groceryList = lists.find((l: List) => l.title === "Groceries");

      if (!groceryList) {
        // create it
        const res = await apiFetch("/api/lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Groceries", icon: "shopping-cart" }),
        });
        groceryList = await res.json();
      }

      if (!groceryList) {
        throw new Error("Could not find or create grocery list");
      }

      // Add items
      let count = 0;
      for (const meal of visibleMeals) {
        await apiFetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            list_id: groceryList.id,
            text: `${meal.title} (${meal.type})`,
          }),
        });
        count++;
      }
      alert(`Added ${count} meals to Groceries!`);
    } catch (err: any) {
      console.error(err);
      alert(`Failed to add to shopping list: ${err.message}`);
    } finally {
      setAddingToShop(false);
    }
  };

  // --- Render Helpers ---

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth)),
  });

  const activeMeal = activeId ? meals.find((m) => m.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col bg-slate-50 dark:bg-black/20 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 bg-white/50 dark:bg-black/40 backdrop-blur-md border-b border-black/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <div className="flex bg-white dark:bg-gray-800 rounded-full shadow-sm border border-black/5 p-1">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <button
            onClick={addToShoppingList}
            disabled={addingToShop}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl font-semibold transition-all"
          >
            {addingToShop ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <ShoppingCart size={18} />
            )}
            <span>Add to Groceries</span>
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
            {/* Day Headers */}
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (dayName) => (
                <div
                  key={dayName}
                  className="bg-white dark:bg-gray-900 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-500"
                >
                  {dayName}
                </div>
              ),
            )}

            {/* Calendar Days */}
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isTodayDate = isSameDay(day, new Date());

              // Find meals for this day
              const daysMeals = meals.filter((m) => m.date === dateStr);

              return (
                <div
                  key={day.toString()}
                  className={cn(
                    "min-h-[140px] bg-white dark:bg-gray-900 p-2 flex flex-col gap-1 transition-colors relative group",
                    !isCurrentMonth &&
                      "bg-gray-50/50 dark:bg-gray-900/50 text-gray-400",
                    isTodayDate && "bg-blue-50/30 dark:bg-blue-900/10",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={cn(
                        "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full",
                        isTodayDate
                          ? "bg-primary text-white shadow-md shadow-primary/30"
                          : "text-gray-700 dark:text-gray-300",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {/* Optional Add Button visible on hover */}
                    <button
                      onClick={() => handleCellClick(day, "Dinner", null)} // Default to Dinner if general click? or maybe ask type?
                      // Actually, grid is crowded, better to click a specific slot.
                      // Let's render slots.
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-opacity"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="flex-1 flex flex-col gap-1.5">
                    {MEAL_TYPES.map((type) => {
                      const meal = daysMeals.find((m) => m.type === type);
                      const slotId = `${dateStr}|${type}`;

                      return (
                        <MealSlot
                          key={slotId}
                          id={slotId}
                          type={type}
                          meal={meal}
                          onClick={() =>
                            handleCellClick(day, type, meal || null)
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <MealModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        day={selectedSlot.date ? format(selectedSlot.date, "EEEE, MMM d") : ""}
        type={selectedSlot.type}
        currentMeal={currentMeal}
        onSave={handleSaveMeal}
      />

      <DragOverlay>
        {activeMeal ? (
          <div
            className={cn(
              "px-3 py-2 rounded-lg text-xs font-semibold shadow-xl cursor-grabbing ring-2 ring-primary bg-white dark:bg-gray-800",
              activeMeal.color,
            )}
          >
            {activeMeal.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface MealSlotProps {
  id: string;
  type: string;
  meal?: Meal;
  onClick?: () => void;
}

function MealSlot({ id, type, meal, onClick }: MealSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: meal ? meal.id : `empty-${id}`,
    disabled: !meal,
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        "group/slot relative min-h-[28px] rounded-lg text-xs transition-all border border-transparent",
        !meal &&
          "hover:bg-gray-50 dark:hover:bg-gray-800 border-dashed border-gray-200 dark:border-gray-800",
        isOver &&
          !isDragging &&
          "ring-2 ring-primary/50 bg-primary/5 z-10 scale-105",
        meal && !isDragging && "hover:shadow-md cursor-pointer",
        isDragging && "opacity-30",
      )}
    >
      {meal ? (
        <div
          ref={setDragRef}
          {...listeners}
          {...attributes}
          className={cn(
            "w-full h-full px-2 py-1.5 rounded-lg flex items-center gap-2 truncate",
            meal.color || "bg-white",
            "cursor-grab active:cursor-grabbing",
          )}
        >
          <span className="opacity-50 text-[10px] uppercase font-bold tracking-wider w-3">
            {type[0]}
          </span>
          <span className="truncate font-medium">{meal.title}</span>
        </div>
      ) : (
        <div className="w-full h-full flex items-center opacity-0 group-hover/slot:opacity-100 transition-opacity px-2">
          <span className="text-[10px] text-gray-400 font-bold uppercase">
            {type}
          </span>
        </div>
      )}
    </div>
  );
}
