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
  { id: 'chat', title: '智能对话', subtitle: 'Chat', description: '搭载先进的自然语言处理模型，为您提供编程辅助、文案创作与日常问答的智能交互体验。', icon: IconMessage, path: '/chat', color: 'linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)', bgLight: 'rgba(0, 114, 255, 0.05)' },
  { id: 'draw', title: '绘画创作', subtitle: 'Generation', description: '通过文本描述快速生成高品质图像，激发视觉创意，打破设计灵感的边界。', icon: IconImage, path: '/draw', color: 'linear-gradient(135deg, #F093FB 0%, #F5576C 100%)', bgLight: 'rgba(245, 87, 108, 0.05)' },
  { id: 'canvas', title: '无限画布', subtitle: 'Infinite Canvas', description: '无拘无束的白板空间，支持节点拖拽、自由排版，构建您的思维导图与工作流。', icon: IconEdit, path: '/canvas', color: 'linear-gradient(135deg, #F6D365 0%, #FDA085 100%)', bgLight: 'rgba(253, 160, 133, 0.05)' },
  { id: 'video', title: '视频生成', subtitle: 'Video Creation', description: '将静态图像或文本转化为动态视频，让创意跃然屏上，重塑视觉叙事方式。', icon: IconVideoCamera, path: '/video', color: 'linear-gradient(135deg, #5EE7DF 0%, #B490CA 100%)', bgLight: 'rgba(180, 144, 202, 0.05)' },
  { id: 'music', title: '音乐创作', subtitle: 'Audio Studio', description: '智能生成背景音乐与音效，满足多元化的数字媒体内容创作需求。', icon: IconMusic, path: '/music', color: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)', bgLight: 'rgba(118, 75, 162, 0.05)' },
  { id: 'model3d', title: '3D 模型', subtitle: '3D Assets', description: '前沿的三维模型生成技术，助力游戏开发、工业设计及虚拟现实场景构建。', icon: IconApps, path: '/model3d', color: 'linear-gradient(135deg, #84FAB0 0%, #8FD3F4 100%)', bgLight: 'rgba(143, 211, 244, 0.05)' },
]

const upcomingModules = [
  { id: 'self-learn', title: '自学模块', subtitle: 'Self Learning', description: '聚合图文与视频学习内容，构建可持续迭代的 人工智能 自学资源中心。', icon: IconEdit, color: 'linear-gradient(135deg, #4FACFE 0%, #00F2FE 100%)', bgLight: 'rgba(79, 172, 254, 0.08)', actionText: '内容筹备中' },
  { id: 'quanzhou-carving', title: '泉州雕艺大模型', subtitle: 'Carving Model', description: '木雕、石雕、白瓷雕塑垂类应用项目。', icon: IconApps, color: 'linear-gradient(135deg, #FA709A 0%, #FEE140 100%)', bgLight: 'rgba(250, 112, 154, 0.08)', actionText: '内容筹备中' },
  { id: 'quanzhou-food', title: '泉州美食之都垂类大模型', subtitle: 'Cuisine Model', description: '世界美食之都大模型应用项目。', icon: IconMusic, color: 'linear-gradient(135deg, #43E97B 0%, #38F9D7 100%)', bgLight: 'rgba(67, 233, 123, 0.08)', actionText: '内容筹备中' },
]

// Dashboard 3×3 顺序: [Chat, Draw, Canvas] [Video, Music, 3D] [Self Learn, Carving, Cuisine]
const dashboardModules = [
  ...coreModules,
  ...upcomingModules.map((m) => ({ ...m, path: '' as const })),
]

function getAction(mod: (typeof dashboardModules)[number]) {
  const m = mod as { path?: string; actionText?: string }
  return m.path ? '进入探索' : (m.actionText ?? '内容筹备中')
}

function navigateTo(path: string) {
  if (path) router.push(path)
}

function handleCardClick(mod: (typeof dashboardModules)[number]) {
  const p = (mod as { path?: string }).path
  if (p) navigateTo(p)
}
</script>

