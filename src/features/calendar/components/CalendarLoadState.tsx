export function CalendarLoadState({
  error,
  loading,
  retry,
}: {
  error: string;
  loading: boolean;
  retry: () => void;
}) {
  if (error)
    return (
      <div
        role="alert"
        className="m-3 rounded-xl bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 flex flex-wrap items-center gap-3"
      >
        <span>
          Calendar could not refresh: {error}. Any displayed plans are the last
          loaded copy.
        </span>
        <button
          onClick={retry}
          className="min-h-11 rounded-lg border border-current px-4 py-2"
        >
          Try again
        </button>
      </div>
    );
  if (loading)
    return (
      <p
        role="status"
        className="px-4 py-2 text-sm text-stone-600 dark:text-stone-400"
      >
        Loading calendar…
      </p>
    );
  return null;
}
