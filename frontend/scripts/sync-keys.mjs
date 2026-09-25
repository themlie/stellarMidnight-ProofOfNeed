// Copies the compiled contract's proving keys and ZKIR into public/ so the
// browser can fetch them (FetchZkConfigProvider expects <base>/keys and <base>/zkir).
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const managed = fileURLToPath(new URL('../../managed/burs_eligibility/', import.meta.url));
const target = fileURLToPath(new URL('../public/burs_eligibility/', import.meta.url));

rmSync(target, { recursive: true, force: true });
for (const dir of ['keys', 'zkir']) {
  cpSync(managed + dir, target + dir, { recursive: true });
}
console.log('synced proving keys and zkir into public/burs_eligibility');
