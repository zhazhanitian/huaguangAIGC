import { shouldSkipModel3dImg2ImgModeration } from './model3d-moderation.util';

describe('model3d-moderation util', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      OSS_BUCKET: 'hgaigc',
      OSS_REGION: 'oss-cn-shanghai',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('skips repeated moderation for local uploaded files', () => {
    expect(shouldSkipModel3dImg2ImgModeration('/uploads/cat.png')).toBe(true);
    expect(
      shouldSkipModel3dImg2ImgModeration('http://127.0.0.1:3001/uploads/cat.png'),
    ).toBe(true);
  });

  it('skips repeated moderation for current OSS urls', () => {
    expect(
      shouldSkipModel3dImg2ImgModeration(
        'https://hgaigc.oss-cn-shanghai.aliyuncs.com/aigc/upload/cat.png',
      ),
    ).toBe(true);
  });

  it('does not skip moderation for arbitrary public urls', () => {
    expect(
      shouldSkipModel3dImg2ImgModeration('https://picsum.photos/seed/cat/512/512'),
    ).toBe(false);
    expect(
      shouldSkipModel3dImg2ImgModeration('https://example.com/cat.png'),
    ).toBe(false);
  });
});
