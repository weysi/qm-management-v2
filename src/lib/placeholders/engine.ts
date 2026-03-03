import type { Client } from '@/lib/schemas';

interface TextToken {
  kind: 'text';
  text: string;
}

interface PlaceholderToken {
  kind: 'placeholder';
  raw: string;
  variable: string;
}

type Token = TextToken | PlaceholderToken;

const PATH_REGEX = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;

  function pushText(value: string) {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev?.kind === 'text') {
      prev.text += value;
      return;
    }
    out.push({ kind: 'text', text: value });
  }

  while (i < text.length) {
    if (text.startsWith('\\{{', i)) {
      pushText('{{');
      i += 3;
      continue;
    }
    if (text.startsWith('\\${', i)) {
      pushText('${');
      i += 3;
      continue;
    }

    if (text.startsWith('{{', i)) {
      const close = text.indexOf('}}', i + 2);
      if (close === -1) {
        pushText(text.slice(i));
        break;
      }
      const expr = text.slice(i + 2, close).trim();
      if (expr && PATH_REGEX.test(expr)) {
        out.push({
          kind: 'placeholder',
          raw: text.slice(i, close + 2),
          variable: expr,
        });
      } else {
        pushText(text.slice(i, close + 2));
      }
      i = close + 2;
      continue;
    }

    if (text.startsWith('${', i)) {
      const close = text.indexOf('}', i + 2);
      if (close === -1) {
        pushText(text.slice(i));
        break;
      }
      const expr = text.slice(i + 2, close).trim();
      if (expr && PATH_REGEX.test(expr)) {
        out.push({
          kind: 'placeholder',
          raw: text.slice(i, close + 1),
          variable: expr,
        });
      } else {
        pushText(text.slice(i, close + 1));
      }
      i = close + 1;
      continue;
    }

    const nextMustache = text.indexOf('{{', i);
    const nextJs = text.indexOf('${', i);
    const next = [nextMustache, nextJs]
      .filter(index => index !== -1)
      .sort((a, b) => a - b)[0];

    if (next === undefined) {
      pushText(text.slice(i));
      break;
    }
    pushText(text.slice(i, next));
    i = next;
  }

  return out;
}

function getValueByPath(
  data: Record<string, string>,
  path: string,
): string | undefined {
  if (path in data) return data[path];

  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Extract all unique placeholder variables from a string.
 */
export function extractPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const token of tokenize(text)) {
    if (token.kind === 'placeholder') {
      found.add(token.variable);
    }
  }
  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

/**
 * Replace placeholders in text using the provided map.
 * Unresolved placeholders are left as-is.
 */
export function resolvePlaceholders(
  text: string,
  map: Record<string, string>,
): string {
  return tokenize(text)
    .map(token => {
      if (token.kind === 'text') return token.text;
      const value = getValueByPath(map, token.variable);
      if (value === undefined || value.trim() === '') {
        return token.raw;
      }
      return value;
    })
    .join('');
}

/**
 * Build a placeholder map from a Client object.
 * Keys match current template token aliases and can be migrated to canonical dot-paths.
 */
export function buildPlaceholderMap(client: Client): Record<string, string> {
  const today = new Date().toISOString().split('T')[0];
  return {
    COMPANY_NAME: client.name,
    COMPANY_ADDRESS: client.address,
    COMPANY_ZIP_CITY: client.zipCity,
    INDUSTRY: client.industry,
    CEO_NAME: client.ceo,
    GF_NAME: client.ceo,
    QM_MANAGER_NAME: client.qmManager,
    EMPLOYEE_COUNT: String(client.employeeCount),
    PRODUCTS: client.products,
    SERVICES: client.services,
    COMPANY_LOGO: client.logoUrl ?? '',
    COMPANY_SIGNATURE: client.signatureUrl ?? '',
    REVISION: '1.0',
    VALIDITY_DATE: today,
    VERSION: 'v1',
    DATE: today,
    APPROVAL: client.ceo,
    DISTRIBUTION: 'Intern',
  };
}

/**
 * Returns a status map: key -> "resolved" | "unresolved"
 */
export function getPlaceholderStatuses(
  tokens: string[],
  map: Record<string, string>,
): Record<string, 'resolved' | 'unresolved'> {
  return Object.fromEntries(
    tokens.map(key => {
      const value = getValueByPath(map, key);
      return [
        key,
        value !== undefined && value.trim() !== '' ? 'resolved' : 'unresolved',
      ];
    }),
  );
}
