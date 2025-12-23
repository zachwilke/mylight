import React from 'react';
import { User } from 'lucide-react';
import { cn } from '../lib/utils';

export function UserAvatar({ member, size = "md", className }) {
    const sizeClasses = {
        sm: "w-6 h-6",
        md: "w-10 h-10",
        lg: "w-16 h-16",
        xl: "w-24 h-24"
    };

    const iconSizes = {
        sm: 14,
        md: 20,
        lg: 32,
        xl: 48
    };

    if (member?.avatar) {
        return (
            <img
                src={`http://localhost:3000${member.avatar}`}
                alt={member.name}
                className={cn(
                    "rounded-full object-cover border border-gray-100",
                    sizeClasses[size],
                    className
                )}
            />
        );
    }

    return (
        <div className={cn(
            "rounded-full flex items-center justify-center text-gray-400",
            member?.color || "bg-gray-100",
            sizeClasses[size],
            className
        )}>
            {member?.name ? (
                <span className="font-bold text-gray-700 opacity-50 uppercase">
                    {member.name.substring(0, 1)}
                </span>
            ) : (
                <User size={iconSizes[size]} />
            )}
        </div>
    );
}