<template>
  <div class="dashboard-container">
    <!-- Hero 30% -->
    <header class="hero-section">
      <div class="hero-background">
        <div class="glow-orb orb-1"></div>
        <div class="glow-orb orb-2"></div>
        <div class="grid-pattern"></div>
      </div>
      <div class="hero-content">
        <h1 class="hero-title">泉州华光职业学院</h1>
        <div class="school-badge">人工智能应用平台</div>
        <p class="hero-subtitle">汇聚前沿 人工智能 技术，打造校级一站式创意设计中枢</p>
        <div class="hero-actions">
          <button class="primary-btn" @click="navigateTo('/chat')">
            开始创作
            <IconArrowRight />
          </button>
        </div>
      </div>
    </header>

    <!-- Modules 65% - Bento 3×3 -->
    <section class="modules-section">
      <div class="bento-grid">
        <div v-for="mod in dashboardModules" :key="mod.id" class="bento-card"
          :class="{ 'bento-card--static': !(mod as { path?: string }).path }" @click="handleCardClick(mod)">
          <div class="card-bg" :style="{ background: mod.bgLight }"></div>
          <div class="card-header">
            <div class="icon-box" :style="{ background: mod.color }">
              <component :is="mod.icon" :size="22" />
            </div>
            <span class="en-subtitle">{{ mod.subtitle }}</span>
          </div>
          <div class="card-body">
            <h3>{{ mod.title }}</h3>
            <p>{{ mod.description }}</p>
          </div>
          <div class="card-footer">
            <span class="action-text">{{ getAction(mod) }}</span>
            <IconArrowRight v-if="(mod as { path?: string }).path" class="action-icon" />
          </div>
        </div>
      </div>
    </section>

    <!-- Footer 5% 极简 -->
    <footer class="footer">© 2026 泉州华光职业学院 · 人工智能创意设计平台</footer>
  </div>
</template>

<style scoped>
/* ---------- 大屏一屏 Dashboard 容器 ---------- */
.dashboard-container {
  height: 100vh;
  min-height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-body);
}

/* ---------- Hero 30% ---------- */
.hero-section {
  flex: 0 0 30vh;
  min-height: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4%;
  overflow: hidden;
  border-bottom: 1px solid var(--border-1);
}

.hero-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  --hero-base-gradient: linear-gradient(180deg, var(--bg-surface-1) 0%, var(--bg-surface-2) 100%);
  --hero-overlay-color: rgba(8, 16, 32, 0.65);
  background: var(--hero-base-gradient);
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
  opacity: 0.86;
  filter: saturate(var(--hero-image-saturate, 1)) brightness(var(--hero-image-brightness, 1));
  transform: scale(var(--hero-image-scale, 1.02));
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
}

:global(body[arco-theme='light']) .hero-background {
  --hero-base-gradient:
    radial-gradient(circle at 12% 18%, rgba(22, 93, 255, 0.11), transparent 54%),
    linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
  --hero-image-opacity: 0.28;
  --hero-image-saturate: 0.75;
  --hero-image-brightness: 1.16;
  --hero-overlay-color: rgba(255, 255, 255, 0.24);
}

.glow-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: var(--hero-orb-opacity, 0.52);
  animation: float 10s ease-in-out infinite alternate;
  z-index: 1;
}

.orb-1 {
  width: 320px;
  height: 320px;
  background: rgba(22, 93, 255, 0.2);
  top: -60px;
  left: -60px;
}

.orb-2 {
  width: 260px;
  height: 260px;
  background: rgba(114, 46, 209, 0.2);
  bottom: -40px;
  right: 8%;
  animation-delay: -5s;
}

@keyframes float {
  0% {
    transform: translateY(0) scale(1);
  }

  100% {
    transform: translateY(24px) scale(1.05);
  }
}

.hero-content {
  position: relative;
  z-index: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.hero-title {
  font-size: clamp(2.25rem, 5.5vw, 3.25rem);
  font-weight: 900;
  margin: 0;
  line-height: 1.2;
  font-family: 'Space Grotesk', 'Outfit', -apple-system, 'PingFang SC', sans-serif;
  letter-spacing: -0.02em;
  color: #fff;
}

.school-badge {
  display: inline-block;
  padding: 6px 20px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--primary-5) 0%, var(--primary-6) 100%);
  color: #fff;
  font-size: clamp(0.85rem, 1.8vw, 1.1rem);
  font-weight: 700;
  letter-spacing: 3px;
  box-shadow: 0 8px 24px rgba(22, 93, 255, 0.3);
}

