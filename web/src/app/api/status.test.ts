import { getServiceStatus, serviceStatusSchema } from './status';

describe('service status API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes all documented health states', () => {
    for (const health of ['ok', 'degraded', 'unavailable'] as const) {
      expect(serviceStatusSchema.parse({ health, revision: 2 })).toEqual({ health, revision: 2 });
    }
  });

  it('loads status with an optional abort signal', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ health: 'ok', revision: 1 }), { status: 200 }),
    );
    const controller = new AbortController();

    await expect(getServiceStatus(controller.signal)).resolves.toEqual({ health: 'ok', revision: 1 });
    expect(fetchSpy).toHaveBeenCalledWith('/api/status', expect.objectContaining({ signal: controller.signal }));
  });

  it('rejects HTTP and schema errors', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(getServiceStatus()).rejects.toThrow('无法读取服务状态。');

    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ health: 'unknown' }), { status: 200 }));
    await expect(getServiceStatus()).rejects.toThrow('服务状态数据无效。');
  });
});
