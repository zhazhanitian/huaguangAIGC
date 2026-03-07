<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  IconMessage,
  IconImage,
  IconEdit,
  IconVideoCamera,
  IconMusic,
  IconApps,
  IconArrowRight,
} from '@arco-design/web-vue/es/icon'

const router = useRouter()

const coreModules = [
  {
    id: 'chat',
    title: '智能对话',
    subtitle: 'Chat',
    description: '搭载先进的自然语言处理模型，为您提供编程辅助、文案创作与日常问答的智能交互体验。',
    icon: IconMessage,
    path: '/chat',
    color: 'linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)',
    bgLight: 'rgba(0, 114, 255, 0.05)',
  },
  {
    id: 'draw',
    title: '绘画创作',
    subtitle: 'Generation',
    description: '通过文本描述快速生成高品质图像，激发视觉创意，打破设计灵感的边界。',
    icon: IconImage,
    path: '/draw',
    color: 'linear-gradient(135deg, #F093FB 0%, #F5576C 100%)',
    bgLight: 'rgba(245, 87, 108, 0.05)',
  },
  {
    id: 'canvas',
    title: '无限画布',
    subtitle: 'Infinite Canvas',
    description: '无拘无束的白板空间，支持节点拖拽、自由排版，构建您的思维导图与工作流。',
    icon: IconEdit,
    path: '/canvas',
    color: 'linear-gradient(135deg, #F6D365 0%, #FDA085 100%)',
    bgLight: 'rgba(253, 160, 133, 0.05)',
  },
  {
    id: 'video',
    title: '视频生成',
    subtitle: 'Video Creation',
    description: '将静态图像或文本转化为动态视频，让创意跃然屏上，重塑视觉叙事方式。',
    icon: IconVideoCamera,
    path: '/video',
    color: 'linear-gradient(135deg, #5EE7DF 0%, #B490CA 100%)',
    bgLight: 'rgba(180, 144, 202, 0.05)',
  },
  {
    id: 'music',
    title: '音乐创作',
    subtitle: 'Audio Studio',
    description: '智能生成背景音乐与音效，满足多元化的数字媒体内容创作需求。',
    icon: IconMusic,
    path: '/music',
    color: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
    bgLight: 'rgba(118, 75, 162, 0.05)',
  },
  {
    id: 'model3d',
    title: '3D 模型',
    subtitle: '3D Assets',
    description: '前沿的三维模型生成技术，助力游戏开发、工业设计及虚拟现实场景构建。',
    icon: IconApps,
    path: '/model3d',
    color: 'linear-gradient(135deg, #84FAB0 0%, #8FD3F4 100%)',
    bgLight: 'rgba(143, 211, 244, 0.05)',
  },
]

const upcomingModules = [
  {
    id: 'self-learn',
    title: '自学模块',
    subtitle: 'Self Learning',
    description: '聚合图文与视频学习内容，构建可持续迭代的 人工智能 自学资源中心。',
    icon: IconEdit,
    color: 'linear-gradient(135deg, #4FACFE 0%, #00F2FE 100%)',
    bgLight: 'rgba(79, 172, 254, 0.08)',
    actionText: '内容筹备中',
  },
  {
    id: 'quanzhou-carving',
    title: '泉州雕艺大模型',
    subtitle: 'Carving Model',
    description: '木雕、石雕、白瓷雕塑垂类应用项目。',
    icon: IconApps,
    color: 'linear-gradient(135deg, #FA709A 0%, #FEE140 100%)',
    bgLight: 'rgba(250, 112, 154, 0.08)',
    actionText: '内容筹备中',
  },
  {
    id: 'quanzhou-food',
    title: '泉州美食之都垂类大模型',
    subtitle: 'Cuisine Model',
    description: '世界美食之都大模型应用项目。',
    icon: IconMusic,
    color: 'linear-gradient(135deg, #43E97B 0%, #38F9D7 100%)',
    bgLight: 'rgba(67, 233, 123, 0.08)',
    actionText: '内容筹备中',
  },
]

