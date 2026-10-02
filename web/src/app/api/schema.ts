import { z } from 'zod';

// The production CSP forbids eval. Disable Zod's optional code generation
// before constructing schemas, including its eval capability probe.
z.config({ jitless: true });

export { z };
