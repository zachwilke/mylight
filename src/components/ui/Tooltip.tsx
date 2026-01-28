import { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
    content: string;
    children?: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div
            className="relative inline-flex items-center"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
            onClick={() => setIsVisible(!isVisible)} // Mobile support
        >
            {children || <CircleHelp size={14} className="text-gray-400 hover:text-indigo-500 transition-colors cursor-help" />}

            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={{ opacity: 0, y: 5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-xl w-48 text-center z-50 pointer-events-none"
                    >
                        {content}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