function navigateTo(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="home-container">
    <!-- Hero Banner -->
    <!-- <div class="hero-section">
      <div class="hero-background">
        <div class="glow-orb orb-1"></div>
        <div class="glow-orb orb-2"></div>
        <div class="grid-pattern"></div>
      </div>

      <div class="hero-content">
        <h1 class="hero-title">泉州华光职业学院</h1>
        <div class="school-badge">人工智能应用平台</div>
        <p class="hero-subtitle">
          汇聚前沿 人工智能 技术，打造校级一站式创意设计中枢。<br />
          在这里，释放想象力，让 人工智能 赋能每一次创作。
        </p>
        <div class="hero-actions">
          <button class="primary-btn" @click="navigateTo('/chat')">
            开始创作
            <IconArrowRight />
          </button>
        </div>
      </div>
    </div> -->

    <!-- Modules Grid -->
    <div class="modules-section">
      <div class="section-header">
        <h2>核心能力矩阵</h2>
        <p>探索多元化的人工智能创作模块，开启智能设计之旅</p>
      </div>

      <div class="bento-grid">
        <div v-for="mod in coreModules" :key="mod.id" class="bento-card" @click="navigateTo(mod.path)">
          <div class="card-bg" :style="{ background: mod.bgLight }"></div>
          <div class="card-header">
            <div class="icon-box" :style="{ background: mod.color }">
              <component :is="mod.icon" :size="28" />
            </div>
            <span class="en-subtitle">{{ mod.subtitle }}</span>
          </div>
          <div class="card-body">
            <h3>{{ mod.title }}</h3>
            <p>{{ mod.description }}</p>
          </div>
          <div class="card-footer">
            <span class="action-text">进入探索</span>
            <IconArrowRight class="action-icon" />
          </div>
        </div>
      </div>

      <div class="bento-grid bento-grid--triple extra-grid">
        <div v-for="mod in upcomingModules" :key="mod.id" class="bento-card bento-card--static">
          <div class="card-bg" :style="{ background: mod.bgLight }"></div>
          <div class="card-header">
            <div class="icon-box" :style="{ background: mod.color }">
              <component :is="mod.icon" :size="28" />
            </div>
            <span class="en-subtitle">{{ mod.subtitle }}</span>
          </div>
          <div class="card-body">
            <h3>{{ mod.title }}</h3>
            <p>{{ mod.description }}</p>
          </div>
          <div class="card-footer">
            <span class="action-text">{{ mod.actionText }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <p>© 2026 泉州华光职业学院 - 人工智能 创意设计平台. All rights reserved.</p>
    </footer>
  </div>
</template>

<style scoped>
/* 容器 */
.home-container {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: var(--bg-body);
  scroll-behavior: smooth;
}

/* --- Hero Section --- */
.hero-section {
  position: relative;
  min-height: 75vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5%;
  overflow: hidden;
  border-bottom: 1px solid var(--border-1);
}

.hero-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  overflow: hidden;
  background: var(--hero-base-gradient);
  --hero-base-gradient: linear-gradient(180deg, var(--bg-surface-1) 0%, var(--bg-surface-2) 100%);
  --hero-image-opacity: 0.86;
  --hero-image-saturate: 1;
  --hero-image-brightness: 1;
  --hero-image-scale: 1.02;
  --hero-overlay-color: rgba(10, 18, 34, 0.42);
  --hero-orb-opacity: 0.52;
}

.hero-background::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 18% 20%, rgba(22, 93, 255, 0.2), transparent 56%),
    radial-gradient(circle at 78% 75%, rgba(114, 46, 209, 0.16), transparent 52%);
  pointer-events: none;
  z-index: 1;
}

.hero-background::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--hero-overlay-color);
  pointer-events: none;
  z-index: 2;
}

.grid-pattern {
  position: absolute;
  inset: 0;
  background-image: url('../assets/hero-cyber.png');
  background-size: cover;
  background-position: center;
  opacity: var(--hero-image-opacity);
  filter: saturate(var(--hero-image-saturate)) brightness(var(--hero-image-brightness));
  transform: scale(var(--hero-image-scale));
  transform-origin: center;
  z-index: 0;
}

:global(body[arco-theme='dark']) .hero-background {
  --hero-base-gradient:
    radial-gradient(circle at 15% 15%, rgba(22, 93, 255, 0.2), transparent 55%),
    linear-gradient(180deg, #1a202d 0%, #121722 100%);
  --hero-image-opacity: 0.4;
  --hero-image-saturate: 0.9;
  --hero-image-brightness: 0.88;
  --hero-overlay-color: rgba(5, 9, 18, 0.5);
  --hero-orb-opacity: 0.5;
}

:global(body[arco-theme='light']) .hero-background {
  --hero-base-gradient:
    radial-gradient(circle at 12% 18%, rgba(22, 93, 255, 0.11), transparent 54%),
    linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
  --hero-image-opacity: 0.28;
  --hero-image-saturate: 0.75;
  --hero-image-brightness: 1.16;
  --hero-overlay-color: rgba(255, 255, 255, 0.24);
  --hero-orb-opacity: 0.36;
}

.glow-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: var(--hero-orb-opacity);
  animation: float 10s ease-in-out infinite alternate;
  z-index: 1;
}

