import { BadRequestException } from '@nestjs/common';
import {
  createMapiTencentVideoTask,
  parseMapiGrsaiImageResponseText,
} from './mapi-task-client';

describe('mapi-task-client', () => {
  describe('parseMapiGrsaiImageResponseText', () => {
    it('parses concatenated progress json and returns final succeeded event', () => {
      const text =
        '{"id":"14-a","results":null,"progress":1,"status":"running"}' +
        '{"id":"14-a","results":[{"url":"https://example.com/a.png","content":""}],"progress":100,"status":"succeeded"}';

      const result = parseMapiGrsaiImageResponseText(text);

      expect(result.status).toBe('succeeded');
      expect(result.results?.[0]?.url).toBe('https://example.com/a.png');
    });

    it('parses SSE-style data line payload', () => {
      const text =
        'data: {"id":"14-b","results":[{"url":"https://example.com/b.png","content":""}],"progress":100,"status":"succeeded"}';

      const result = parseMapiGrsaiImageResponseText(text);

      expect(result.status).toBe('succeeded');
      expect(result.results?.[0]?.url).toBe('https://example.com/b.png');
    });

    it('throws readable error on empty text', () => {
      expect(() => parseMapiGrsaiImageResponseText('')).toThrow(
        BadRequestException,
      );
      expect(() => parseMapiGrsaiImageResponseText('')).toThrow(
        'MAPI GrsAI 图片接口返回为空',
      );
    });
  });

  describe('createMapiTencentVideoTask', () => {
    const originalEnv = process.env;
    const originalFetch = global.fetch;

    beforeEach(() => {
      jest.resetModules();
      process.env = {
        ...originalEnv,
        MAPI_ENABLED: 'true',
        MAPI_API_KEY: 'sk-test',
        MAPI_BASE_URL: 'https://kapi.planisp.com/Mapi/v3',
      };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            code: 200,
            data: { ourOrderNo: 'P_26040716160313401000002' },
          }),
      } as Response);
    });

    afterEach(() => {
      process.env = originalEnv;
      global.fetch = originalFetch;
    });

    it('posts Tencent video requests to Tencent endpoint with createAigcVideoTaskRequest body', async () => {
      const result = await createMapiTencentVideoTask(
        {
          ModelName: 'Hailuo',
          ModelVersion: '2.3',
          Prompt: '一只猫在奔跑',
          OutputConfig: {
            StorageMode: 'Temporary',
            Resolution: '1080P',
            Duration: 6,
            AspectRatio: '16:9',
          },
        },
        'task-1',
      );

      expect(result.ourOrderNo).toBe('P_26040716160313401000002');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://kapi.planisp.com/Mapi/Tencent/v3/contents/generations/tasks',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'sk-test',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            createAigcVideoTaskRequest: {
              ModelName: 'Hailuo',
              ModelVersion: '2.3',
              Prompt: '一只猫在奔跑',
              OutputConfig: {
                StorageMode: 'Temporary',
                Resolution: '1080P',
                Duration: 6,
                AspectRatio: '16:9',
              },
            },
            thirdPartyOrderNo: 'task-1',
          }),
        }),
      );
    });
  });
});
