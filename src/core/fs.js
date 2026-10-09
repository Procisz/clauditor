export async function collectJsonlFiles(dirHandle, files = [], isSubagentsDir = false, prefix = '') {
  const dirEntries = [];
  for await (const [name, entry] of dirHandle.entries()) dirEntries.push([name, entry]);

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
    if (name === 'audit.jsonl') continue;
    if (entry.kind === 'file' && name.endsWith('.jsonl')) {
      const agentType = isSubagentsDir ? (metaMap[name.replace('.jsonl', '')] || 'agent') : 'main';
      files.push({ handle: entry, agentType, path: prefix + name });
    } else if (entry.kind === 'directory') {
      await collectJsonlFiles(entry, files, name === 'subagents', prefix + name + '/');
    }
  }
  return files;
}