.orb-1 {
  width: 500px;
  height: 500px;
  background: rgba(22, 93, 255, 0.2);
  top: -100px;
  left: -100px;
}

.orb-2 {
  width: 400px;
  height: 400px;
  background: rgba(114, 46, 209, 0.2);
  bottom: -50px;
  right: 10%;
  animation-delay: -5s;
}

@keyframes float {
  0% {
    transform: translateY(0) scale(1);
  }

  100% {
    transform: translateY(40px) scale(1.05);
  }
}

.hero-content {
  position: relative;
  z-index: 1;
  text-align: center;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.school-badge {
  display: inline-block;
  padding: 12px 36px;
  border-radius: 40px;
  background: linear-gradient(135deg, var(--primary-5) 0%, var(--primary-6) 100%);
  color: #fff;
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: 4px;
  box-shadow: 0 12px 32px rgba(22, 93, 255, 0.3);
  margin-top: 4px;
}

.hero-title {
  font-size: 3.5rem;
  font-weight: 900;
  margin: 0;
  line-height: 1.2;
  font-family: 'Space Grotesk', 'Outfit', -apple-system, 'PingFang SC', sans-serif;
  letter-spacing: -0.02em;
  /* background: linear-gradient(135deg, var(--text-1) 0%, var(--text-2) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent; */
  color: #fff;
}

.hero-subtitle {
  font-size: 1.25rem;
  color: #fff;
  line-height: 1.8;
  max-width: 700px;
  margin: 0;
  font-family: 'Outfit', -apple-system, 'PingFang SC', sans-serif;
}

.hero-actions {
  margin-top: 1rem;
}

.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 16px 36px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
  background: var(--gradient-primary);
  border: none;
  border-radius: 30px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(22, 93, 255, 0.3);
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.primary-btn:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 12px 32px rgba(22, 93, 255, 0.4);
}

/* --- Modules Section --- */
.modules-section {
  padding: 60px 5%;
  max-width: 1400px;
  margin: 0 auto;
}

.extra-grid {
  margin-top: 2.5rem;
}

.section-header {
  text-align: center;
  margin-bottom: 60px;
}

.section-header h2 {
  font-size: 2.5rem;
  font-weight: 800;
  color: var(--text-1);
  margin: 0 0 16px;
}

.section-header p {
  font-size: 1.1rem;
  color: var(--text-3);
  margin: 0;
}

/* 模块网格 */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 2.5rem;
}

.bento-card {
  position: relative;
  background: var(--bg-surface-1);
  border: 1px solid var(--border-1);
  border-radius: 24px;
  padding: 40px 32px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  box-shadow: var(--shadow-sm);
}

.card-bg {
  position: absolute;
  top: -50%;
  right: -50%;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  filter: blur(50px);
  transition: all 0.6s ease;
  opacity: 0;
}

.bento-card:hover {
  transform: translateY(-10px);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.08), 0 0 0 1px var(--primary-light);
  border-color: transparent;
}

.bento-card:hover .card-bg {
  opacity: 1;
  transform: scale(1.5);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  position: relative;
  z-index: 1;
}

.icon-box {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.bento-card:hover .icon-box {
  transform: scale(1.1) rotate(5deg);
}

.en-subtitle {
  font-size: 0.85rem;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}

.card-body {
  flex: 1;
  position: relative;
  z-index: 1;
}

.card-body h3 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-1);
  margin: 0 0 12px;
  transition: color 0.3s ease;
}

.bento-card:hover .card-body h3 {
  color: var(--primary-6);
}

.card-body p {
  font-size: 1rem;
  color: var(--text-3);
  line-height: 1.6;
  margin: 0;
}

.card-footer {
  margin-top: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-3);
  font-weight: 500;
  transition: color 0.3s ease;
  position: relative;
  z-index: 1;
}

.action-icon {
  transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.bento-card:hover .card-footer {
  color: var(--primary-6);
}

.bento-card:hover .action-icon {
  transform: translateX(6px);
}

.bento-card--static {
  cursor: default;
}

.bento-card--static .card-footer {
  color: var(--text-4);
}

.bento-card--static:hover {
  transform: translateY(-6px);
}

/* Footer */
.footer {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-4);
  font-size: 0.9rem;
  border-top: 1px solid var(--border-1);
  background: var(--bg-surface-1);
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .hero-title {
    font-size: 3.5rem;
  }
}

@media (max-width: 768px) {
  .hero-title {
    font-size: 2.5rem;
  }

  .hero-subtitle {
    font-size: 1.1rem;
  }

  .section-header h2 {
    font-size: 2rem;
  }

  .bento-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .bento-card {
    padding: 30px 24px;
  }
}
</style>