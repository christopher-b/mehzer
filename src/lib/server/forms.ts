/** A form field as a string ('' when missing). Not trimmed: callers that want that call `.trim()`. */
export function formString(form: FormData, key: string): string {
	return String(form.get(key) ?? '');
}

/** An optional id field: '' or missing becomes null. */
export function formId(form: FormData, key: string): string | null {
	return formString(form, key) || null;
}
