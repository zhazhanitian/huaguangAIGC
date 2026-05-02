import { ModelType } from '../model/model.entity';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  const groupRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const logRepository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
  };
  const aiModelRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const modelService = {
    canUseModel: jest.fn(),
  };
  const userService = {
    deductBalance: jest.fn(),
    addBalance: jest.fn(),
  };
  const contentModeration = {
    assertTextSafe: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    groupRepository.create.mockImplementation((payload) => payload);
    groupRepository.save.mockImplementation(async (payload) => ({
      id: 'group-1',
      isSticky: 0,
      isDelete: 0,
      ...payload,
    }));
  });

  it('falls back to the first available active text model instead of a missing hardcoded default', async () => {
    aiModelRepository.find.mockImplementation(async ({ where }: any) => {
      if (where?.modelName) {
        return [];
      }
      if (where?.isActive === true && where?.type === ModelType.TEXT) {
        return [
          {
            id: 'model-1',
            modelName: 'glm-5',
            type: ModelType.TEXT,
            isActive: true,
            order: 1,
          },
        ];
      }
      return [];
    });
    modelService.canUseModel.mockResolvedValue(true);

    const service = new ChatService(
      groupRepository as any,
      logRepository as any,
      aiModelRepository as any,
      modelService as any,
      userService as any,
      contentModeration as any,
    );

    const group = await service.createGroup('user-1', {});

    expect(groupRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        modelName: 'glm-5',
      }),
    );
    expect(group.modelName).toBe('glm-5');
  });
});
