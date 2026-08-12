// ─────────────────────────────────────────────
// FILE SYSTEM — read all JSONL recursively
// ─────────────────────────────────────────────
export async function collectJsonlFiles(dirHandle, files = [], isSubagentsDir = false) {
  const dirEntries = [];
  for await (const [name, entry] of dirHandle.entries()) dirEntries.push([name, entry]);

  // In a subagents/ dir, read meta.json files first to get agent type names
  const metaMap = {};
  if (isSubagentsDir) {
    for (const [name, entry] of dirEntries) {
      if (entry.kind === 'file' && name.endsWith('.meta.json')) {
        try {
          const file = await entry.getFile();
          const meta = JSON.parse(await file.text());
          metaMap[name.replace('.meta.json', '')] = meta.agentType || 'agent';
        } catch {}
      }
    }
  }

  for (const [name, entry] of dirEntries) {
    if (entry.kind === 'file' && name.endsWith('.jsonl')) {
      const agentType = isSubagentsDir ? (metaMap[name.replace('.jsonl', '')] || 'agent') : 'main';
      files.push({ handle: entry, agentType });
    } else if (entry.kind === 'directory') {
      await collectJsonlFiles(entry, files, name === 'subagents');
    }
  }
  return files;
}

export async function readJsonlFile(fileHandle) {
  const file = await fileHandle.getFile();
  const text = await file.text();
  const records = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    try { records.push(JSON.parse(l)); } catch {}
  }
  return records;
}
