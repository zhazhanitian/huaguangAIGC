-- 创建 api_keys 表
CREATE TABLE IF NOT EXISTS `api_keys` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL COMMENT 'API Key 名称（用于展示）',
  `provider` enum('kie','apimart','grsai','openai','custom') NOT NULL DEFAULT 'custom' COMMENT '所属平台',
  `apiKey` varchar(500) NOT NULL COMMENT 'API Key 值',
  `baseUrl` varchar(500) NULL COMMENT 'API Base URL',
  `weight` int NOT NULL DEFAULT 1 COMMENT '权重，用于轮询选择',
  `isActive` tinyint NOT NULL DEFAULT 1 COMMENT '是否启用',
  `usageCount` int NOT NULL DEFAULT 0 COMMENT '使用次数统计',
  `lastUsedAt` datetime NULL COMMENT '最后使用时间',
  `remark` varchar(500) NULL COMMENT '备注说明',
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入初始的 API Keys 数据
INSERT INTO `api_keys` (`id`, `name`, `provider`, `apiKey`, `baseUrl`, `weight`, `isActive`, `remark`) VALUES
(UUID(), 'KIE API', 'kie', 'a27f776a5028b2e0b3d3208293e8c9ac', 'https://api.kie.ai', 1, 1, 'Kling 视频 / Suno 音乐 / Grok Imagine / 4o Image'),
(UUID(), 'Apimart API', 'apimart', 'sk-QDveW1X9IX9GAkWuQ9GbL9NAZSaJA9OfXQ5lbySqYe1zVAIV', 'https://api.apimart.ai/v1', 1, 1, 'GPT-5 / Claude / Gemini / Flux / 豆包等'),
(UUID(), 'GrsAI API', 'grsai', 'sk-4e5fa91a66d54303ba527d2b4b8e5e09', 'https://grsaiapi.com/v1', 1, 1, 'Nano Banana / Gemini 系列模型');
