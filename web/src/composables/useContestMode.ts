import { computed } from 'vue'
import { useRoute } from 'vue-router'

/**
 * 比赛模式：VITE_CONTEST_MODE=true 时，除 /draw 页面外所有生成按钮禁用。
 * 比赛结束后将 .env 中 VITE_CONTEST_MODE 改回 false 即可。
 */
export function useContestMode() {
  const route = useRoute()
  const contestMode = import.meta.env.VITE_CONTEST_MODE === 'true'

  const isContestDisabled = computed(() => {
    return contestMode && route.path !== '/draw'
  })

  return { isContestDisabled }
}
