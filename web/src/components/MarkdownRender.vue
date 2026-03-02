<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.min.css'

const props = defineProps<{ content: string }>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight(str: string, lang: string) {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
    const label = lang || 'code'
    let highlighted: string
    try { highlighted = hljs.highlight(str, { language }).value }
    catch { highlighted = md.utils.escapeHtml(str) }
    return `<div class="code-block"><div class="code-header"><span class="code-lang">${label}</span><button class="code-copy" onclick="(function(b){var c=b.closest('.code-block').querySelector('code').textContent;navigator.clipboard.writeText(c).then(function(){b.textContent='已复制';setTimeout(function(){b.textContent='复制'},2000)})})(this)">复制</button></div><pre><code class="hljs language-${language}">${highlighted}</code></pre></div>`
  },
})

const html = computed(() => md.render(props.content || ''))
</script>

<template>
  <div class="md" v-html="html" />
</template>

<style scoped>
.md { font-size:15px; line-height:1.75; color:var(--text-1, #e2e8f0); word-wrap:break-word; }
.md :deep(p) { margin:0em 0; }
.md :deep(p:first-child) { margin-top:0; }
.md :deep(p:last-child) { margin-bottom:0; }
.md :deep(h1),.md :deep(h2),.md :deep(h3),.md :deep(h4) { margin:1em 0 0em; font-weight:600; color:var(--text-1, #F5F5F5); line-height:1.3; }
.md :deep(h1) { font-size:1em; padding-bottom:0.3em; border-bottom:1px solid rgba(255,255,255,0); }
.md :deep(h2) { font-size:1.3em; }
.md :deep(h3) { font-size:1.1em; }
.md :deep(.code-block) { margin:0em 0; border-radius:12px; overflow:hidden; background:var(--bg-surface-3); border:1px solid var(--border-1); }
.md :deep(.code-header) { display:flex; align-items:center; justify-content:space-between; padding:6px 12px; background:rgba(255,255,255,0.04); border-bottom:1px solid rgba(255,255,255,0.06); }
.md :deep(.code-lang) { font-size:12px; font-weight:500; color:#7d8590; text-transform:uppercase; }
.md :deep(.code-copy) { font-size:12px; color:#7d8590; background:transparent; border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:2px 10px; cursor:pointer; }
.md :deep(.code-copy:hover) { background:rgba(255,255,255,0); color:#c9d1d9; }
.md :deep(.code-block pre) { margin:0; padding:16px; overflow-x:auto; }
.md :deep(.code-block pre code) { font-family:'JetBrains Mono','Fira Code',monospace; font-size:13px; line-height:1; }
.md :deep(code:not(.hljs)) { background:rgba(22, 93, 255, 0.1); color:var(--primary-light); padding:2px 6px; border-radius:4px; font-size:0.8em; font-family:'JetBrains Mono',monospace; }
.md :deep(blockquote) { margin:0em 0; padding:0em 1em; border-left:3px solid #165DFF; background:rgba(22, 93, 255, 0.04); border-radius:0 8px 8px 0; color:#C9CDD4; }
.md :deep(blockquote p) { margin:0; }
.md :deep(ul),.md :deep(ol) { margin:0em 0; padding-left:1em; }
.md :deep(li) { margin:0em 0; }
.md :deep(table) { width:100%; margin:0em 0; border-collapse:collapse; font-size:14px; border:1px solid rgba(255,255,255,0); border-radius:8px; overflow:hidden; }
.md :deep(thead) { background:rgba(22, 93, 255, 0.1); }
.md :deep(th) { padding:8px 12px; text-align:left; font-weight:600; font-size:13px; }
.md :deep(td) { padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.04); }
.md :deep(tbody tr:hover) { background:rgba(22, 93, 255, 0.03); }
.md :deep(a) { color:#4080FF; text-decoration:none; }
.md :deep(a:hover) { text-decoration:underline; }
.md :deep(hr) { margin:1em 0; border:none; height:1px; background:rgba(255,255,255,0); }
.md :deep(img) { max-width:100%; border-radius:8px; margin:0em 0; }
.md :deep(strong) { font-weight:600; color:var(--text-1); }
</style>
