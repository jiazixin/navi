import { getSession } from './auth';

describe('session verification', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it('accepts only a confirmed server session and bypasses cached responses', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"authenticated":true,"authRequired":true}'));
    const signal = new AbortController().signal;
    await expect(getSession(signal)).resolves.toEqual({ authenticated: true, authRequired: true });
    expect(spy).toHaveBeenCalledWith('/api/auth/session', { signal, cache: 'no-store' });
  });
  it('accepts explicitly disabled authentication', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"authenticated":true,"authRequired":false}'));
    await expect(getSession()).resolves.toEqual({ authenticated: true, authRequired: false });
  });
  it('distinguishes an expired session from outages and malformed responses', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(getSession()).resolves.toEqual({ authenticated: false, authRequired: true });
    spy.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(getSession()).rejects.toThrow();
    spy.mockResolvedValueOnce(new Response('{"authenticated":"true"}'));
    await expect(getSession()).rejects.toThrow();
    spy.mockResolvedValueOnce(new Response('{"authenticated":true}'));
    await expect(getSession()).rejects.toThrow();
  });
});
