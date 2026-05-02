import {
  computeCallPrice,
  estimateMaxPrice,
  extractPriceList,
  ptsToPoints,
  type MapiPriceItem,
} from './mapi-pricing';

/** 复刻真实 MAPI rawMetadata.appPriceModelList 数据（部分字段省略） */
const PRICING_FIXTURES: Record<string, MapiPriceItem[]> = {
  // ========== 图片 ==========
  'doubao-seedream-4-0': [
    { priceName: '文生图', priceType: 'FIX', unitType: 'FIX', unitPrice: 200 },
    { priceName: '图生图', priceType: 'FIX', unitType: 'FIX', unitPrice: 200 },
  ],
  'nano-banana-pro': [
    { priceName: '文生图', priceType: 'FIX', unitType: 'FIX', unitPrice: 1710 },
  ],
  // ========== 视频 按秒 ==========
  'kling-3.0': [
    { priceName: '无声/720/768P', priceType: 'OUTPUT', unitType: 'SECOND', unitPrice: 480 },
    { priceName: '无声/1080P', priceType: 'OUTPUT', unitType: 'SECOND', unitPrice: 640 },
    { priceName: '有声+无音色/720/768P', priceType: 'OUTPUT', unitType: 'SECOND', unitPrice: 720 },
    { priceName: '有声+无音色/1080P', priceType: 'OUTPUT', unitType: 'SECOND', unitPrice: 960 },
    { priceName: '有声+有音色/720/768p', priceType: 'OUTPUT', unitType: 'SECOND', unitPrice: 960 },
    { priceName: '有声+有音色/1080p', priceType: 'OUTPUT', unitType: 'SECOND', unitPrice: 960 },
  ],
  'Hailuo-2.3': [
    { priceName: '海螺/720P/768p', priceType: 'OUTPUT', unitType: 'SECOND', unitPrice: 300 },
    { priceName: '海螺/1080P', priceType: 'OUTPUT', unitType: 'SECOND', unitPrice: 450 },
  ],
  // ========== 视频 按 token ==========
  'doubao-seedance-1-5-pro': [
    { priceName: '有声视频', priceType: 'OUTPUT', unitType: 'TOKEN', unitPrice: 16000 },
    { priceName: '批量推理有声视频', priceType: 'OUTPUT', unitType: 'TOKEN', unitPrice: 8000 },
    { priceName: '无声视频', priceType: 'OUTPUT', unitType: 'TOKEN', unitPrice: 8000 },
    { priceName: '批量推理无声视频', priceType: 'OUTPUT', unitType: 'TOKEN', unitPrice: 4000 },
  ],
  'doubao-seedance-2-0': [
    { priceName: '包含视频输入', priceType: 'OUTPUT', unitType: 'TOKEN', unitPrice: 42000 },
    { priceName: '不包含视频输入', priceType: 'OUTPUT', unitType: 'TOKEN', unitPrice: 69000 },
  ],
  // ========== 文本 ==========
  'doubao-seed-1-6-flash': [
    { priceName: '推理输入', priceType: 'INPUT', unitType: 'TOKEN', unitPrice: 150 },
    { priceName: '推理输出', priceType: 'OUTPUT', unitType: 'TOKEN', unitPrice: 1500 },
    { priceName: '缓存命中', priceType: 'CACHE', unitType: 'TOKEN', unitPrice: 30 },
    { priceName: '批量推理输入', priceType: 'INPUT', unitType: 'TOKEN', unitPrice: 150 },
    { priceName: '批量推理输出', priceType: 'OUTPUT', unitType: 'TOKEN', unitPrice: 1500 },
    { priceName: '批量缓存命中', priceType: 'CACHE', unitType: 'TOKEN', unitPrice: 30 },
  ],
  'glm-5': [
    { priceName: '推理输入', priceType: 'INPUT', unitType: 'TOKEN', unitPrice: 8100 },
    { priceName: '推理输出', priceType: 'OUTPUT', unitType: 'TOKEN', unitPrice: 29700 },
    { priceName: '缓存输入', priceType: 'CACHE', unitType: 'TOKEN', unitPrice: 120 },
    { priceName: '推理输入token>32k', priceType: 'INPUT', unitType: 'TOKEN', unitPrice: 500 },
    { priceName: '推理输出token>32k', priceType: 'OUTPUT', unitType: 'TOKEN', unitPrice: 1000 },
    { priceName: '缓存输入token>32k', priceType: 'CACHE', unitType: 'TOKEN', unitPrice: 120 },
  ],
};

