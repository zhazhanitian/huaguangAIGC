import { BadRequestException } from '@nestjs/common';
import { Model3dTaskType } from './model3d.entity';
import {
  buildTripoCreatePayload,
  extractTripoResultAssets,
  mapTripoStatusToLocal,
  resolveModel3dProviderKind,
} from './model3d-provider.util';

describe('model3d-provider util', () => {
  describe('resolveModel3dProviderKind', () => {
    it('detects tripo providers by name', () => {
      expect(resolveModel3dProviderKind('tripo3d-text-to-model')).toBe('tripo');
      expect(resolveModel3dProviderKind('tripo3d-image-to-model')).toBe('tripo');
    });

    it('keeps existing tencent providers on tencent branch', () => {
      expect(resolveModel3dProviderKind('tencent-hunyuan-3d-pro')).toBe(
        'tencent',
      );
      expect(resolveModel3dProviderKind('tencent-hunyuan-3d-rapid')).toBe(
        'tencent',
      );
    });
  });

  describe('buildTripoCreatePayload', () => {
    it('builds text_to_model payload and keeps official parameter names', () => {
      const payload = buildTripoCreatePayload({
        taskType: Model3dTaskType.TEXT2MODEL,
        prompt: '一只可爱的小猫摆件',
        params: {
          model_version: 'v2.5-20250123',
          texture: true,
          pbr: true,
          face_limit: 12000,
          texture_quality: 'detailed',
          auto_size: true,
          quad: true,
          smart_low_poly: true,
        },
      });

      expect(payload).toEqual({
        type: 'text_to_model',
        prompt: '一只可爱的小猫摆件',
        model_version: 'v2.5-20250123',
        texture: true,
        pbr: true,
        face_limit: 12000,
        texture_quality: 'detailed',
        auto_size: true,
        quad: true,
        smart_low_poly: true,
      });
    });

    it('builds image_to_model payload with image url object', () => {
      const payload = buildTripoCreatePayload({
        taskType: Model3dTaskType.IMG2MODEL,
        prompt: '把这只小猫转成 3D 手办',
        inputImageUrl: 'https://example.com/cat.png',
        params: {
          model_version: 'v2.5-20250123',
          texture_alignment: 'geometry',
          orientation: 'align_image',
          generate_parts: true,
        },
      });

      expect(payload).toEqual({
        type: 'image_to_model',
        file: { type: 'image', url: 'https://example.com/cat.png' },
        model_version: 'v2.5-20250123',
        texture_alignment: 'geometry',
        orientation: 'align_image',
        generate_parts: true,
      });
    });

    it('throws readable error when image_to_model misses image input', () => {
      expect(() =>
        buildTripoCreatePayload({
          taskType: Model3dTaskType.IMG2MODEL,
          prompt: '缺图',
          params: {},
        }),
      ).toThrow(BadRequestException);
      expect(() =>
        buildTripoCreatePayload({
          taskType: Model3dTaskType.IMG2MODEL,
          prompt: '缺图',
          params: {},
        }),
      ).toThrow('Tripo 图生3D任务缺少 inputImageUrl');
    });
  });

  describe('mapTripoStatusToLocal', () => {
    it('maps tripo statuses to local task statuses', () => {
      expect(mapTripoStatusToLocal('queued')).toEqual({
        status: 'pending',
        progress: 20,
      });
      expect(mapTripoStatusToLocal('running')).toEqual({
        status: 'processing',
        progress: 70,
      });
      expect(mapTripoStatusToLocal('success')).toEqual({
        status: 'completed',
        progress: 100,
      });
      expect(mapTripoStatusToLocal('failed')).toEqual({
        status: 'failed',
        progress: 0,
      });
    });
  });

  describe('extractTripoResultAssets', () => {
    it('extracts primary model, preview, and download variants from task output', () => {
      const assets = extractTripoResultAssets({
        model: 'https://cdn.example.com/model.glb',
        pbr_model: 'https://cdn.example.com/model-pbr.glb',
        rendered_image: 'https://cdn.example.com/render.png',
        base_model: 'https://cdn.example.com/model-base.glb',
      });

      expect(assets.primaryModelUrl).toBe('https://cdn.example.com/model.glb');
      expect(assets.previewImageUrl).toBe('https://cdn.example.com/render.png');
      expect(assets.downloads).toEqual([
        { key: 'model', label: '主模型', url: 'https://cdn.example.com/model.glb' },
        { key: 'pbr_model', label: 'PBR 模型', url: 'https://cdn.example.com/model-pbr.glb' },
        { key: 'base_model', label: '基础模型', url: 'https://cdn.example.com/model-base.glb' },
        { key: 'rendered_image', label: '渲染图', url: 'https://cdn.example.com/render.png' },
      ]);
    });
  });
});
