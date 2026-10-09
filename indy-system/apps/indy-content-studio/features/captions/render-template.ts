export function renderCaptionTemplate(body: string, values: Record<string, string>) {
  const missing = new Set<string>(); const text = body.replace(/\{([a-zA-Z0-9_-]+)\}/g, (_match, name: string) => { const value = values[name]; if (value === undefined || value === "") { missing.add(name); return `{${name}}`; } return value; });
  return { text, missing: [...missing] };
}
