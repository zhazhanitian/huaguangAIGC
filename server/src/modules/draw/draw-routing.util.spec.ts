import { BadRequestException } from '@nestjs/common';
import { resolveImageProviderChannel } from './draw-routing.util';

describe('draw-routing util', () => {
  it('routes nano-banana-pro to grsai when it is not a MAPI source model', () => {
    expect(resolveImageProviderChannel('nano-banana-pro', false)).toBe('grsai');
  });

  it('routes nano-banana-2 to mapi when source is mapi', () => {
    expect(resolveImageProviderChannel('nano-banana-2', true)).toBe('mapi');
  });

  it('throws a clear configuration error when nano-banana-2 is not configured as mapi', () => {
    expect(() => resolveImageProviderChannel('nano-banana-2', false)).toThrow(
      BadRequestException,
    );
    expect(() => resolveImageProviderChannel('nano-banana-2', false)).toThrow(
      '模型 nano-banana-2 当前仅支持通过 MAPI 配置',
    );
  });
});