describe('mapi-pricing', () => {
  describe('extractPriceList', () => {
    it('parses rawMetadata string', () => {
      const list = extractPriceList(
        JSON.stringify({
          appPriceModelList: [
            { priceName: '文生图', unitType: 'FIX', unitPrice: 200 },
          ],
        }),
      );
      expect(list).toHaveLength(1);
      expect(list[0]?.unitPrice).toBe(200);
    });

    it('returns empty for invalid input', () => {
      expect(extractPriceList(null)).toEqual([]);
      expect(extractPriceList('not-json')).toEqual([]);
      expect(extractPriceList({})).toEqual([]);
    });
  });

  describe('ptsToPoints', () => {
    it('ceils to integer and at least 1', () => {
      expect(ptsToPoints(1)).toBe(1);
      expect(ptsToPoints(9)).toBe(1);
      expect(ptsToPoints(10)).toBe(1);
      expect(ptsToPoints(11)).toBe(2);
      expect(ptsToPoints(200)).toBe(20);
      expect(ptsToPoints(1710)).toBe(171);
      expect(ptsToPoints(0)).toBe(0);
      expect(ptsToPoints(-5)).toBe(0);
    });
  });

  describe('image pricing (FIX × n)', () => {
    it('Seedream 4.0 single image', () => {
      const r = computeCallPrice(PRICING_FIXTURES['doubao-seedream-4-0']!, {
        kind: 'image',
        n: 1,
      });
      expect(r.pts).toBe(200);
      expect(r.points).toBe(20);
    });

    it('Seedream 4.0 n=5', () => {
      const r = computeCallPrice(PRICING_FIXTURES['doubao-seedream-4-0']!, {
        kind: 'image',
        n: 5,
      });
      expect(r.pts).toBe(1000);
      expect(r.points).toBe(100);
    });

    it('Nano Banana Pro single image', () => {
      const r = computeCallPrice(PRICING_FIXTURES['nano-banana-pro']!, {
        kind: 'image',
        n: 1,
      });
      expect(r.pts).toBe(1710);
      expect(r.points).toBe(171);
    });
  });

  describe('video pricing (SECOND × resolution × audio)', () => {
    it('Kling 无声 720P × 5s', () => {
      const r = computeCallPrice(PRICING_FIXTURES['kling-3.0']!, {
        kind: 'video',
        resolution: '720p',
        duration: 5,
        withAudio: false,
      });
      expect(r.pts).toBe(480 * 5); // 2400
      expect(r.points).toBe(240);
    });

    it('Kling 有声+有音色 1080P × 10s (最贵档)', () => {
      const r = computeCallPrice(PRICING_FIXTURES['kling-3.0']!, {
        kind: 'video',
        resolution: '1080p',
        duration: 10,
        withAudio: true,
        withVoice: true,
      });
      expect(r.pts).toBe(960 * 10); // 9600
      expect(r.points).toBe(960);
    });

    it('Kling 有声+无音色 720P × 5s', () => {
      const r = computeCallPrice(PRICING_FIXTURES['kling-3.0']!, {
        kind: 'video',
        resolution: '720p',
        duration: 5,
        withAudio: true,
        withVoice: false,
      });
      expect(r.pts).toBe(720 * 5); // 3600
      expect(r.points).toBe(360);
    });

    it('Hailuo 720P × 6s', () => {
      const r = computeCallPrice(PRICING_FIXTURES['Hailuo-2.3']!, {
        kind: 'video',
        resolution: '720P',
        duration: 6,
      });
      expect(r.pts).toBe(300 * 6);
      expect(r.points).toBe(180);
    });

    it('Hailuo 1080P × 6s', () => {
      const r = computeCallPrice(PRICING_FIXTURES['Hailuo-2.3']!, {
        kind: 'video',
        resolution: '1080P',
        duration: 6,
      });
      expect(r.pts).toBe(450 * 6);
      expect(r.points).toBe(270);
    });
  });

  describe('video pricing (TOKEN × audio/input)', () => {
    it('Seedance 1.5 pro 有声视频 25w token', () => {
      const r = computeCallPrice(PRICING_FIXTURES['doubao-seedance-1-5-pro']!, {
        kind: 'video',
        withAudio: true,
        videoTokens: 250_000,
      });
      expect(r.pts).toBeCloseTo(16000 * 0.25); // 4000
      expect(r.points).toBe(400);
    });

    it('Seedance 1.5 pro 无声视频 25w token (价格减半)', () => {
      const r = computeCallPrice(PRICING_FIXTURES['doubao-seedance-1-5-pro']!, {
        kind: 'video',
        withAudio: false,
        videoTokens: 250_000,
      });
      expect(r.pts).toBeCloseTo(8000 * 0.25); // 2000
      expect(r.points).toBe(200);
    });

    it('Seedance 2.0 不含输入 25w token', () => {
      const r = computeCallPrice(PRICING_FIXTURES['doubao-seedance-2-0']!, {
        kind: 'video',
        withInputVideo: false,
        videoTokens: 250_000,
      });
      expect(r.pts).toBeCloseTo(69000 * 0.25); // 17250
      expect(r.points).toBe(1725);
    });

    it('Seedance 2.0 含输入 25w token', () => {
      const r = computeCallPrice(PRICING_FIXTURES['doubao-seedance-2-0']!, {
        kind: 'video',
        withInputVideo: true,
        videoTokens: 250_000,
      });
      expect(r.pts).toBeCloseTo(42000 * 0.25); // 10500
      expect(r.points).toBe(1050);
    });
  });

  describe('text pricing (INPUT + OUTPUT + CACHE)', () => {
    it('Seed 1.6 flash: 1000 prompt / 0 cached / 2000 completion', () => {
      const r = computeCallPrice(PRICING_FIXTURES['doubao-seed-1-6-flash']!, {
        kind: 'text',
        promptTokens: 1000,
        cachedTokens: 0,
        completionTokens: 2000,
      });
      // 150 * 1000/1e6 + 1500 * 2000/1e6 = 0.15 + 3 = 3.15
      expect(r.pts).toBeCloseTo(3.15, 4);
      expect(r.points).toBe(1);
    });

    it('Seed 1.6 flash with cache hit', () => {
      const r = computeCallPrice(PRICING_FIXTURES['doubao-seed-1-6-flash']!, {
        kind: 'text',
        promptTokens: 1000,
        cachedTokens: 700,
        completionTokens: 2000,
      });
      // 非缓存输入 = 300  -> 150 * 300/1e6 = 0.045
      // 缓存 700        -> 30  * 700/1e6 = 0.021
      // 输出 2000       -> 1500 * 2000/1e6 = 3.00
      // total ≈ 3.066
      expect(r.pts).toBeCloseTo(3.066, 3);
      expect(r.points).toBe(1);
    });

    it('GLM-5 < 32k 走标准档', () => {
      const r = computeCallPrice(PRICING_FIXTURES['glm-5']!, {
        kind: 'text',
        promptTokens: 1000,
        completionTokens: 2000,
        tokenExceeds32k: false,
      });
      // 8100 * 1000/1e6 + 29700 * 2000/1e6 = 8.1 + 59.4 = 67.5
      expect(r.pts).toBeCloseTo(67.5, 3);
      expect(r.points).toBe(7);
    });

    it('GLM-5 > 32k 走特殊档', () => {
      const r = computeCallPrice(PRICING_FIXTURES['glm-5']!, {
        kind: 'text',
        promptTokens: 40000,
        completionTokens: 5000,
        tokenExceeds32k: true,
      });
      // 500 * 40000/1e6 + 1000 * 5000/1e6 = 20 + 5 = 25
      expect(r.pts).toBeCloseTo(25, 3);
      expect(r.points).toBe(3);
    });
  });

  describe('estimateMaxPrice', () => {
    it('image 预扣 = 实际（FIX 可精确预知）', () => {
      const r = estimateMaxPrice(
        PRICING_FIXTURES['doubao-seedream-4-0']!,
        'image',
        { n: 3 },
      );
      expect(r.pts).toBe(200 * 3);
      expect(r.points).toBe(60);
    });

    it('video 预扣按前端 ctx 精确估算（Kling 720p 无声 × 5s）', () => {
      // 用户选 720p 无声，预扣应匹配「无声/720/768P」档 480 pts/秒
      const r = estimateMaxPrice(PRICING_FIXTURES['kling-3.0']!, 'video', {
        duration: 5,
        resolution: '720p',
        withAudio: false,
      });
      expect(r.pts).toBe(480 * 5); // 2400
      expect(r.points).toBe(240);
    });

    it('video 预扣按前端 ctx 精确估算（Kling 1080p 有声+有音色 × 10s）', () => {
      const r = estimateMaxPrice(PRICING_FIXTURES['kling-3.0']!, 'video', {
        duration: 10,
        resolution: '1080p',
        withAudio: true,
        withVoice: true,
      });
      expect(r.pts).toBe(960 * 10); // 9600
      expect(r.points).toBe(960);
    });

    it('video 未指定 audio 时默认按「有声」保底（保证不会预扣不足）', () => {
      const r = estimateMaxPrice(PRICING_FIXTURES['kling-3.0']!, 'video', {
        duration: 5,
        resolution: '720p',
      });
      // withAudio 缺省 -> true -> 有声+无音色 720p: 720 pts/秒
      expect(r.pts).toBe(720 * 5);
      expect(r.points).toBe(360);
    });

    it('video token 按分辨率×时长线性估算（Seedance 5s 720p 无声 ≈ 11 万 token）', () => {
      const r = estimateMaxPrice(
        PRICING_FIXTURES['doubao-seedance-1-5-pro']!,
        'video',
        {
          duration: 5,
          resolution: '720p',
          withAudio: false,
        },
      );
      // 无声视频 8000 pts/百万 × 110000 token / 1e6 = 880 pts
      expect(r.pts).toBeCloseTo(880, 1);
      expect(r.points).toBe(88);
    });

    it('text 预扣按默认 5000+3000 token 估算', () => {
      const r = estimateMaxPrice(
        PRICING_FIXTURES['doubao-seed-1-6-flash']!,
        'text',
      );
      // 150 * 5000/1e6 + 1500 * 3000/1e6 = 0.75 + 4.5 = 5.25
      expect(r.pts).toBeCloseTo(5.25, 3);
      expect(r.points).toBe(1);
    });
  });
});
