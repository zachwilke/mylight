import { forwardRef, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'glass';
  icon?: ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant = 'default', icon, error, ...props }, ref) => {
    const baseStyles = 'w-full px-3 py-2 text-sm transition-all duration-200 rounded-xl focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      default: 'bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-primary-500/20 focus:border-primary-500',
      glass: 'bg-white/50 dark:bg-gray-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-white/30 focus:border-white/60',
    };

    const hasIcon = !!icon;

    return (
      <div className="relative">
        {hasIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            baseStyles,
            variants[variant],
            hasIcon && 'pl-10',
            error && 'border-danger focus:ring-danger/20 focus:border-danger',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-danger">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
