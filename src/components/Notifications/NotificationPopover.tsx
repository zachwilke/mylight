import { Bell, Calendar, CheckSquare } from "lucide-react";

interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: "chore" | "calendar" | "system";
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    title: "Chore Reminder",
    message: "Don't forget to take out the trash!",
    time: "10m ago",
    read: false,
    type: "chore",
  },
  {
    id: 2,
    title: "Family Dinner",
    message: "Dinner at Grandma's house tonight at 6pm.",
    time: "1h ago",
    read: false,
    type: "calendar",
  },
  {
    id: 3,
    title: "System Update",
    message: "MyLight has been updated to version 2.0!",
    time: "1d ago",
    read: true,
    type: "system",
  },
];

export function NotificationPopover({
  isOpen,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden transform origin-top-right transition-all animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
        <h3 className="font-semibold text-slate-900 dark:text-white">
          Notifications
        </h3>
        <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
          Mark all as read
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {MOCK_NOTIFICATIONS.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {MOCK_NOTIFICATIONS.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${!notification.read ? "bg-blue-50/30 dark:bg-blue-900/10" : ""}`}
              >
                <div className="flex gap-3">
                  <div
                    className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      notification.type === "chore"
                        ? "bg-orange-100 text-orange-600"
                        : notification.type === "calendar"
                          ? "bg-blue-100 text-blue-600"
                          : "bg-purple-100 text-purple-600"
                    }`}
                  >
                    {notification.type === "chore" && <CheckSquare size={14} />}
                    {notification.type === "calendar" && <Calendar size={14} />}
                    {notification.type === "system" && <Bell size={14} />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start">
                      <p
                        className={`text-sm font-medium ${!notification.read ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400"}`}
                      >
                        {notification.title}
                      </p>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">
                        {notification.time}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {notification.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500">
            <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p>No new notifications</p>
          </div>
        )}
      </div>

      <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 text-center">
        <button className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          View all notifications
        </button>
      </div>
    </div>
  );
}
