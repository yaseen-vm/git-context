import fs from 'fs';
import path from 'path';

export interface DocumentationFile {
  path: string;
  name: string;
  type:
    | 'readme'
    | 'contributing'
    | 'architecture'
    | 'changelog'
    | 'license'
    | 'api'
    | 'guide'
    | 'other';
  content: string;
  sections: DocumentationSection[];
  wordCount: number;
}

export interface DocumentationSection {
  title: string;
  level: number;
  content: string;
  startIndex: number;
}

export interface DocumentationAnalysis {
  files: DocumentationFile[];
  projectDescription: string | null;
  setupInstructions: string | null;
  keyConcepts: string[];
  summary: string[];
}

const DOC_FILE_PATTERNS: Record<string, DocumentationFile['type']> = {
  'readme.md': 'readme',
  'readme.markdown': 'readme',
  'readme.txt': 'readme',
  'contributing.md': 'contributing',
  'contributing.markdown': 'contributing',
  'architecture.md': 'architecture',
  'architecture.markdown': 'architecture',
  'arch.md': 'architecture',
  'changelog.md': 'changelog',
  'changelog.markdown': 'changelog',
  'changes.md': 'changelog',
  'history.md': 'changelog',
  license: 'license',
  'license.md': 'license',
  'license.markdown': 'license',
  licence: 'license',
  'licence.md': 'license',
  'api.md': 'api',
  'api.markdown': 'api',
  'api-reference.md': 'api',
  'guide.md': 'guide',
  'guide.markdown': 'guide',
  'getting-started.md': 'guide',
  'quickstart.md': 'guide',
};

function getDocType(filename: string): DocumentationFile['type'] {
  const lower = filename.toLowerCase();
  return DOC_FILE_PATTERNS[lower] || 'other';
}

function parseMarkdownSections(content: string): DocumentationSection[] {
  const sections: DocumentationSection[] = [];
  const lines = content.split('\n');
  let currentSection: DocumentationSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      if (currentSection) {
        currentSection.content = currentSection.content.trim();
        sections.push(currentSection);
      }

      currentSection = {
        title: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: '',
        startIndex: i,
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }

  if (currentSection) {
    currentSection.content = currentSection.content.trim();
    sections.push(currentSection);
  }

  return sections;
}

function extractProjectDescription(sections: DocumentationSection[]): string | null {
  const descSection = sections.find(
    (s) =>
      s.level === 1 ||
      s.title.toLowerCase().includes('about') ||
      s.title.toLowerCase().includes('overview') ||
      s.title.toLowerCase().includes('description'),
  );

  if (descSection && descSection.content) {
    const lines = descSection.content.split('\n').filter((l) => l.trim());
    return lines.slice(0, 3).join(' ').substring(0, 500);
  }

  return null;
}

function extractSetupInstructions(sections: DocumentationSection[]): string | null {
  const setupSection = sections.find(
    (s) =>
      s.title.toLowerCase().includes('install') ||
      s.title.toLowerCase().includes('setup') ||
      s.title.toLowerCase().includes('getting started') ||
      s.title.toLowerCase().includes('quickstart') ||
      s.title.toLowerCase().includes('usage'),
  );

  if (setupSection && setupSection.content) {
    const lines = setupSection.content.split('\n').filter((l) => l.trim());
    return lines.slice(0, 10).join('\n').substring(0, 1000);
  }

  return null;
}

function extractKeyConcepts(sections: DocumentationSection[]): string[] {
  const concepts: string[] = [];

  const conceptSections = sections.filter(
    (s) =>
      s.title.toLowerCase().includes('feature') ||
      s.title.toLowerCase().includes('concept') ||
      s.title.toLowerCase().includes('architecture') ||
      s.title.toLowerCase().includes('design') ||
      s.title.toLowerCase().includes('pattern'),
  );

  for (const section of conceptSections) {
    const bulletPoints = section.content.match(/^[\s]*[-*]\s+(.+)$/gm);
    if (bulletPoints) {
      for (const bp of bulletPoints.slice(0, 5)) {
        const concept = bp.replace(/^[\s]*[-*]\s+/, '').trim();
        if (concept.length > 3 && concept.length < 200) {
          concepts.push(concept);
        }
      }
    }
  }

  return concepts.slice(0, 10);
}

export function findDocumentationFiles(repoPath: string, maxDepth: number = 3): string[] {
  const docFiles: string[] = [];

  function scan(dir: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules' &&
            entry.name !== 'dist'
          ) {
            scan(path.join(dir, entry.name), depth + 1);
          }
        } else {
          const lower = entry.name.toLowerCase();
          if (
            lower.endsWith('.md') ||
            lower.endsWith('.markdown') ||
            lower === 'license' ||
            lower === 'licence'
          ) {
            docFiles.push(path.join(dir, entry.name));
          }
        }
      }
    } catch {
      // ignore errors
    }
  }

  scan(repoPath, 0);
  return docFiles;
}

export function parseDocumentationFile(filePath: string): DocumentationFile | null {
  try {
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf-8');
    const name = path.basename(filePath);
    const type = getDocType(name);
    const sections = parseMarkdownSections(content);
    const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;

    return {
      path: filePath,
      name,
      type,
      content,
      sections,
      wordCount,
    };
  } catch {
    return null;
  }
}

export function analyzeDocumentation(repoPath: string): DocumentationAnalysis {
  const docFiles = findDocumentationFiles(repoPath);
  const parsedFiles: DocumentationFile[] = [];

  for (const file of docFiles) {
    const parsed = parseDocumentationFile(file);
    if (parsed) {
      parsedFiles.push(parsed);
    }
  }

  const readme = parsedFiles.find((f) => f.type === 'readme');
  const projectDescription = readme ? extractProjectDescription(readme.sections) : null;
  const setupInstructions = readme ? extractSetupInstructions(readme.sections) : null;

  const keyConcepts: string[] = [];
  for (const file of parsedFiles) {
    keyConcepts.push(...extractKeyConcepts(file.sections));
  }

  const summary: string[] = [];
  summary.push(`Documentation files found: ${parsedFiles.length}`);

  if (readme) {
    summary.push(`README: ${readme.name} (${readme.wordCount} words)`);
    if (projectDescription) {
      summary.push(`Project description: ${projectDescription.substring(0, 100)}...`);
    }
  }

  const otherDocs = parsedFiles.filter((f) => f.type !== 'readme' && f.type !== 'license');
  if (otherDocs.length > 0) {
    summary.push(`Additional documentation: ${otherDocs.map((d) => d.name).join(', ')}`);
  }

  if (keyConcepts.length > 0) {
    summary.push(`Key concepts found: ${keyConcepts.length}`);
  }

  return {
    files: parsedFiles,
    projectDescription,
    setupInstructions,
    keyConcepts,
    summary,
  };
}