.hero-subtitle {
  font-size: clamp(0.75rem, 1.2vw, 0.95rem);
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;
  max-width: 560px;
  margin: 0;
}

.hero-actions {
  margin-top: 0.25rem;
}

.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  font-size: clamp(0.8rem, 1vw, 0.95rem);
  font-weight: 600;
  color: #fff;
  background: var(--gradient-primary);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(22, 93, 255, 0.3);
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.primary-btn:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 8px 28px rgba(22, 93, 255, 0.4);
}

/* ---------- Modules 65% - Bento 3×3 ---------- */
.modules-section {
  flex: 1 1 65vh;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(10px, 1.2vw, 18px) clamp(16px, 2vw, 24px);
  overflow: hidden;
  background: var(--bg-body);
}

.bento-grid {
  width: 100%;
  max-width: 1400px;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(10px, 1vw, 16px);
  align-content: stretch;
}

.bento-card {
  position: relative;
  min-height: 0;
  background: var(--bg-surface-1);
  border: 1px solid var(--border-1);
  border-radius: 16px;
  padding: clamp(12px, 1.3vw, 18px) clamp(14px, 1.4vw, 20px);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: box-shadow 0.25s ease, border-color 0.25s ease, transform 0.25s ease;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.bento-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.card-bg {
  position: absolute;
  top: -40%;
  right: -40%;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  filter: blur(40px);
  transition: opacity 0.3s ease;
  opacity: 0;
}

.bento-card:hover .card-bg {
  opacity: 1;
}

.bento-card--static {
  cursor: default;
}

.bento-card--static:hover {
  transform: translateY(-1px);
  border-color: var(--border-1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: clamp(6px, 0.8vw, 10px);
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.icon-box {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: transform 0.25s ease;
}

.bento-card:hover .icon-box {
  transform: scale(1.05);
}

.en-subtitle {
  font-size: clamp(0.65rem, 0.85vw, 0.78rem);
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 600;
}

.card-body {
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.card-body h3 {
  font-size: clamp(0.95rem, 1.2vw, 1.2rem);
  font-weight: 700;
  color: var(--text-1);
  margin: 0 0 4px;
  line-height: 1.35;
  transition: color 0.2s ease;
}

.bento-card:hover .card-body h3 {
  color: var(--primary-6);
}

.card-body p {
  font-size: clamp(0.72rem, 0.9vw, 0.85rem);
  color: var(--text-3);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  margin-top: clamp(6px, 0.8vw, 10px);
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font-size: clamp(0.72rem, 0.88vw, 0.82rem);
  font-weight: 500;
  transition: color 0.2s ease;
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.bento-card:hover .card-footer {
  color: var(--primary-6);
}

.action-icon {
  transition: transform 0.25s ease;
}

.bento-card:hover .action-icon {
  transform: translateX(3px);
}

.bento-card--static .card-footer {
  color: var(--text-4);
}

/* ---------- Footer 5% 极简 ---------- */
.footer {
  flex: 0 0 5vh;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  color: var(--text-4);
  font-size: clamp(0.7rem, 0.9vw, 0.8rem);
  border-top: 1px solid var(--border-1);
  background: var(--bg-surface-1);
}

/* ---------- 响应式：小屏仍保持 3×3，仅缩放 ---------- */
@media (max-width: 900px) {
  .bento-grid {
    gap: 6px;
    padding: 4px;
  }

  .bento-card {
    padding: 10px 12px;
  }

  .card-body p {
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
}

@media (max-width: 600px) {
  .hero-section {
    flex: 0 0 28vh;
  }

  .modules-section {
    flex: 1 1 67vh;
  }

  .bento-grid {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 4px;
  }

  .icon-box {
    width: 32px;
    height: 32px;
  }

  .card-body h3 {
    font-size: 0.8rem;
  }

  .card-body p {
    font-size: 0.65rem;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
}
</style>