/**
 * Shared presentation helpers for the Scribe LWCs.
 *
 * This is a service module (no template): change-type vocabulary, error
 * translation and the couple of formatters that the dashboard, the change-log
 * console and the record badge all need. Keeping them here means the three
 * surfaces describe the same audit row with exactly the same words.
 */

/**
 * How each Scribe_Change_Log__c.Change_Type__c value should read in the UI.
 *
 * `kind` matters: `overwrite` rows replaced a value that was already on the
 * record, which is the only category a reviewer genuinely has to vet. Everything
 * else is additive and cannot destroy existing data.
 */
export const CHANGE_TYPE_META = {
    'Field Update': {
        label: 'Field update',
        tone: 'accent',
        icon: 'utility:edit',
        kind: 'overwrite'
    },
    'Call Logged': {
        label: 'Call logged',
        tone: 'info',
        icon: 'utility:note',
        kind: 'additive'
    },
    'Task Created': {
        label: 'Task created',
        tone: 'plum',
        icon: 'utility:task',
        kind: 'additive'
    },
    'Stage Gap Task': {
        label: 'Stage gap task',
        tone: 'warning',
        icon: 'utility:warning',
        kind: 'additive'
    },
    'Contact Created': {
        label: 'Contact created',
        tone: 'plum',
        icon: 'utility:user',
        kind: 'additive'
    }
};

const FALLBACK_META = {
    label: 'Change',
    tone: 'neutral',
    icon: 'utility:record',
    kind: 'additive'
};

export function changeMeta(changeType) {
    return (
        CHANGE_TYPE_META[changeType] || {
            ...FALLBACK_META,
            label: changeType || 'Change'
        }
    );
}

export function isOverwrite(changeType) {
    return changeMeta(changeType).kind === 'overwrite';
}

/** Human sentence for one audit row, used in the timeline and the badge. */
export function describeChange(row) {
    if (!row) {
        return '';
    }
    if (row.changeType === 'Field Update') {
        const field = row.fieldName || 'A field';
        return row.relatedRecordName ? `${field} on ${row.relatedRecordName}` : field;
    }
    return row.relatedRecordName || changeMeta(row.changeType).label;
}

/** Empty long-text values read better as an explicit "(blank)" than as nothing. */
export function valueOrBlank(value) {
    return value === null || value === undefined || `${value}`.trim() === '' ? '(blank)' : value;
}

const DATE_TIME_OPTS = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
};

export function formatDateTime(value) {
    if (!value) {
        return '';
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        return '';
    }
    return d.toLocaleString(undefined, DATE_TIME_OPTS);
}

export function formatDate(value) {
    if (!value) {
        return '';
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        return '';
    }
    return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

export function formatTime(value) {
    if (!value) {
        return '';
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        return '';
    }
    return d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit'
    });
}

/** "2 hours ago" style stamp for timeline entries. */
export function relativeTime(value) {
    if (!value) {
        return '';
    }
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) {
        return '';
    }
    const minutes = Math.round((Date.now() - then) / 60000);
    if (minutes < 1) {
        return 'just now';
    }
    if (minutes < 60) {
        return `${minutes} min ago`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
        return `${hours} hr ago`;
    }
    const days = Math.round(hours / 24);
    if (days < 7) {
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }
    return formatDate(value);
}

/** Relative record URL - safe in Lightning Experience, Experience Cloud and mobile. */
export function recordUrl(recordId) {
    return recordId ? `/lightning/r/${recordId}/view` : undefined;
}

const RAW_ERROR_HINTS = [
    {
        match: /insufficient|INSUFFICIENT_ACCESS|not accessible|no access/i,
        message:
            "You don't have access to part of the Scribe change log. Ask an admin to assign you the Scribe Reviewer permission set."
    },
    {
        match: /INVALID_FIELD|No such column|INVALID_TYPE/i,
        message:
            "Scribe's data model looks out of date in this org, so this view could not be built. An admin will need to redeploy Scribe."
    },
    {
        match: /Failed to fetch|NetworkError|offline|timed out|timeout/i,
        message: 'We could not reach Salesforce. Check your connection and try again.'
    },
    {
        match: /LIMIT|too many|Regex too complicated|maximum/i,
        message:
            'That range covers too much history to load at once. Narrow the dates or filter to one object, then try again.'
    }
];

/** Flatten whatever Apex/LDS threw into readable text (kept for developers). */
export function rawErrorText(error) {
    if (!error) {
        return '';
    }
    if (Array.isArray(error.body)) {
        return error.body.map((e) => e.message).join(', ');
    }
    if (Array.isArray(error)) {
        return error.map((e) => rawErrorText(e)).join(', ');
    }
    return (
        error.body?.message ||
        error.body?.pageErrors?.[0]?.message ||
        error.statusText ||
        error.message ||
        JSON.stringify(error)
    );
}

/**
 * Translate an error into something a rep can act on while preserving the raw
 * text for developers. Callers should also console.error the original.
 */
export function friendlyError(
    error,
    fallback = 'Something went wrong while loading this. Nothing was changed.'
) {
    const raw = rawErrorText(error);
    const hint = RAW_ERROR_HINTS.find((h) => h.match.test(raw));
    return { message: hint ? hint.message : fallback, detail: raw };
}

export function plural(count, singular, pluralForm) {
    const word = count === 1 ? singular : pluralForm || `${singular}s`;
    return `${count} ${word}`;
}
