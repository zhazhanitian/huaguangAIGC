import { AuthService } from './auth.service';

describe('AuthService', () => {
  const userRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn(),
  };
  const invitationService = {
    processInvitation: jest.fn(),
  };
  const globalConfigService = {
    getConfig: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses configured defaultPoints as initial balance during register', async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.create.mockImplementation((payload) => payload);
    userRepository.save.mockImplementation(async (payload) => ({
      id: 'user-1',
      avatar: null,
      ...payload,
    }));
    jwtService.sign.mockReturnValue('jwt-token');
    globalConfigService.getConfig.mockResolvedValue('100');

    const service = new (AuthService as any)(
      userRepository,
      jwtService,
      invitationService,
      globalConfigService,
    ) as AuthService;

    const result = await service.register({
      phone: '13800138000',
      password: 'Passw0rd!',
      username: 'tester',
    });

    expect(globalConfigService.getConfig).toHaveBeenCalledWith('defaultPoints');
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '13800138000',
        username: 'tester',
        balance: 100,
      }),
    );
    expect(result.user.balance).toBe(100);
  });
});
