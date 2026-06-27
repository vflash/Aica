export function parseActionFile(text) {
    const splitIndex = text.search(/\n\s*\n/);
    const headerPart = splitIndex === -1 ? text : text.slice(0, splitIndex);
    const body = splitIndex === -1 ? '' : text.slice(splitIndex).replace(/^\s*\n/, '');

    const headers = {};
    for (const line of headerPart.split('\n')) {
        const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
        if (m) headers[m[1].toLowerCase()] = m[2].trim();
    }

    if (!headers.action) throw new Error('parse_error: missing Action header');

    if (headers.action === 'sequence') {
        return parseSequence(body, headers);
    }

    return parseSingleAction(body, headers);
}

function parseSequence(body, headers) {
    const parts = body.split(/\n---\n/).map(p => p.trim()).filter(Boolean);

    if (parts.length === 0) {
        throw new Error('parse_error: empty sequence');
    }

    const steps = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const stepSplitIndex = part.search(/\n\s*\n/);
        const stepHeaderPart = stepSplitIndex === -1 ? part : part.slice(0, stepSplitIndex);
        const stepBody = stepSplitIndex === -1 ? '' : part.slice(stepSplitIndex).replace(/^\s*\n/, '');

        const stepHeaders = {};
        for (const line of stepHeaderPart.split('\n')) {
            const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
            if (m) stepHeaders[m[1].toLowerCase()] = m[2].trim();
        }

        if (!stepHeaders.action) {
            throw new Error(`parse_error: step ${i + 1} missing Action`);
        }

        const step = parseSingleAction(stepBody, stepHeaders);
        step.stepIndex = i + 1;
        steps.push(step);
    }

    return {
        action: 'sequence',
        description: headers.description,
        reason: headers.reason,
        notify: headers.notify !== undefined ? headers.notify.toLowerCase() === 'true' : true,
        steps
    };
}

function parseSingleAction(body, headers) {
    const validActions = ['patch', 'replace', 'create', 'delete', 'rename', 'append', 'exec'];

    if (!validActions.includes(headers.action)) {
        throw new Error(`parse_error: unknown action "${headers.action}"`);
    }

    const result = { ...headers };

    if (headers.notify !== undefined) {
        result.notify = headers.notify.toLowerCase() === 'true';
    } else {
        result.notify = true;
    }

    if (['patch', 'replace', 'create', 'delete', 'rename', 'append'].includes(headers.action)) {
        if (!headers.file && !headers.path) {
            throw new Error(`parse_error: missing File header for ${headers.action}`);
        }
    }

    if (headers.action === 'exec') {
        if (!headers.command) {
            throw new Error('parse_error: missing Command header for exec');
        }
    }

    if (headers.action === 'patch') {
        result.diff = body;
        if (!body.trim()) throw new Error('parse_error: empty diff');
    } else if (['replace', 'create', 'append'].includes(headers.action)) {
        result.content = body;
    }

    return result;
}