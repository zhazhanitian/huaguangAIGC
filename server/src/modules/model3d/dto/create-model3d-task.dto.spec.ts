import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateModel3dTaskDto } from './create-model3d-task.dto';
import { Model3dTaskType } from '../model3d.entity';

describe('CreateModel3dTaskDto', () => {
  it('allows empty prompt for img2model tasks', async () => {
    const dto = plainToInstance(CreateModel3dTaskDto, {
      taskType: Model3dTaskType.IMG2MODEL,
      provider: 'tripo3d-image-to-model',
      prompt: '',
      inputImageUrl: 'https://example.com/cat.png',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('still requires prompt for text2model tasks', async () => {
    const dto = plainToInstance(CreateModel3dTaskDto, {
      taskType: Model3dTaskType.TEXT2MODEL,
      provider: 'tripo3d-text-to-model',
      prompt: '',
    });

    const errors = await validate(dto);

    expect(errors.some((item) => item.property === 'prompt')).toBe(true);
  });
});
