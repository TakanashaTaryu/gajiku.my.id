export const RESERVED_SUBDOMAINS_SET = new Set([
  'www', 'api', 'app', 'admin', 'super-admin', 'superadmin',
  'auth', 'login', 'oauth', 'callback', 'mail', 'smtp', 'imap',
  'cdn', 'static', 'assets', 'img', 'files', 'docs', 'help',
  'status', 'dev', 'staging', 'test', 'localhost', 'ns1', 'ns2',
  'root', 'system', 'support', 'billing', 'gajiku'
]);

export const RESERVED_SUBDOMAINS = RESERVED_SUBDOMAINS_SET;

export function slugifySubdomain(name: string): string {
  if (!name) return '';
  let slug = name.toLowerCase();
  slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  slug = slug.replace(/[^a-z0-9]+/g, '-');
  slug = slug.replace(/^-+|-+$/g, '');
  slug = slug.replace(/-+/g, '-');
  if (slug.length > 40) {
    slug = slug.substring(0, 40).replace(/-+$/, '');
  }
  return slug;
}

export function validateSubdomain(subdomain: string): { valid: boolean; error?: string } {
  if (!subdomain || subdomain.length < 3) {
    return { valid: false, error: 'Subdomain minimal 3 karakter.' };
  }
  if (subdomain.length > 40) {
    return { valid: false, error: 'Subdomain maksimal 40 karakter.' };
  }
  const regex = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
  if (!regex.test(subdomain)) {
    return { valid: false, error: 'Subdomain hanya boleh berisi huruf kecil (a-z), angka (0-9), dan tanda hubung (-), tidak boleh diawali atau diakhiri tanda hubung.' };
  }
  if (RESERVED_SUBDOMAINS_SET.has(subdomain)) {
    return { valid: false, error: `Subdomain '${subdomain}' dicadangkan untuk sistem dan tidak dapat digunakan.` };
  }
  return { valid: true };
}

export async function resolveUniqueSubdomain(
  db: D1Database,
  baseSlug: string,
  existingOrgId?: number
): Promise<string> {
  let candidate = baseSlug || 'organisasi';
  if (RESERVED_SUBDOMAINS_SET.has(candidate)) {
    candidate = `${candidate}-org`;
  }

  let counter = 1;
  let current = candidate;

  while (true) {
    let query = 'SELECT id FROM organizations WHERE subdomain = ?';
    const params: (string | number)[] = [current];
    if (existingOrgId) {
      query += ' AND id != ?';
      params.push(existingOrgId);
    }
    const row = await db.prepare(query).bind(...params).first();
    if (!row) {
      return current;
    }
    counter++;
    current = `${candidate}-${counter}`;
  }
}
