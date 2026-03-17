import fs from 'fs';
import path from 'path';

const ROOT = '/home/nightcrawler/projects/camello';

// Step 1: Read en.json and extract all leaf keys as dotted paths
const enJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/web/messages/en.json'), 'utf8'));

function extractLeafKeys(obj, prefix) {
  const result = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? prefix + '.' + key : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result.push(...extractLeafKeys(value, fullPath));
    } else {
      result.push({ path: fullPath, shortKey: key });
    }
  }
  return result;
}

const allLeafKeys = extractLeafKeys(enJson, '');

// Filter to only namespaces: dashboard, agent, notifications, artifacts
const targetNamespaces = ['dashboard', 'agent', 'notifications', 'artifacts'];
const filteredKeys = allLeafKeys.filter(k => {
  const topLevel = k.path.split('.')[0];
  return targetNamespaces.includes(topLevel);
});

// Step 2: Walk apps/web/src/**/*.{ts,tsx} excluding __tests__/ directories
function walkDir(dir, exts, excludeDirs) {
  let files = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return files;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) continue;
      files.push(...walkDir(fullPath, exts, excludeDirs));
    } else if (entry.isFile()) {
      if (exts.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

const srcFiles = walkDir(path.join(ROOT, 'apps/web/src'), ['.ts', '.tsx'], ['__tests__']);

// Step 3: Concatenate all source content into a single string
let combinedSource = '';
for (const f of srcFiles) {
  combinedSource += fs.readFileSync(f, 'utf8') + '\n';
}

// Step 4: For each key in the target namespaces, check whether the SHORT key
// appears as a substring in the combined source
const orphans = filteredKeys.filter(k => !combinedSource.includes(k.shortKey));

// Step 5: Output zero-match keys grouped by namespace, then total count
const grouped = {};
for (const o of orphans) {
  const ns = o.path.split('.')[0];
  if (!grouped[ns]) grouped[ns] = [];
  grouped[ns].push(o.path);
}

for (const ns of targetNamespaces) {
  if (grouped[ns] && grouped[ns].length > 0) {
    console.log(`=== ${ns} (${grouped[ns].length} orphans) ===`);
    for (const p of grouped[ns]) {
      console.log(`  ${p}`);
    }
    console.log('');
  } else {
    console.log(`=== ${ns} (0 orphans) ===`);
    console.log('');
  }
}

const total = orphans.length;
console.log(`Total orphan candidates: ${total}`);
console.log(`(out of ${filteredKeys.length} keys in target namespaces, across ${srcFiles.length} source files)`);
