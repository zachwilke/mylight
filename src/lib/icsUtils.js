import { format } from 'date-fns';

export function generateICS(event) {
    const formatDate = (date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const now = new Date();
    const start = new Date(event.date);
    const end = new Date(start.getTime() + (60 * 60 * 1000)); // Default 1 hour duration

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//MyLight//NONSGML v1.0//EN',
        'BEGIN:VEVENT',
        `UID:${event.id || Date.now()}@mylight.app`,
        `DTSTAMP:${formatDate(now)}`,
        `DTSTART:${formatDate(start)}`,
        `DTEND:${formatDate(end)}`,
        `SUMMARY:${event.title}`,
        'END:VEVENT',
        'END:VCALENDAR'
    ];

    if (event.recurrence) {
        // Insert RRULE before END:VEVENT
        // RRULE string from DB usually looks like "FREQ=WEEKLY;..."
        // We just need to make sure it's valid for ICS.
        // Assuming simplistic RRULE storage that is compatible.
        lines.splice(lines.length - 2, 0, `RRULE:${event.recurrence}`);
    }

    return lines.join('\r\n');
}

export function downloadICS(event) {
    const icsContent = generateICS(event);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${event.title.replace(/\s+/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
