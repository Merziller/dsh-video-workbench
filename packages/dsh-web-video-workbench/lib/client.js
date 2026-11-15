/**
 * DSH Video Workbench — Cinema-Grade Theme-Adaptive Studio (`dsh-web-video-workbench`)
 * Dual-Track Creation:
 *   Track A: 0-Token Local Draft & IndexTTS-2.5 Voice Practice
 *   Track B: DSH-Synced / 4-Protocol Model-Agnostic LLM Coding + Post-TTS AI Voice Mastering + Remotion / HyperFrames HTML + FFmpeg QA
 * Theme Support: Auto (Sync DSH Host / OS), Cinema Dark (Black-Gold Viewfinder), Editorial Light (Warm Archival Studio)
 * Plain ES Module (React.createElement, no JSX build step required).
 */
window.__ModuleLoader__.load({
  id: 'dsh-web-video-workbench',
  factory: async (resolveModule) => {
    const React = await resolveModule('react')
    const {
      Component,
      createElement: h,
      useCallback,
      useEffect,
      useMemo,
      useRef,
      useState,
    } = React

    const VIDEO_TOOL_NAMES = new Set([
      'import_assets',
      'list_assets',
      'generate_sfx_bgm',
      'plan_video_from_assets',
      'produce_video',
      'generate_speech',
      'list_voices',
      'import_voice_pack',
      'match_scene_voices',
      'get_llm_config',
      'configure_llm_model',
      'ai_master_voice',
      'ai_create_video',
      'ai_refine_scene',
      'export_publish_pack',
      'import_vendor_motion',
      'video_qa',
      'video_lint',
      'video_snapshot',
      'video_render',
    ])

    const STYLE_OPTIONS = [
      { id: 'tech', label: '科技前沿', desc: '深邃几何 · 精密脉冲', swatch: '#38BDF8' },
      { id: 'cinematic', label: '电影大片', desc: '黑金质感 · 史诗运镜', swatch: '#E5A93C' },
      { id: 'documentary', label: '人文纪实', desc: '沉稳叙事 · 克制考究', swatch: '#10B981' },
      { id: 'energetic', label: '高燃快剪', desc: '节拍冲击 · 视觉撞色', swatch: '#F43F5E' },
      { id: 'warm', label: '温暖治愈', desc: '柔光漫射 · 细腻故事', swatch: '#FB923C' },
    ]

    const makeSvgPatternUrl = (svg) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`

    const SKIN_PRESETS = [
      {
        id: 'obsidian-nebula',
        name: '星际舰桥 · 赛博hex',
        badge: '默认作战',
        css: [
          makeSvgPatternUrl('<svg xmlns="http://www.w3.org/2000/svg" width="84" height="72" viewBox="0 0 84 72"><path d="M21 0 L63 0 L84 36 L63 72 L21 72 L0 36 Z" fill="none" stroke="#22D3EE" stroke-opacity="0.065" stroke-width="1"/><circle cx="42" cy="36" r="1.3" fill="#22D3EE" fill-opacity="0.18"/></svg>'),
          'radial-gradient(ellipse 78% 52% at 18% 16%, rgba(34,211,238,0.26), transparent 64%)',
          'radial-gradient(ellipse 68% 58% at 84% 82%, rgba(229,169,60,0.20), transparent 62%)',
          'linear-gradient(155deg, #050811 0%, #0A1120 50%, #04070D 100%)',
        ].join(', '),
        lightCss: [
          makeSvgPatternUrl('<svg xmlns="http://www.w3.org/2000/svg" width="84" height="72" viewBox="0 0 84 72"><path d="M21 0 L63 0 L84 36 L63 72 L21 72 L0 36 Z" fill="none" stroke="#0284C7" stroke-opacity="0.075" stroke-width="1"/><circle cx="42" cy="36" r="1.2" fill="#0284C7" fill-opacity="0.16"/></svg>'),
          'radial-gradient(ellipse 78% 55% at 15% 15%, rgba(14,165,233,0.16), transparent 62%)',
          'radial-gradient(ellipse 75% 60% at 88% 82%, rgba(217,119,6,0.13), transparent 60%)',
          'linear-gradient(155deg, #F1F5FB 0%, #E7EEF8 55%, #F8FAFC 100%)',
        ].join(', '),
      },
      {
        id: 'cyber-matrix',
        name: '量子态势 · 坐标光栅',
        badge: '全息雷达',
        css: [
          makeSvgPatternUrl('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><path d="M96 0 H0 V96" fill="none" stroke="#38BDF8" stroke-opacity="0.07" stroke-width="1"/><path d="M44 48 H52 M48 44 V52" stroke="#22D3EE" stroke-opacity="0.16" stroke-width="1"/></svg>'),
          'radial-gradient(circle at 50% 42%, rgba(34,211,238,0.28), transparent 62%)',
          'radial-gradient(circle at 82% 18%, rgba(59,130,246,0.22), transparent 52%)',
          'linear-gradient(180deg, #040812 0%, #081529 55%, #040914 100%)',
        ].join(', '),
        lightCss: [
          makeSvgPatternUrl('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><path d="M96 0 H0 V96" fill="none" stroke="#0284C7" stroke-opacity="0.08" stroke-width="1"/><path d="M44 48 H52 M48 44 V52" stroke="#0284C7" stroke-opacity="0.18" stroke-width="1"/></svg>'),
          'radial-gradient(circle at 50% 10%, rgba(14,165,233,0.20), transparent 65%)',
          'linear-gradient(180deg, #E8F3FF 0%, #F6FAFF 100%)',
        ].join(', '),
      },
      {
        id: 'anamorphic-gold',
        name: '变形宽银幕 · 黑金胶片',
        badge: '影院首映',
        css: [
          makeSvgPatternUrl('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40"><rect x="6" y="4" width="10" height="6" rx="1.5" fill="#E5A93C" fill-opacity="0.10"/><rect x="104" y="4" width="10" height="6" rx="1.5" fill="#E5A93C" fill-opacity="0.10"/><line x1="0" y1="20" x2="120" y2="20" stroke="#E5A93C" stroke-opacity="0.06" stroke-dasharray="3 6"/></svg>'),
          'radial-gradient(ellipse 120% 22% at 50% 44%, rgba(229,169,60,0.28), transparent 72%)',
          'radial-gradient(circle at 78% 22%, rgba(251,146,60,0.16), transparent 55%)',
          'linear-gradient(160deg, #090806 0%, #16110B 55%, #06070A 100%)',
        ].join(', '),
        lightCss: [
          makeSvgPatternUrl('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40"><line x1="0" y1="20" x2="120" y2="20" stroke="#B7791F" stroke-opacity="0.09" stroke-dasharray="3 6"/></svg>'),
          'radial-gradient(ellipse 110% 20% at 50% 44%, rgba(217,119,6,0.18), transparent 72%)',
          'linear-gradient(160deg, #FCF8F0 0%, #F3EAD8 100%)',
        ].join(', '),
      },
      {
        id: 'aurora-emerald',
        name: '深潜声呐 · 霓虹极光',
        badge: '频谱等高',
        css: [
          makeSvgPatternUrl('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><circle cx="80" cy="80" r="32" fill="none" stroke="#10B981" stroke-opacity="0.06" stroke-width="1"/><circle cx="80" cy="80" r="64" fill="none" stroke="#22D3EE" stroke-opacity="0.05" stroke-width="1" stroke-dasharray="4 6"/></svg>'),
          'radial-gradient(ellipse 75% 50% at 22% 80%, rgba(16,185,129,0.24), transparent 62%)',
          'radial-gradient(ellipse 70% 50% at 85% 20%, rgba(34,211,238,0.24), transparent 62%)',
          'linear-gradient(165deg, #030A0D 0%, #071920 100%)',
        ].join(', '),
        lightCss: [
          makeSvgPatternUrl('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><circle cx="80" cy="80" r="46" fill="none" stroke="#059669" stroke-opacity="0.08" stroke-width="1"/></svg>'),
          'radial-gradient(ellipse 75% 50% at 22% 80%, rgba(16,185,129,0.14), transparent 62%)',
          'linear-gradient(165deg, #ECFDF7 0%, #F4FBFA 100%)',
        ].join(', '),
      },
      {
        id: 'pearl-aerospace',
        name: '高定航天 · 情报白昼',
        badge: '高清拟态',
        css: [
          makeSvgPatternUrl('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="1.2" fill="#94A3B8" fill-opacity="0.20"/><path d="M0 40 H12 M68 40 H80 M40 0 V12 M40 68 V80" stroke="#64748B" stroke-opacity="0.14" stroke-width="1"/></svg>'),
          'radial-gradient(circle at 50% 15%, rgba(148,163,184,0.16), transparent 60%)',
          'linear-gradient(180deg, #0B1018 0%, #121A26 100%)',
        ].join(', '),
        lightCss: [
          makeSvgPatternUrl('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="1.2" fill="#0F172A" fill-opacity="0.12"/><path d="M0 40 H10 M70 40 H80 M40 0 V10 M40 70 V80" stroke="#0284C7" stroke-opacity="0.14" stroke-width="1"/></svg>'),
          'radial-gradient(ellipse 70% 50% at 15% 20%, rgba(56,189,248,0.16), transparent 60%)',
          'radial-gradient(ellipse 60% 45% at 88% 82%, rgba(217,119,6,0.10), transparent 60%)',
          'linear-gradient(165deg, #F6F8FC 0%, #E9EFF7 100%)',
        ].join(', '),
      },
    ]

    const AGENT_TEAM_DEFS = [
      { id: 'director', short: '01 策划导演', icon: 'sparkles', desc: '文案与分镜脚本' },
      { id: 'editor', short: '02 素材剪辑', icon: 'sliders', desc: '构图裁切与调色' },
      { id: 'audio', short: '03 配音混音', icon: 'mic', desc: 'TTS修音 · 闪避 · 数字人' },
      { id: 'motion_qa', short: '04 动效质检', icon: 'film', desc: '动效 · 9宫格 · MP4' },
    ]

    const ASPECT_RATIO_OPTIONS = [
      { id: 'auto', label: 'AI 智能判断', sub: '自动匹配主题与素材', icon: '✨' },
      { id: '16:9', label: '16:9 横屏', sub: 'B站 · YouTube · 官网', icon: '▬' },
      { id: '9:16', label: '9:16 竖屏', sub: '抖音 · 视频号 · 快手', icon: '▮' },
      { id: '3:4', label: '3:4 图文', sub: '小红书封面比例', icon: '▯' },
      { id: '1:1', label: '1:1 方屏', sub: '朋友圈 · 信息流', icon: '■' },
    ]

    const QUALITY_OPTIONS = [
      { id: '720p', label: '720P 草稿', desc: '极速预览' },
      { id: '1080p', label: '1080P 高清', desc: '成片推荐' },
      { id: '2k', label: '2K 超清', desc: '2560/1440' },
      { id: '4k', label: '4K 影院', desc: '极致细节' },
      { id: 'custom', label: '自定义', desc: '手填像素' },
    ]

    const TOPIC_PRESETS = [
      {
        label: '产品发布会短片',
        topic: '用苹果/大厂发布会节奏打造视觉短片：犀利指出传统痛点，以三维动态UI与滚动数字指标引爆核心卖点，高燃收尾号召体验。',
      },
      {
        label: '知识深度科普',
        topic: '三幕式电影科普叙事：抛出颠覆直觉的问题、结合导入素材与动态图解逐层剖析原理、给出一针见血的总结金句。',
      },
      {
        label: '旅拍 / 影像混剪',
        topic: '围绕导入的高清影像片段与照片，配以电影级调色暗角、节拍鼓点切镜与温暖深情独白，讲述一段打动人心的旅程。',
      },
    ]

    const MOTION_OPTIONS = [
      { value: 'zoom-in', label: '推进 (Zoom In)' },
      { value: 'zoom-out', label: '拉远 (Zoom Out)' },
      { value: 'pan-left', label: '左摇 (Pan Left)' },
      { value: 'pan-right', label: '右摇 (Pan Right)' },
    ]

    const TRANSITION_OPTIONS = [
      { value: 'iris-circle', label: '光圈虹膜 (Iris)' },
      { value: 'block-wipe', label: '方块擦除 (Block Wipe)' },
      { value: 'glitch-cut', label: '数字故障切 (Glitch)' },
      { value: 'zoom-punch', label: '冲刺缩放 (Zoom Punch)' },
      { value: 'light-wipe', label: '高光掠过 (Light Wipe)' },
    ]

    const CREATION_MODE_OPTIONS = [
      { id: 'ai-coded', title: '🤖 AI 自由写码模式', desc: '大模型直写高清 React/HTML 动效与物理转场代码' },
      { id: 'schema-plan', title: '📐 Schema 结构化模式', desc: 'promo-plan/1 高保真配方编排 · 四档自动降级稳交付' },
    ]

    const BGM_MODE_OPTIONS = [
      { id: 'llm-coded', icon: '🤖', title: 'AI 写配乐代码', desc: '大模型编写 JS DSP 代码合成 48kHz 原创立体声 WAV' },
      { id: 'uploaded', icon: '🎵', title: '自由上传本地 BGM', desc: '上传个人 mp3/wav/flac 配乐，自动避让人声并混音' },
      { id: 'tts-engine', icon: '🗣', title: 'IndexTTS-2.5 音色合成', desc: '用音色库或克隆声线合成空灵人声和弦氛围垫底' },
    ]

    const PLATFORM_OPTIONS = [
      { id: 'universal', label: '通用成片', desc: '无边框遮挡 · 16:9 / 通用展示' },
      { id: 'douyin', label: '抖音竖屏', desc: '避开底部18%文案栏与右侧9%赞评栏' },
      { id: 'kuaishou', label: '快手竖屏', desc: '避开底部16%互动条与右侧图标区' },
      { id: 'xiaohongshu', label: '小红书', desc: '3:4 / 9:16 图文底栏与右上角避让' },
      { id: 'bilibili', label: 'B站横屏', desc: '顶部弹幕安全区与右上推荐卡片避让' },
    ]

    const QUICK_FIX_PILLS = [
      { label: '🛡 字幕上移进安全区', prompt: '请把所有分镜字幕位置上移入平台安全区内，避免被抖音/快手底部栏或B站控件遮挡，并加大高对比描边。' },
      { label: '🔊 配乐降 3dB 突出人声', prompt: '保持口播人声响度不变，把背景音乐压低约 3dB，强化人声开口时的自动闪避 Ducking。' },
      { label: '⚡ 加快镜头与转场节奏', prompt: '把全片转场和关键字卡入场节奏提快 15%，消除画面停顿拖沓感。' },
      { label: '✨ 强化标题动效与高光', prompt: '加强主标题与关键数字卡片的弹簧进场动画与高光扫过粒子质感。' },
      { label: '🎬 切换黑金电影级调色', prompt: '调整当前画面的暗角、对比度与标题边框为黑金胶片质感。' },
    ]

    const DARK_THEME = {
      mode: 'dark',
      bgApp: '#07090E',
      bgSidebar: 'rgba(13, 17, 26, 0.80)',
      bgPanel: 'rgba(13, 17, 26, 0.76)',
      bgElevated: 'rgba(22, 28, 42, 0.72)',
      bgInput: 'rgba(7, 9, 14, 0.82)',
      borderSubtle: 'rgba(255, 255, 255, 0.09)',
      borderStrong: 'rgba(34, 211, 238, 0.28)',
      textPrimary: '#F3F4F8',
      textSecondary: '#A8B1C6',
      textMuted: '#727E99',
      accentGold: '#E5A93C',
      accentGoldBg: 'rgba(229, 169, 60, 0.14)',
      accentGoldBorder: 'rgba(229, 169, 60, 0.44)',
      accentBlue: '#22D3EE',
      accentBlueBg: 'rgba(34, 211, 238, 0.13)',
      accentBlueBorder: 'rgba(34, 211, 238, 0.42)',
      accentGreen: '#22C55E',
      accentGreenBg: 'rgba(34, 197, 94, 0.14)',
      accentRed: '#F43F5E',
      accentRedBg: 'rgba(244, 63, 94, 0.14)',
      monitorShell: '#040508',
      shadowCard: '0 18px 46px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      scrollThumb: 'rgba(255, 255, 255, 0.16)',
    }

    const LIGHT_THEME = {
      mode: 'light',
      bgApp: '#F3F4F8',
      bgSidebar: 'rgba(245, 246, 250, 0.84)',
      bgPanel: 'rgba(255, 255, 255, 0.84)',
      bgElevated: 'rgba(246, 247, 251, 0.82)',
      bgInput: 'rgba(241, 243, 249, 0.88)',
      borderSubtle: 'rgba(15, 23, 42, 0.09)',
      borderStrong: 'rgba(14, 165, 233, 0.28)',
      textPrimary: '#0F172A',
      textSecondary: '#475569',
      textMuted: '#64748B',
      accentGold: '#B7791F',
      accentGoldBg: 'rgba(183, 121, 31, 0.12)',
      accentGoldBorder: 'rgba(183, 121, 31, 0.36)',
      accentBlue: '#0284C7',
      accentBlueBg: 'rgba(2, 132, 199, 0.1)',
      accentBlueBorder: 'rgba(2, 132, 199, 0.34)',
      accentGreen: '#16A34A',
      accentGreenBg: 'rgba(22, 163, 74, 0.1)',
      accentRed: '#E11D48',
      accentRedBg: 'rgba(225, 29, 72, 0.1)',
      monitorShell: '#07090E', // Cinema monitors stay reference-black for true color accuracy
      shadowCard: '0 14px 36px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.65)',
      scrollThumb: 'rgba(15, 23, 42, 0.16)',
    }

    function detectHostDarkMode() {
      try {
        const html = document.documentElement
        const body = document.body
        const attrTheme = (
          html.getAttribute('data-theme') ||
          html.getAttribute('data-color-mode') ||
          body?.getAttribute('data-theme') ||
          ''
        ).toLowerCase()
        if (attrTheme.includes('light')) return false
        if (attrTheme.includes('dark')) return true
        if (html.classList.contains('light') || body?.classList.contains('light')) return false
        if (html.classList.contains('dark') || body?.classList.contains('dark')) return true

        // Probe computed background luminance if host sets CSS body bg directly
        const bgStr = body ? getComputedStyle(body).backgroundColor : ''
        const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bgStr || '')
        if (m && (m[4] === undefined || Number(m[4]) > 0.2)) {
          const lum = (Number(m[1]) * 0.299 + Number(m[2]) * 0.587 + Number(m[3]) * 0.114) / 255
          if (lum > 0.62) return false
          if (lum < 0.38) return true
        }
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches !== false
      } catch {
        return true
      }
    }

    function Icon({ name, size = 15, color = 'currentColor' }) {
      const base = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { flexShrink: 0, display: 'inline-block' },
      }
      switch (name) {
        case 'film':
          return h(
            'svg',
            base,
            h('rect', { x: 2, y: 3, width: 20, height: 18, rx: 2.5 }),
            h('line', { x1: 7, y1: 3, x2: 7, y2: 21 }),
            h('line', { x1: 17, y1: 3, x2: 17, y2: 21 }),
            h('line', { x1: 2, y1: 9, x2: 7, y2: 9 }),
            h('line', { x1: 2, y1: 15, x2: 7, y2: 15 }),
            h('line', { x1: 17, y1: 9, x2: 22, y2: 9 }),
            h('line', { x1: 17, y1: 15, x2: 22, y2: 15 }),
          )
        case 'plus':
          return h('svg', base, h('line', { x1: 12, y1: 5, x2: 12, y2: 19 }), h('line', { x1: 5, y1: 12, x2: 19, y2: 12 }))
        case 'trash':
          return h(
            'svg',
            base,
            h('polyline', { points: '3 6 5 6 21 6' }),
            h('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
            h('path', { d: 'M10 11v6M14 11v6' }),
          )
        case 'upload':
          return h(
            'svg',
            base,
            h('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
            h('polyline', { points: '17 8 12 3 7 8' }),
            h('line', { x1: 12, y1: 3, x2: 12, y2: 15 }),
          )
        case 'folder':
          return h(
            'svg',
            base,
            h('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }),
          )
        case 'play':
          return h('svg', { ...base, fill: color, stroke: 'none' }, h('polygon', { points: '6 4 20 12 6 20 6 4' }))
        case 'pause':
          return h(
            'svg',
            { ...base, fill: color, stroke: 'none' },
            h('rect', { x: 6, y: 4, width: 4, height: 16, rx: 1 }),
            h('rect', { x: 14, y: 4, width: 4, height: 16, rx: 1 }),
          )
        case 'mic':
          return h(
            'svg',
            base,
            h('path', { d: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z' }),
            h('path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }),
            h('line', { x1: 12, y1: 19, x2: 12, y2: 22 }),
          )
        case 'sparkles':
          return h(
            'svg',
            base,
            h('path', { d: 'M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z' }),
          )
        case 'download':
          return h(
            'svg',
            base,
            h('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
            h('polyline', { points: '7 10 12 15 17 10' }),
            h('line', { x1: 12, y1: 15, x2: 12, y2: 3 }),
          )
        case 'camera':
          return h(
            'svg',
            base,
            h('path', { d: 'M23 7l-7 5 7 5V7z' }),
            h('rect', { x: 1, y: 5, width: 15, height: 14, rx: 2, ry: 2 }),
          )
        case 'avatar':
          return h(
            'svg',
            base,
            h('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }),
            h('circle', { cx: 12, cy: 7, r: 4 }),
          )
        case 'activity':
          return h('svg', base, h('polyline', { points: '22 12 18 12 15 21 9 3 6 12 2 12' }))
        case 'palette':
          return h(
            'svg',
            base,
            h('circle', { cx: 13.5, cy: 6.5, r: 0.9 }),
            h('circle', { cx: 17.5, cy: 10.5, r: 0.9 }),
            h('circle', { cx: 8.5, cy: 7.5, r: 0.9 }),
            h('circle', { cx: 6.5, cy: 12.5, r: 0.9 }),
            h('path', { d: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.31-.44-.73-.44-1.18a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.49 5.56-5.56C22 6.01 17.52 2 12 2z' }),
          )
        case 'zap':
          return h('svg', { ...base, fill: color, stroke: 'none' }, h('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }))
        case 'stop':
          return h('svg', { ...base, fill: color, stroke: 'none' }, h('rect', { x: 5, y: 5, width: 14, height: 14, rx: 2 }))
        case 'refresh':
          return h(
            'svg',
            base,
            h('polyline', { points: '23 4 23 10 17 10' }),
            h('path', { d: 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10' }),
          )
        case 'check':
          return h('svg', base, h('polyline', { points: '20 6 9 17 4 12' }))
        case 'x':
          return h('svg', base, h('line', { x1: 18, y1: 6, x2: 6, y2: 18 }), h('line', { x1: 6, y1: 6, x2: 18, y2: 18 }))
        case 'sliders':
          return h(
            'svg',
            base,
            h('line', { x1: 4, y1: 21, x2: 4, y2: 14 }),
            h('line', { x1: 4, y1: 10, x2: 4, y2: 3 }),
            h('line', { x1: 12, y1: 21, x2: 12, y2: 12 }),
            h('line', { x1: 12, y1: 8, x2: 12, y2: 3 }),
            h('line', { x1: 20, y1: 21, x2: 20, y2: 16 }),
            h('line', { x1: 20, y1: 12, x2: 20, y2: 3 }),
          )
        case 'code':
          return h('svg', base, h('polyline', { points: '16 18 22 12 16 6' }), h('polyline', { points: '8 6 2 12 8 18' }))
        case 'undo':
          return h('svg', base, h('polyline', { points: '9 14 4 9 9 4' }), h('path', { d: 'M20 20v-7a4 4 0 0 0-4-4H4' }))
        case 'sun':
          return h(
            'svg',
            base,
            h('circle', { cx: 12, cy: 12, r: 4 }),
            h('path', { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41' }),
          )
        case 'moon':
          return h('svg', base, h('path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }))
        case 'shield':
          return h('svg', base, h('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }), h('polyline', { points: '9 12 11 14 15 10' }))
        case 'cpu':
          return h(
            'svg',
            base,
            h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }),
            h('rect', { x: 9, y: 9, width: 6, height: 6 }),
            h('line', { x1: 9, y1: 1, x2: 9, y2: 4 }),
            h('line', { x1: 15, y1: 1, x2: 15, y2: 4 }),
            h('line', { x1: 9, y1: 20, x2: 9, y2: 23 }),
            h('line', { x1: 15, y1: 20, x2: 15, y2: 23 }),
          )
        default:
          return null
      }
    }

    class PanelBoundary extends Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      render() {
        if (this.state.error) {
          return h(
            'div',
            {
              style: {
                padding: '24px',
                margin: '24px',
                borderRadius: '12px',
                background: '#161A24',
                border: '1px solid rgba(244, 63, 94, 0.45)',
                color: '#FECDD3',
                fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
              },
            },
            h('strong', null, '视频工作台渲染异常'),
            h('pre', { style: { marginTop: '8px', fontSize: '12px', whiteSpace: 'pre-wrap' } }, String(this.state.error?.message || this.state.error)),
          )
        }
        return this.props.children
      }
    }

    function useConnectionFetch(ctx) {
      return useMemo(() => {
        const bound = ctx?.connection?.fetch?.bind?.(ctx.connection)
        return bound || window.fetch.bind(window)
      }, [ctx])
    }

    function VideoToolCallCard({ item }) {
      if (!item || !VIDEO_TOOL_NAMES.has(item.toolName)) return null
      const out = item.result || item.output || {}
      return h(
        'div',
        {
          style: {
            margin: '6px 0',
            padding: '10px 14px',
            borderRadius: '10px',
            background: '#121621',
            border: '1px solid rgba(229, 169, 60, 0.25)',
            color: '#F3F4F8',
            fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
            fontSize: '12px',
          },
        },
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('span', { style: { fontWeight: 700, color: '#E5A93C' } }, item.toolName),
          h('span', { style: { color: '#9CA3B5', fontSize: '11px' } }, item.status || '已完成'),
        ),
        out.durationSec || out.script?.totalDurationSec
          ? h('div', { style: { color: '#38BDF8', marginTop: '4px' } }, `帧精准时长 ${out.durationSec || out.script?.totalDurationSec}s`)
          : null,
        out.outputPath || out.render?.outputPath
          ? h('div', { style: { color: '#22C55E', marginTop: '4px' } }, `成片路径: ${out.outputPath || out.render?.outputPath}`)
          : null,
      )
    }

    function SidebarVideoIcon() {
      return h(
        'span',
        {
          title: '电影级视频创作工坊',
          style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px' },
        },
        h(Icon, { name: 'film', size: 16 }),
      )
    }

    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const str = String(reader.result || '')
          const idx = str.indexOf(',')
          resolve(idx >= 0 ? str.slice(idx + 1) : str)
        }
        reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
        reader.readAsDataURL(file)
      })
    }

    function fmtTimecode(frame, fps = 30) {
      const f = Math.max(0, Math.floor(frame))
      const sec = f / Math.max(1, fps)
      const mm = String(Math.floor(sec / 60)).padStart(2, '0')
      const ss = String(Math.floor(sec % 60)).padStart(2, '0')
      const ff = String(f % Math.max(1, fps)).padStart(2, '0')
      return `${mm}:${ss}:${ff}`
    }

    // -------------------------------------------------------------------------
    // AI AGENT WAR ROOM LIVE CANVAS BACKDROP, DSP SPECTRUM & 5-AGENT CONSTELLATION
    // -------------------------------------------------------------------------
    function WarRoomCanvasBackdrop({ active, dark }) {
      const canvasRef = useRef(null)
      const activeRef = useRef(active)
      const darkRef = useRef(dark)
      activeRef.current = Boolean(active)
      darkRef.current = Boolean(dark)

      useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return undefined
        const ctx2d = canvas.getContext('2d')
        if (!ctx2d) return undefined

        let raf = 0
        let w = 0
        let hPx = 0
        const resize = () => {
          const rect = canvas.parentElement?.getBoundingClientRect()
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          w = Math.max(640, Math.floor(rect?.width || window.innerWidth))
          hPx = Math.max(420, Math.floor(rect?.height || window.innerHeight))
          canvas.width = Math.floor(w * dpr)
          canvas.height = Math.floor(hPx * dpr)
          ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
        resize()
        window.addEventListener('resize', resize)

        const nodes = Array.from({ length: 42 }, (_, idx) => ({
          x: Math.random() * (w || 1440),
          y: Math.random() * (hPx || 900),
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          r: (idx % 4 === 0 ? 2.4 : 1.35) + Math.random() * 0.9,
          tone: idx % 3 === 0 ? 'gold' : 'cyan',
        }))

        let lastTs = 0
        let phase = 0
        const tick = (ts) => {
          raf = requestAnimationFrame(tick)
          if (ts - lastTs < 28) return // smooth ~35fps cap for low CPU footprint
          const dt = Math.min(60, lastTs ? ts - lastTs : 28) / 16.6
          lastTs = ts
          const isAct = activeRef.current
          const isDk = darkRef.current
          const speed = isAct ? 1.85 : 0.72
          phase += 0.015 * speed

          ctx2d.clearRect(0, 0, w, hPx)

          // Moving subtle tactical horizon sweep beam
          const sweepY = ((phase * 48) % (hPx + 160)) - 80
          const grad = ctx2d.createLinearGradient(0, sweepY - 50, 0, sweepY + 50)
          const beamAlpha = isDk ? (isAct ? 0.09 : 0.035) : (isAct ? 0.07 : 0.025)
          grad.addColorStop(0, 'rgba(34,211,238,0)')
          grad.addColorStop(0.5, isDk ? `rgba(34,211,238,${beamAlpha})` : `rgba(2,132,199,${beamAlpha})`)
          grad.addColorStop(1, 'rgba(34,211,238,0)')
          ctx2d.fillStyle = grad
          ctx2d.fillRect(0, sweepY - 50, w, 100)

          // Update & draw constellation particles
          for (let i = 0; i < nodes.length; i += 1) {
            const p = nodes[i]
            p.x += p.vx * speed * dt
            p.y += p.vy * speed * dt
            if (p.x < -10) p.x = w + 10
            else if (p.x > w + 10) p.x = -10
            if (p.y < -10) p.y = hPx + 10
            else if (p.y > hPx + 10) p.y = -10

            for (let j = i + 1; j < nodes.length; j += 1) {
              const q = nodes[j]
              const dx = p.x - q.x
              const dy = p.y - q.y
              const distSq = dx * dx + dy * dy
              if (distSq < 21500) {
                const alpha = (1 - Math.sqrt(distSq) / 147) * (isDk ? (isAct ? 0.22 : 0.11) : (isAct ? 0.16 : 0.08))
                ctx2d.strokeStyle = isDk ? `rgba(34,211,238,${alpha.toFixed(3)})` : `rgba(2,132,199,${alpha.toFixed(3)})`
                ctx2d.lineWidth = isAct ? 1.1 : 0.8
                ctx2d.beginPath()
                ctx2d.moveTo(p.x, p.y)
                ctx2d.lineTo(q.x, q.y)
                ctx2d.stroke()
              }
            }

            const dotAlpha = isDk ? (isAct ? 0.72 : 0.42) : (isAct ? 0.52 : 0.28)
            ctx2d.fillStyle =
              p.tone === 'gold'
                ? isDk
                  ? `rgba(229,169,60,${dotAlpha})`
                  : `rgba(183,121,31,${dotAlpha})`
                : isDk
                  ? `rgba(34,211,238,${dotAlpha})`
                  : `rgba(2,132,199,${dotAlpha})`
            ctx2d.beginPath()
            ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2)
            ctx2d.fill()
          }
        }
        raf = requestAnimationFrame(tick)
        return () => {
          cancelAnimationFrame(raf)
          window.removeEventListener('resize', resize)
        }
      }, [])

      return h('canvas', {
        ref: canvasRef,
        'aria-hidden': 'true',
        style: {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          pointerEvents: 'none',
        },
      })
    }

    function AudioWaveformCanvas({ active, isPlaying, dark }) {
      const canvasRef = useRef(null)
      const stateRef = useRef({ active: false, isPlaying: false, dark: true })
      stateRef.current = { active: Boolean(active), isPlaying: Boolean(isPlaying), dark: Boolean(dark) }

      useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return undefined
        const ctx2d = canvas.getContext('2d')
        if (!ctx2d) return undefined

        let raf = 0
        let t = 0
        let lastTs = 0
        const bars = 34
        const draw = (ts) => {
          raf = requestAnimationFrame(draw)
          if (ts - lastTs < 36) return
          lastTs = ts
          const { active: isAct, isPlaying: isPlay, dark: isDk } = stateRef.current
          t += isAct || isPlay ? 0.16 : 0.045

          const cw = canvas.clientWidth || 250
          const ch = canvas.clientHeight || 44
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          if (canvas.width !== Math.floor(cw * dpr)) {
            canvas.width = Math.floor(cw * dpr)
            canvas.height = Math.floor(ch * dpr)
          }
          ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx2d.clearRect(0, 0, cw, ch)

          const gap = 3
          const bw = Math.max(2, (cw - (bars - 1) * gap) / bars)
          for (let i = 0; i < bars; i += 1) {
            const norm = i / bars
            const envelope = Math.sin(norm * Math.PI)
            const amp = isAct || isPlay
              ? 0.25 + 0.72 * Math.abs(Math.sin(t * 1.4 + i * 0.48) * Math.cos(t * 0.7 - i * 0.23)) * envelope
              : 0.12 + 0.16 * Math.abs(Math.sin(t + i * 0.35)) * envelope
            const bh = Math.max(3, amp * (ch - 6))
            const x = i * (bw + gap)
            const y = ch - bh
            const isGold = i > bars * 0.65
            ctx2d.fillStyle = isGold
              ? isDk
                ? '#E5A93C'
                : '#B7791F'
              : isDk
                ? '#22D3EE'
                : '#0284C7'
            ctx2d.globalAlpha = isAct || isPlay ? 0.88 : 0.45
            ctx2d.fillRect(x, y, bw, bh)
          }
          ctx2d.globalAlpha = 1
        }
        raf = requestAnimationFrame(draw)
        return () => cancelAnimationFrame(raf)
      }, [])

      return h('canvas', {
        ref: canvasRef,
        style: { width: '100%', height: '42px', display: 'block', borderRadius: '6px' },
      })
    }

    function WarRoomConstellationStage({
      agents,
      activeRun,
      hasMp4,
      previewHtmlUrl,
      avatarEnabled,
      dark,
      T,
      onJumpStep,
      onSwitchToMonitor,
    }) {
      // Derive 5 visual War Room nodes backed by real TaskManager agent statuses + Avatar readiness
      const agentById = {}
      ;(agents || []).forEach((a) => {
        agentById[a.id] = a
      })
      const audioSt = agentById.audio || {}
      const avatarNodeState = avatarEnabled
        ? {
            status:
              audioSt.status === 'running' && (String(audioSt.message || '').includes('数字人') || (audioSt.progress || 0) >= 60)
                ? 'running'
                : audioSt.status === 'completed'
                  ? 'completed'
                  : audioSt.status === 'failed' || audioSt.status === 'stopped'
                    ? audioSt.status
                    : 'idle',
            progress: audioSt.status === 'completed' ? 100 : audioSt.status === 'running' ? Math.max(15, Number(audioSt.progress || 0)) : 0,
            message: audioSt.status === 'running' ? 'Alpha WebM 合成通道待命' : '数字人口播叠层已开启',
          }
        : { status: 'standby', progress: 0, message: '按需开启 · MuseTalk/AI' }

      const nodes = [
        {
          id: 'director',
          code: '01',
          title: '策划导演 Agent',
          sub: '文案 · 分镜 · BGM代码',
          xPct: 18,
          yPct: 26,
          step: 2,
          data: agentById.director || { status: 'idle', progress: 0, message: '指令待命中' },
        },
        {
          id: 'editor',
          code: '02',
          title: '素材精修 Agent',
          sub: '智能裁切 · 调色 · 抠图',
          xPct: 50,
          yPct: 13,
          step: 1,
          data: agentById.editor || { status: 'idle', progress: 0, message: '等待调度素材' },
        },
        {
          id: 'audio',
          code: '03',
          title: '配音混音 Agent',
          sub: 'IndexTTS-2.5 · 闪避混音',
          xPct: 82,
          yPct: 26,
          step: 2,
          data: agentById.audio || { status: 'idle', progress: 0, message: '声学通道待命' },
        },
        {
          id: 'avatar',
          code: '04',
          title: '数字人口播 Agent',
          sub: '克隆真人口型 · Alpha WebM',
          xPct: 20,
          yPct: 84,
          step: 2,
          data: avatarNodeState,
        },
        {
          id: 'motion_qa',
          code: '05',
          title: '动效质检 Render',
          sub: '代码动效 · 9宫格 · MP4',
          xPct: 80,
          yPct: 84,
          step: 3,
          data: agentById.motion_qa || { status: 'idle', progress: 0, message: 'Chromium 渲染待命' },
        },
      ]

      const isPipelineRunning = activeRun?.status === 'running'
      const isPipelineDone = activeRun?.status === 'completed'
      const runProgress = Math.round(Number(activeRun?.progress || 0))
      const edgeLinks = [
        { from: 0, to: 1, id: 'e01', bend: -4 },
        { from: 1, to: 2, id: 'e12', bend: -4 },
        { from: 2, to: 3, id: 'e23', bend: 0 },
        { from: 3, to: 4, id: 'e34', bend: 5 },
        { from: 2, to: 4, id: 'e24', bend: 4 },
        { from: 0, to: 3, id: 'e03', bend: -4 },
      ]

      const statusVisual = (st) => {
        if (st === 'running') return { color: T.accentBlue, bg: T.accentBlueBg, border: T.accentBlue, text: '作战中' }
        if (st === 'completed') return { color: T.accentGreen, bg: T.accentGreenBg, border: T.accentGreen, text: '已就绪' }
        if (st === 'paused') return { color: T.accentGold, bg: T.accentGoldBg, border: T.accentGold, text: '已暂停' }
        if (st === 'failed' || st === 'stopped') return { color: T.accentRed, bg: T.accentRedBg, border: T.accentRed, text: st === 'stopped' ? '已中止' : '异常' }
        if (st === 'standby') return { color: T.textMuted, bg: T.bgElevated, border: T.borderSubtle, text: '待命' }
        return { color: T.accentGold, bg: T.bgElevated, border: T.borderStrong, text: '待发' }
      }

      return h(
        'div',
        {
          style: {
            position: 'relative',
            width: '100%',
            flex: 1,
            minHeight: '410px',
            borderRadius: '14px',
            overflow: 'hidden',
            background: dark
              ? 'radial-gradient(circle at 50% 50%, rgba(16, 36, 58, 0.56), rgba(5, 8, 16, 0.88) 72%)'
              : 'radial-gradient(circle at 50% 50%, rgba(224, 242, 254, 0.65), rgba(248, 250, 252, 0.92) 72%)',
            border: `1px solid ${T.borderStrong}`,
            boxShadow: dark ? 'inset 0 0 60px rgba(34,211,238,0.08)' : 'inset 0 0 40px rgba(2,132,199,0.06)',
          },
        },
        // Corner Precision Reticles
        h('div', { className: 'dsh-vw-reticle dsh-vw-reticle-tl', style: { borderColor: T.accentBlue } }),
        h('div', { className: 'dsh-vw-reticle dsh-vw-reticle-tr', style: { borderColor: T.accentBlue } }),
        h('div', { className: 'dsh-vw-reticle dsh-vw-reticle-bl', style: { borderColor: T.accentGold } }),
        h('div', { className: 'dsh-vw-reticle dsh-vw-reticle-br', style: { borderColor: T.accentGold } }),

        // True Aspect-Locked Spinning Orbital Radar Dial
        h(
          'svg',
          {
            viewBox: '-210 -210 420 420',
            preserveAspectRatio: 'xMidYMid meet',
            style: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' },
          },
          h(
            'defs',
            null,
            h(
              'linearGradient',
              { id: 'dshRadarSweep', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
              h('stop', { offset: '0%', stopColor: T.accentBlue, stopOpacity: isPipelineRunning ? '0.32' : '0.16' }),
              h('stop', { offset: '100%', stopColor: T.accentBlue, stopOpacity: '0' }),
            ),
          ),
          h('circle', { r: 178, fill: 'none', stroke: T.accentBlue, strokeOpacity: dark ? 0.14 : 0.16, strokeWidth: 1, strokeDasharray: '4 8' }),
          h('circle', { r: 134, className: 'dsh-vw-orbit-cw', fill: 'none', stroke: T.accentGold, strokeOpacity: dark ? 0.24 : 0.22, strokeWidth: 1.2, strokeDasharray: '18 10 3 10' }),
          h('circle', { r: 94, className: 'dsh-vw-orbit-ccw', fill: 'none', stroke: T.accentBlue, strokeOpacity: dark ? 0.34 : 0.28, strokeWidth: 1.4, strokeDasharray: '28 8 6 8' }),
          h(
            'g',
            { className: 'dsh-vw-radar-spin', style: { animationDuration: isPipelineRunning ? '3.4s' : '9s' } },
            h('path', { d: 'M 0 0 L 165 -55 A 174 174 0 0 1 165 55 Z', fill: 'url(#dshRadarSweep)' }),
            h('line', { x1: 0, y1: 0, x2: 174, y2: 0, stroke: T.accentBlue, strokeOpacity: isPipelineRunning ? 0.65 : 0.25, strokeWidth: 1.4 }),
          ),
        ),

        // 100%-Aligned Normalized Coordinate SVG Energy Conduits & Animated Data Packets
        h(
          'svg',
          {
            viewBox: '0 0 100 100',
            preserveAspectRatio: 'none',
            style: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' },
          },
          nodes.map((n) =>
            h('line', {
              key: `spoke-${n.id}`,
              x1: 50,
              y1: 50,
              x2: n.xPct,
              y2: n.yPct,
              vectorEffect: 'non-scaling-stroke',
              stroke: n.data.status === 'running' ? T.accentBlue : n.data.status === 'completed' ? T.accentGreen : T.accentBlue,
              strokeOpacity: n.data.status === 'running' ? 0.6 : n.data.status === 'completed' ? 0.45 : 0.16,
              strokeWidth: n.data.status === 'running' ? 2 : 1,
              strokeDasharray: n.data.status === 'running' ? '6 4' : '2 5',
              className: n.data.status === 'running' ? 'dsh-vw-hud-flow' : '',
            }),
          ),
          edgeLinks.map((lk) => {
            const a = nodes[lk.from]
            const b = nodes[lk.to]
            const isHot =
              a.data.status === 'running' ||
              b.data.status === 'running' ||
              (a.data.status === 'completed' && b.data.status === 'completed')
            const mx = (a.xPct + b.xPct) / 2
            const my = (a.yPct + b.yPct) / 2 + lk.bend
            const pathD = `M ${a.xPct} ${a.yPct} Q ${mx} ${my} ${b.xPct} ${b.yPct}`
            return h(
              React.Fragment,
              { key: lk.id },
              h('path', {
                d: pathD,
                fill: 'none',
                vectorEffect: 'non-scaling-stroke',
                stroke: isHot ? T.accentBlue : T.textMuted,
                strokeOpacity: isHot ? 0.58 : 0.2,
                strokeWidth: isHot ? 2 : 1.1,
                strokeDasharray: isPipelineRunning ? '6 4' : '4 5',
                className: isPipelineRunning && isHot ? 'dsh-vw-hud-flow' : '',
              }),
              isPipelineRunning || a.data.status === 'running' || b.data.status === 'running'
                ? h(
                    'circle',
                    { r: 0.9, fill: T.accentGold, opacity: 0.95 },
                    h('animateMotion', { dur: '2.0s', repeatCount: 'indefinite', path: pathD }),
                  )
                : null,
            )
          }),
        ),

        // Central Command Core Reactor Sphere
        h(
          'div',
          {
            style: {
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '154px',
              height: '154px',
              borderRadius: '50%',
              background: dark ? 'rgba(7, 11, 20, 0.88)' : 'rgba(255, 255, 255, 0.92)',
              border: `1.5px solid ${isPipelineRunning ? T.accentBlue : isPipelineDone ? T.accentGreen : T.accentGoldBorder}`,
              boxShadow: isPipelineRunning
                ? '0 0 36px rgba(34,211,238,0.34), inset 0 0 22px rgba(34,211,238,0.16)'
                : isPipelineDone
                  ? '0 0 30px rgba(34,197,94,0.28)'
                  : '0 0 28px rgba(229,169,60,0.16)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '10px',
              zIndex: 3,
              backdropFilter: 'blur(12px)',
            },
          },
          h(
            'div',
            { style: { fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', color: T.accentBlue, textTransform: 'uppercase' } },
            isPipelineRunning ? 'SWARM ACTIVE' : isPipelineDone ? 'MISSION DONE' : 'SWARM READY',
          ),
          h(
            'div',
            {
              style: {
                fontSize: '24px',
                fontWeight: 900,
                fontFamily: 'Consolas, monospace',
                lineHeight: 1.15,
                margin: '3px 0',
                color: isPipelineRunning ? T.accentBlue : isPipelineDone ? T.accentGreen : T.textPrimary,
              },
            },
            activeRun ? `${runProgress}%` : '5 AGENTS',
          ),
          h(
            'div',
            { style: { fontSize: '10px', color: T.textSecondary, lineHeight: 1.32, maxWidth: '126px' } },
            isPipelineRunning
              ? '多智能体全速协同中'
              : isPipelineDone
                ? '视频已合成就绪'
                : '右侧输入创意一键出片',
          ),
          hasMp4 || previewHtmlUrl
            ? h(
                'button',
                {
                  className: 'dsh-vw-btn',
                  onClick: onSwitchToMonitor,
                  style: {
                    marginTop: '6px',
                    padding: '4px 9px',
                    borderRadius: '999px',
                    border: `1px solid ${hasMp4 ? T.accentGreen : T.accentBlueBorder}`,
                    background: hasMp4 ? T.accentGreenBg : T.accentBlueBg,
                    color: hasMp4 ? T.accentGreen : T.accentBlue,
                    fontSize: '10px',
                    fontWeight: 800,
                  },
                },
                hasMp4 ? '▶ 播放 MP4' : '▶ 看监看台',
              )
            : null,
        ),

        // 5 Clickable FUI Agent Nodes
        nodes.map((node) => {
          const sv = statusVisual(node.data.status)
          const isAct = node.data.status === 'running'
          return h(
            'button',
            {
              key: node.id,
              className: `dsh-vw-btn dsh-vw-hud-node ${isAct ? 'is-running' : ''}`,
              onClick: () => onJumpStep(node.step),
              title: `点击进入人工精修: ${node.title}`,
              style: {
                position: 'absolute',
                left: `${node.xPct}%`,
                top: `${node.yPct}%`,
                transform: 'translate(-50%, -50%)',
                width: '154px',
                padding: '7px 9px',
                textAlign: 'left',
                borderRadius: '10px',
                background: dark ? 'rgba(9, 14, 24, 0.88)' : 'rgba(255, 255, 255, 0.90)',
                border: `1px solid ${sv.border}`,
                boxShadow: isAct
                  ? `0 0 22px ${T.accentBlueBg}`
                  : '0 10px 24px rgba(0, 0, 0, 0.22)',
                backdropFilter: 'blur(14px)',
                zIndex: 4,
              },
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } },
              h(
                'span',
                { style: { fontSize: '10px', fontFamily: 'Consolas, monospace', fontWeight: 800, color: sv.color } },
                `NODE ${node.code}`,
              ),
              h(
                'span',
                {
                  style: {
                    fontSize: '9.5px',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    background: sv.bg,
                    color: sv.color,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  },
                },
                isAct
                  ? h('span', { className: 'dsh-vw-rec-dot', style: { width: '5px', height: '5px', borderRadius: '50%', background: sv.color } })
                  : null,
                sv.text,
              ),
            ),
            h(
              'div',
              { style: { fontSize: '12.5px', fontWeight: 800, color: T.textPrimary, marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
              node.title,
            ),
            h(
              'div',
              { style: { fontSize: '10px', color: T.textMuted, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
              node.data.message || node.sub,
            ),
            h(
              'div',
              { style: { marginTop: '6px', height: '3px', borderRadius: '99px', background: 'rgba(128,128,128,0.2)', overflow: 'hidden' } },
              h('div', {
                style: {
                  width: `${node.data.status === 'completed' ? 100 : Math.max(isAct ? 14 : 0, Math.round(Number(node.data.progress || 0)))}%`,
                  height: '100%',
                  background: sv.color,
                  transition: 'width 0.3s ease',
                },
              }),
            ),
          )
        }),
      )
    }

    function VideoWorkbenchApp({ ctx, isMainSlot }) {
      const connFetch = useConnectionFetch(ctx)

      // Host slot integration
      const [mode, setMode] = useState('video')
      const [mainSlotActive, setMainSlotActive] = useState(false)

      // 3-Mode Adaptive Theme ('auto' | 'dark' | 'light')
      const [themePref, setThemePref] = useState(() => {
        try {
          return localStorage.getItem('dsh_vw_theme') || 'auto'
        } catch {
          return 'auto'
        }
      })
      const [hostIsDark, setHostIsDark] = useState(() => detectHostDarkMode())
      useEffect(() => {
        const update = () => setHostIsDark(detectHostDarkMode())
        const obs = new MutationObserver(update)
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-color-mode', 'class', 'style'] })
        if (document.body) obs.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
        const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
        mq?.addEventListener?.('change', update)
        return () => {
          obs.disconnect()
          mq?.removeEventListener?.('change', update)
        }
      }, [])

      const selectThemePref = (next) => {
        setThemePref(next)
        try {
          localStorage.setItem('dsh_vw_theme', next)
        } catch {}
      }

      const resolvedDark = themePref === 'auto' ? hostIsDark : themePref === 'dark'
      const T = resolvedDark ? DARK_THEME : LIGHT_THEME

      // Workspace & Active Project State
      const [projects, setProjects] = useState([])
      const [activeProjectDir, setActiveProjectDir] = useState('')
      const [script, setScript] = useState(null)
      const [projectAssets, setProjectAssets] = useState([])
      const [assetSummary, setAssetSummary] = useState({ image: 0, video: 0, music: 0, sfx: 0, notes: 0 })
      const [hasMp4, setHasMp4] = useState(false)
      const [hasSnapshot, setHasSnapshot] = useState(false)
      const [hasMasterAudio, setHasMasterAudio] = useState(false)
      const [qaReport, setQaReport] = useState(null)
      const [buildLog, setBuildLog] = useState(null)
      const [historyCount, setHistoryCount] = useState(0)

      // Voices & TTS
      const [voiceCatalog, setVoiceCatalog] = useState([])
      const [availableEmotions, setAvailableEmotions] = useState(['平静', '高兴', '激动', '深沉', '温暖'])
      const [ttsStatus, setTtsStatus] = useState({ reachable: false, ready: false })

      // Model-Agnostic LLM Config (Default: follow-dsh; Supports all 4 wire protocols)
      const [llmConfig, setLlmConfig] = useState(null)
      const [showLlmModal, setShowLlmModal] = useState(false)
      const [llmForm, setLlmForm] = useState({
        mode: 'follow-dsh',
        dshProviderId: 'active',
        provider: 'custom',
        format: 'auto',
        baseUrl: '',
        apiKey: '',
        model: '',
        maxRepairRounds: 3,
      })
      const [llmTestResult, setLlmTestResult] = useState(null)
      const [llmTesting, setLlmTesting] = useState(false)

      // Navigation & UI Modals
      const [activeStep, setActiveStep] = useState(0) // 0 = AI Agent 作战大屏, 1..4 = 分步精修, 5 = 完整任务日志
      const [warCenterTab, setWarCenterTab] = useState('map') // 'map' | 'monitor'
      const [showProjectDrawer, setShowProjectDrawer] = useState(false)
      const [selectedSceneIdx, setSelectedSceneIdx] = useState(0)
      const [assetFilter, setAssetFilter] = useState('all')
      const [isDragging, setIsDragging] = useState(false)
      const [assetDirInput, setAssetDirInput] = useState('')
      const [showNewModal, setShowNewModal] = useState(false)
      const [newProjectTitle, setNewProjectTitle] = useState('')
      const [confirmDeleteDir, setConfirmDeleteDir] = useState('')
      const [showVoiceModal, setShowVoiceModal] = useState(false)
      const [voiceModalTarget, setVoiceModalTarget] = useState('global')
      const [voiceSearch, setVoiceSearch] = useState('')
      const [voiceGenderFilter, setVoiceGenderFilter] = useState('all')
      const [voiceImportPath, setVoiceImportPath] = useState('')
      const [voiceImportName, setVoiceImportName] = useState('')
      const [voiceImportGender, setVoiceImportGender] = useState('female')
      const [showCodeDrawer, setShowCodeDrawer] = useState(false)
      const [codeFiles, setCodeFiles] = useState([])
      const [selectedCodePath, setSelectedCodePath] = useState('')
      const [showSafeGuides, setShowSafeGuides] = useState(false)
      const [showMatrixPreview, setShowMatrixPreview] = useState(false)
      const [voiceTab, setVoiceTab] = useState('library') // 'library' | 'clone'
      const [cloneSubMode, setCloneSubMode] = useState('mic') // 'mic' | 'file' | 'path'
      const [micRecording, setMicRecording] = useState(false)
      const [micSeconds, setMicSeconds] = useState(0)
      const [recordedB64, setRecordedB64] = useState('')
      const [recordedFileName, setRecordedFileName] = useState('')
      const [cloneVoiceName, setCloneVoiceName] = useState('')
      const [cloneVoiceGender, setCloneVoiceGender] = useState('female')
      const [cloneVoicePrompt, setCloneVoicePrompt] = useState('')
      const [cloneAuditionText, setCloneAuditionText] = useState('你好，这是用 IndexTTS-2.5 声音克隆实验室刚刚生成的效果试听，音色自然饱满。')
      const [cloneAuditionVoiceId, setCloneAuditionVoiceId] = useState('')
      const [cloneAuditionUrl, setCloneAuditionUrl] = useState('')
      const [safeZonePreflight, setSafeZonePreflight] = useState(null)
      const [showVendorModal, setShowVendorModal] = useState(false)
      const [vendorSourceDir, setVendorSourceDir] = useState('')
      const [vendorName, setVendorName] = useState('')
      const [vendorDurationSec, setVendorDurationSec] = useState(4)
      const [publishPackResult, setPublishPackResult] = useState(null)
      const [bgmComposePreviewUrl, setBgmComposePreviewUrl] = useState('')

      // Director Studio Form (Step 2)
      const [directorForm, setDirectorForm] = useState({
        topic: '',
        style: 'cinematic',
        engine: 'remotion',
        creationMode: 'ai-coded',
        bgmMode: 'llm-coded',
        bgmTtsPrompt: '科技光影律动 温暖深沉氛围铺底',
        targetPlatform: 'universal',
        aspectRatio: 'auto',
        quality: '1080p',
        customWidth: 1080,
        customHeight: 1920,
        aiBadge: true,
        useDraftReference: true,
        fps: 30,
        voiceId: 'auto',
      })

      // Step 3 AI Natural Language Refine & Script State
      const [refinePrompt, setRefinePrompt] = useState('')
      const [refineScope, setRefineScope] = useState('scene') // 'scene' | 'global'
      const [scriptDirty, setScriptDirty] = useState(false)

      // Async Job Progress & Notifications
      const [busyLabel, setBusyLabel] = useState('')
      const [busyProgress, setBusyProgress] = useState(0)
      const [toast, setToast] = useState(null)
      const [assetVersion, setAssetVersion] = useState(1)

      // Playback State
      const [currentFrame, setCurrentFrame] = useState(0)
      const [isPlaying, setIsPlaying] = useState(false)
      const [playingVoiceId, setPlayingVoiceId] = useState('')

      const initialLoadedRef = useRef(false)
      const iframeRef = useRef(null)
      const stageAudioRef = useRef(null)
      const previewAudioRef = useRef(null)
      const fileInputRef = useRef(null)
      const folderInputRef = useRef(null)
      const bgmInputRef = useRef(null)
      const cloneFileInputRef = useRef(null)
      const mediaRecorderRef = useRef(null)
      const micTimerRef = useRef(null)
      const micChunksRef = useRef([])

      // Command Deck v5 States: Skin, Teleprompter Camera, Avatar, Task Center & Pipeline
      const [skinConfig, setSkinConfig] = useState(() => {
        try {
          const raw = localStorage.getItem('dsh-vw-skin-v5')
          if (raw) return { id: 'obsidian-nebula', customUrl: '', blurPx: 14, opacity: 0.78, ...JSON.parse(raw) }
        } catch {}
        return { id: 'obsidian-nebula', customUrl: '', blurPx: 14, opacity: 0.78 }
      })
      const [showSkinModal, setShowSkinModal] = useState(false)
      const [showTeleprompter, setShowTeleprompter] = useState(false)
      const [teleLinesText, setTeleLinesText] = useState(
        '欢迎来到 AI Agent 作战大屏。\n只需在第一步导入你的素材、背景音乐，或直接打开提词板现场口播，\n四位智能体就会协同完成分镜、剪辑、修音、数字人与 1080p 高清成片导出。',
      )
      const [teleScrollSpeed, setTeleScrollSpeed] = useState(1.1)
      const [teleFontSize, setTeleFontSize] = useState(26)
      const [teleLineHeight, setTeleLineHeight] = useState(1.65)
      const [teleBgOpacity, setTeleBgOpacity] = useState(0.62)
      const [teleMirror, setTeleMirror] = useState(false)
      const [teleAutoScroll, setTeleAutoScroll] = useState(false)
      const [camStreaming, setCamStreaming] = useState(false)
      const [camError, setCamError] = useState('')
      const [camRecording, setCamRecording] = useState(false)
      const [camSeconds, setCamSeconds] = useState(0)
      const [camTargetRole, setCamTargetRole] = useState('host_video')
      const [camExtractClone, setCamExtractClone] = useState(true)
      const [taskRuns, setTaskRuns] = useState([])
      const [selectedRunId, setSelectedRunId] = useState('')
      const [taskFilter, setTaskFilter] = useState('all')
      const [avatarTemplates, setAvatarTemplates] = useState([])
      const [avatarProvider, setAvatarProvider] = useState({ provider: 'auto', endpoint: '' })
      const [avatarCfg, setAvatarCfg] = useState({
        enabled: false,
        mode: 'ai-human',
        layout: 'pip-br',
        presetId: 'cyber-anchor',
        sourcePath: '',
        voiceSamplePath: '',
        chromaKeyColor: '',
      })
      const [speechTempo, setSpeechTempo] = useState(1.0)
      const [useHostVocal, setUseHostVocal] = useState(false)
      const [aiAuthorCode, setAiAuthorCode] = useState(true)
      const [trimClipSec, setTrimClipSec] = useState(0)
      const [clipSpeedMult, setClipSpeedMult] = useState(1.0)
      const [assetImportRole, setAssetImportRole] = useState('')
      const camVideoRef = useRef(null)
      const camStreamRef = useRef(null)
      const camRecorderRef = useRef(null)
      const camTimerRef = useRef(null)
      const camChunksRef = useRef([])
      const teleBoxRef = useRef(null)
      const teleRafRef = useRef(0)
      const skinFileInputRef = useRef(null)
      const avatarBaseInputRef = useRef(null)
      const voiceCloneInputRef = useRef(null)
      const pendingUploadRoleRef = useRef('')

      useEffect(() => {
        try {
          localStorage.setItem('dsh-vw-skin-v5', JSON.stringify(skinConfig))
        } catch {}
      }, [skinConfig])

      const notify = useCallback((message, type = 'info') => {
        setToast({ message, type, id: Date.now() })
      }, [])

      useEffect(() => {
        if (!toast || toast.type === 'error') return
        const id = setTimeout(() => setToast(null), 6000)
        return () => clearTimeout(id)
      }, [toast])

      // Inject dynamic theme-aware CSS + FUI War Room motion keyframes
      const themeCss = useMemo(
        () => `
        .dsh-vw-root { color-scheme: ${resolvedDark ? 'dark' : 'light'}; }
        .dsh-vw-root * { box-sizing: border-box; }
        .dsh-vw-root select, .dsh-vw-root input, .dsh-vw-root textarea { color-scheme: ${resolvedDark ? 'dark' : 'light'}; }
        .dsh-vw-root select option {
          background-color: ${resolvedDark ? '#0B101B' : '#FFFFFF'};
          color: ${resolvedDark ? '#F3F4F8' : '#0F172A'};
        }
        .dsh-vw-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .dsh-vw-scroll::-webkit-scrollbar-track { background: transparent; }
        .dsh-vw-scroll::-webkit-scrollbar-thumb { background: ${T.scrollThumb}; border-radius: 99px; }
        .dsh-vw-btn { transition: background-color 0.14s ease, border-color 0.14s ease, box-shadow 0.16s ease, opacity 0.14s ease, transform 0.1s ease; cursor: pointer; }
        .dsh-vw-btn:hover:not(:disabled) { filter: brightness(1.08); }
        .dsh-vw-btn:active:not(:disabled) { transform: scale(0.985); }
        .dsh-vw-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .dsh-vw-glass { backdrop-filter: blur(18px) saturate(135%); -webkit-backdrop-filter: blur(18px) saturate(135%); }
        .dsh-vw-hud-node { transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease, transform 0.16s ease; }
        .dsh-vw-hud-node:hover:not(:disabled) { transform: translate(-50%, -52%); }
        .dsh-vw-hud-node.is-running {
          border-color: rgba(34, 211, 238, 0.85) !important;
          box-shadow: 0 0 24px rgba(34, 211, 238, 0.34), inset 0 0 12px rgba(34, 211, 238, 0.12) !important;
        }
        .dsh-vw-fui-card {
          position: relative;
          border-radius: 14px;
          backdrop-filter: blur(20px) saturate(140%);
          -webkit-backdrop-filter: blur(20px) saturate(140%);
        }
        .dsh-vw-reticle {
          position: absolute;
          width: 14px;
          height: 14px;
          pointer-events: none;
          z-index: 5;
          opacity: 0.78;
        }
        .dsh-vw-reticle-tl { top: 8px; left: 8px; border-top: 2px solid; border-left: 2px solid; }
        .dsh-vw-reticle-tr { top: 8px; right: 8px; border-top: 2px solid; border-right: 2px solid; }
        .dsh-vw-reticle-bl { bottom: 8px; left: 8px; border-bottom: 2px solid; border-left: 2px solid; }
        .dsh-vw-reticle-br { bottom: 8px; right: 8px; border-bottom: 2px solid; border-right: 2px solid; }
        .dsh-vw-reactor-btn {
          position: relative;
          overflow: hidden;
        }
        .dsh-vw-reactor-btn::after {
          content: '';
          position: absolute;
          top: -20%;
          left: -60%;
          width: 45%;
          height: 140%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.42), transparent);
          transform: skewX(-24deg);
          animation: dshReactorSweep 3.2s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes dshHudDash { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
        @keyframes dshRecPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.28; } }
        @keyframes dshOrbitCw { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes dshOrbitCcw { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes dshReactorSweep { 0% { left: -65%; } 55%, 100% { left: 135%; } }
        .dsh-vw-hud-flow { stroke-dasharray: 5 5; animation: dshHudDash 1.1s linear infinite; }
        .dsh-vw-rec-dot { animation: dshRecPulse 1s ease-in-out infinite; }
        .dsh-vw-orbit-cw { animation: dshOrbitCw 38s linear infinite; transform-origin: 0px 0px; }
        .dsh-vw-orbit-ccw { animation: dshOrbitCcw 26s linear infinite; transform-origin: 0px 0px; }
        .dsh-vw-radar-spin { animation: dshOrbitCw 7s linear infinite; transform-origin: 0px 0px; }
      `,
        [T.scrollThumb, resolvedDark],
      )

      useEffect(() => {
        let el = document.getElementById('dsh-vw-theme-styles')
        if (!el) {
          el = document.createElement('style')
          el.id = 'dsh-vw-theme-styles'
          document.head.appendChild(el)
        }
        el.textContent = themeCss
      }, [themeCss])

      useEffect(() => {
        if (isMainSlot) {
          window.dispatchEvent(new CustomEvent('dsh-video:main-mounted', { detail: { mounted: true } }))
          return () => window.dispatchEvent(new CustomEvent('dsh-video:main-mounted', { detail: { mounted: false } }))
        }
        const onMain = (ev) => setMainSlotActive(Boolean(ev.detail?.mounted))
        window.addEventListener('dsh-video:main-mounted', onMain)
        return () => window.removeEventListener('dsh-video:main-mounted', onMain)
      }, [isMainSlot])

      useEffect(() => {
        const onKey = (ev) => {
          if (ev.key === 'Escape') {
            setShowNewModal(false)
            setShowVoiceModal(false)
            setShowLlmModal(false)
            setShowCodeDrawer(false)
            setConfirmDeleteDir('')
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])

      const syncLlmFormFromSummary = (cfg) => {
        if (!cfg) return
        setLlmConfig(cfg)
        setLlmForm({
          mode: cfg.mode === 'custom' ? 'custom' : 'follow-dsh',
          dshProviderId: cfg.dshProviderId || 'active',
          provider: cfg.provider || 'custom',
          format: cfg.format || 'auto',
          baseUrl: cfg.baseUrl || '',
          apiKey: cfg.mode === 'custom' && cfg.hasApiKey ? 'KEEP_EXISTING' : '',
          model: cfg.model || '',
          maxRepairRounds: Number(cfg.maxRepairRounds) || 3,
        })
      }

      const refreshState = useCallback(
        async (targetDir = activeProjectDir, opts = {}) => {
          try {
            const q = targetDir ? `?projectDir=${encodeURIComponent(targetDir)}` : ''
            const res = await connFetch(`/api/video-workbench/state${q}`)
            const data = await res.json()
            if (!data.ok) {
              notify(data.error || '加载工作区失败', 'error')
              return null
            }
            setProjects(data.projects || [])
            setVoiceCatalog(data.voiceCatalog || [])
            if (Array.isArray(data.availableEmotions) && data.availableEmotions.length > 0) {
              setAvailableEmotions(data.availableEmotions)
            }
            setTtsStatus(data.ttsStatus || { reachable: false, ready: false })
            if (data.llmConfig) syncLlmFormFromSummary(data.llmConfig)
            if (Array.isArray(data.avatarTemplates)) setAvatarTemplates(data.avatarTemplates)
            if (data.avatarProvider) setAvatarProvider(data.avatarProvider)
            if (Array.isArray(data.taskRuns)) {
              setTaskRuns(data.taskRuns)
              const firstId = data.taskRuns[0]?.id || data.taskRuns[0]?.runId
              if (firstId) {
                setSelectedRunId((prev) => prev || firstId)
              }
            }

            if (data.activeProject) {
              const ap = data.activeProject
              setActiveProjectDir(ap.projectDir)
              setScript(ap.script)
              setProjectAssets(ap.assets || [])
              setAssetSummary(ap.assetSummary || { image: 0, video: 0, music: 0, sfx: 0, notes: 0, hostVideo: 0, avatarBase: 0, voiceClone: 0 })
              setHasMp4(Boolean(ap.hasMp4))
              setHasSnapshot(Boolean(ap.hasSnapshot))
              setHasMasterAudio(Boolean(ap.hasMasterAudio))
              setQaReport(ap.qaReport || null)
              setBuildLog(ap.buildLog || null)
              setHistoryCount(Number(ap.historyCount) || 0)
              setScriptDirty(false)

              if (ap.script?.avatarClip) {
                setAvatarCfg((prev) => ({
                  ...prev,
                  enabled: true,
                  mode: ap.script.avatarClip.mode || prev.mode,
                  layout: ap.script.avatarLayout || ap.script.avatarClip.layout || prev.layout,
                  presetId: ap.script.avatarClip.presetId || prev.presetId,
                  sourcePath: ap.script.avatarClip.sourceVideoPath || ap.script.avatarClip.sourceImagePath || prev.sourcePath,
                }))
              }

              setDirectorForm((prev) => ({
                ...prev,
                topic: ap.script?.topic || prev.topic || '',
                style: ap.script?.style || prev.style || 'cinematic',
                engine: ap.script?.engine || prev.engine || 'remotion',
                creationMode: ap.script?.creationMode || prev.creationMode || 'ai-coded',
                bgmMode: ap.script?.bgmMode || ap.script?.audioSpec?.bgmMode || prev.bgmMode || 'llm-coded',
                targetPlatform: ap.script?.targetPlatform || prev.targetPlatform || 'universal',
                aspectRatio: ap.script?.requestedAspectRatio || ap.script?.aspectRatio || prev.aspectRatio || 'auto',
                quality: ap.script?.quality || prev.quality || '1080p',
                customWidth: Number(ap.script?.width) || prev.customWidth || 1080,
                customHeight: Number(ap.script?.height) || prev.customHeight || 1920,
                aiBadge: ap.script?.aiBadge !== undefined ? Boolean(ap.script.aiBadge) : true,
                fps: Number(ap.script?.fps) || prev.fps || 30,
                voiceId: ap.script?.defaultVoiceId || prev.voiceId || 'auto',
              }))

              if (!initialLoadedRef.current || opts.autoStep) {
                initialLoadedRef.current = true
                if (typeof opts.preferredStep === 'number') setActiveStep(opts.preferredStep)
                else setActiveStep(0) // 默认进入「AI Agent 团队数字信息作战大屏」
              }
            }
            return data
          } catch (err) {
            notify(`连接后端服务失败: ${err.message}`, 'error')
            return null
          }
        },
        [connFetch, activeProjectDir, notify],
      )

      useEffect(() => {
        refreshState('')
      }, [])

      useEffect(() => {
        if (!activeProjectDir) return
        let cancelled = false
        const plat = directorForm.targetPlatform || script?.targetPlatform || 'universal'
        connFetch(`/api/video-workbench/safe-zone?projectDir=${encodeURIComponent(activeProjectDir)}&platform=${encodeURIComponent(plat)}`)
          .then((r) => r.json())
          .then((d) => {
            if (!cancelled && d.ok) setSafeZonePreflight(d.preflight)
          })
          .catch(() => {})
        return () => {
          cancelled = true
        }
      }, [activeProjectDir, directorForm.targetPlatform, script?.width, script?.height, script?.targetPlatform, assetVersion, connFetch])

      useEffect(() => {
        const handler = (ev) => {
          if (ev.detail?.mode) setMode(ev.detail.mode)
        }
        window.addEventListener('dsh-video:switch-mode', handler)
        return () => window.removeEventListener('dsh-video:switch-mode', handler)
      }, [])

      const switchWorkbenchMode = (nextMode) => {
        setMode(nextMode)
        window.dispatchEvent(new CustomEvent('dsh-video:switch-mode', { detail: { mode: nextMode } }))
        if (nextMode === 'video') refreshState(activeProjectDir)
      }

      // Async Job Poller
      const pollBackgroundJob = useCallback(
        async (jobId) => {
          while (true) {
            await new Promise((r) => setTimeout(r, 750))
            const res = await connFetch(`/api/video-workbench/jobs?id=${encodeURIComponent(jobId)}`)
            const payload = await res.json()
            if (!payload.ok || !payload.job) throw new Error(payload.error || '任务查询失败')
            const job = payload.job
            if (job.message) setBusyLabel(job.message)
            if (Number.isFinite(Number(job.progress))) setBusyProgress(Number(job.progress))
            if (job.status === 'done') return job.result || {}
            if (job.status === 'error') throw new Error(job.error || '后台任务执行失败')
          }
        },
        [connFetch],
      )

      // Monitor Seek & Playback Sync
      const seekToFrame = useCallback(
        (frame, syncAudio = true) => {
          const fps = Number(script?.fps) || 30
          const total = Math.max(1, Number(script?.totalDurationInFrames) || 300)
          const clamped = Math.max(0, Math.min(total - 1, Math.floor(frame)))
          setCurrentFrame(clamped)
          if (syncAudio && stageAudioRef.current) {
            try {
              const targetSec = clamped / fps
              if (Math.abs((stageAudioRef.current.currentTime || 0) - targetSec) > 0.1) {
                stageAudioRef.current.currentTime = targetSec
              }
            } catch {}
          }
          const win = iframeRef.current?.contentWindow
          if (win) {
            try {
              if (typeof win.__seekToFrame === 'function') win.__seekToFrame(clamped)
              else win.postMessage({ type: 'dsh-seek', frame: clamped }, '*')
            } catch {
              win.postMessage({ type: 'dsh-seek', frame: clamped }, '*')
            }
          }
        },
        [script],
      )

      useEffect(() => {
        if (!isPlaying || activeStep !== 3) {
          try {
            stageAudioRef.current?.pause()
          } catch {}
          return
        }
        const fps = Number(script?.fps) || 30
        const total = Math.max(1, Number(script?.totalDurationInFrames) || 300)
        if (hasMasterAudio && stageAudioRef.current) {
          try {
            stageAudioRef.current.currentTime = Math.min((total - 1) / fps, currentFrame / fps)
            stageAudioRef.current.play().catch(() => {})
          } catch {}
        }
        let rafId = 0
        let lastTime = performance.now()
        let acc = currentFrame
        const tick = (now) => {
          const dt = (now - lastTime) / 1000
          lastTime = now
          if (hasMasterAudio && stageAudioRef.current && !stageAudioRef.current.paused) {
            acc = stageAudioRef.current.currentTime * fps
          } else {
            acc += dt * fps
          }
          if (acc >= total - 1) {
            seekToFrame(0, true)
            setIsPlaying(false)
            return
          }
          seekToFrame(acc, false)
          rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafId)
      }, [isPlaying, activeStep, script, hasMasterAudio, seekToFrame])

      const scenes = useMemo(() => script?.scenes || [], [script])
      useEffect(() => {
        if (scenes.length === 0) setSelectedSceneIdx(0)
        else if (selectedSceneIdx >= scenes.length) setSelectedSceneIdx(scenes.length - 1)
      }, [scenes, selectedSceneIdx])

      const activePlayingSceneIdx = useMemo(() => {
        const idx = scenes.findIndex((s) => {
          const sf = Number(s.startFrame || 0)
          const ef = sf + Math.max(1, Number(s.durationInFrames) || 90)
          return currentFrame >= sf && currentFrame < ef
        })
        return idx >= 0 ? idx : 0
      }, [scenes, currentFrame])

      const selectedScene = scenes[selectedSceneIdx] || null

      const filteredAssets = useMemo(() => {
        if (assetFilter === 'all') return projectAssets
        if (assetFilter === 'audio') return projectAssets.filter((a) => a.type === 'audio')
        if (assetFilter === 'music') return projectAssets.filter((a) => a.role === 'music')
        if (assetFilter === 'special') {
          return projectAssets.filter((a) => ['host_video', 'avatar_base', 'voice_clone'].includes(a.role))
        }
        return projectAssets.filter((a) => a.type === assetFilter)
      }, [projectAssets, assetFilter])

      const filteredVoices = useMemo(() => {
        const q = voiceSearch.trim().toLowerCase()
        return voiceCatalog.filter((v) => {
          if (voiceGenderFilter !== 'all' && v.gender !== voiceGenderFilter) return false
          if (!q) return true
          return (
            v.name?.toLowerCase().includes(q) ||
            v.id?.toLowerCase().includes(q) ||
            v.tags?.some((t) => t.toLowerCase().includes(q)) ||
            v.description?.toLowerCase().includes(q)
          )
        })
      }, [voiceCatalog, voiceSearch, voiceGenderFilter])

      // Handlers: Projects
      const handleSelectProject = async (dir) => {
        setIsPlaying(false)
        setPublishPackResult(null)
        setBgmComposePreviewUrl('')
        setShowProjectDrawer(false)
        setActiveProjectDir(dir)
        await refreshState(dir, { autoStep: activeStep === 0 })
      }

      const handleCreateProject = async () => {
        const title = newProjectTitle.trim() || `电影工坊工程 ${projects.length + 1}`
        setBusyLabel('正在初始化双引擎工程目录...')
        try {
          const res = await connFetch('/api/video-workbench/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              engine: directorForm.engine,
              style: directorForm.style,
              aspectRatio: directorForm.aspectRatio,
              quality: directorForm.quality,
              width: directorForm.quality === 'custom' || directorForm.aspectRatio === 'custom' ? directorForm.customWidth : undefined,
              height: directorForm.quality === 'custom' || directorForm.aspectRatio === 'custom' ? directorForm.customHeight : undefined,
              aiBadge: directorForm.aiBadge,
              targetPlatform: directorForm.targetPlatform,
              bgmMode: directorForm.bgmMode,
              creationMode: directorForm.creationMode,
              defaultVoiceId: directorForm.voiceId,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`创建项目失败: ${data.error}`, 'error')
            return
          }
          setShowNewModal(false)
          setNewProjectTitle('')
          await refreshState(data.projectDir, { autoStep: true, preferredStep: 1 })
          notify(`已创建工程「${title}」，请先导入媒体素材`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleDeleteProject = async (dir) => {
        setBusyLabel('正在清理项目目录...')
        try {
          const res = await connFetch('/api/video-workbench/projects/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: dir }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`删除失败: ${data.error}`, 'error')
            return
          }
          setConfirmDeleteDir('')
          await refreshState('', { autoStep: true })
          notify('已移除项目', 'success')
        } finally {
          setBusyLabel('')
        }
      }

      // Handlers: Assets
      const handleImportByPath = async () => {
        if (!activeProjectDir || !assetDirInput.trim()) {
          notify('请输入本地图片/视频/音频文件或文件夹路径', 'error')
          return
        }
        setBusyLabel('正在扫描素材并通过 ffprobe 测算分辨率与时长...')
        try {
          const res = await connFetch('/api/video-workbench/assets/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              sources: assetDirInput.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean),
              role: assetImportRole || undefined,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`导入失败: ${data.error}`, 'error')
            return
          }
          setAssetDirInput('')
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify(`已导入 ${data.importedCount || 0} 份素材`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleUploadFiles = async (fileList, forcedRole = '') => {
        if (!activeProjectDir || !fileList || fileList.length === 0) return
        const chosenRole = forcedRole || pendingUploadRoleRef.current || ''
        pendingUploadRoleRef.current = ''
        setBusyLabel(`正在上传 ${fileList.length} 个媒体文件...`)
        try {
          const filesPayload = []
          for (const f of Array.from(fileList)) {
            const b64 = await readFileAsBase64(f)
            filesPayload.push({ name: f.webkitRelativePath || f.name, dataBase64: b64 })
          }
          const res = await connFetch('/api/video-workbench/assets/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              files: filesPayload,
              role: chosenRole || undefined,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`上传失败: ${data.error}`, 'error')
            return
          }
          const firstAdded = data.added?.[0]
          if (chosenRole === 'avatar_base' && firstAdded?.path) {
            setAvatarCfg((prev) => ({ ...prev, enabled: true, mode: 'cloned-human', sourcePath: firstAdded.path }))
          } else if (chosenRole === 'voice_clone' && firstAdded?.path) {
            setAvatarCfg((prev) => ({ ...prev, enabled: true, voiceSamplePath: firstAdded.path }))
          } else if (chosenRole === 'music' && firstAdded?.path) {
            setDirectorForm((prev) => ({ ...prev, bgmMode: 'uploaded' }))
          }
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify(`成功导入 ${data.uploadedCount || filesPayload.length} 个素材`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleDeleteAsset = async (assetId) => {
        const res = await connFetch('/api/video-workbench/assets/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectDir: activeProjectDir, assetId }),
        })
        const data = await res.json()
        if (data.ok) await refreshState(activeProjectDir)
      }

      // Handlers: LLM Settings
      const handleProviderTemplateChange = (providerId) => {
        const tpl = llmConfig?.templates?.find((t) => t.id === providerId)
        setLlmForm((prev) => ({
          ...prev,
          mode: 'custom',
          provider: providerId,
          format: tpl?.defaultFormat || 'auto',
          baseUrl: tpl?.defaultBaseUrl !== undefined && (prev.baseUrl === '' || prev.provider !== providerId) ? tpl.defaultBaseUrl : prev.baseUrl,
          model: prev.provider !== providerId && tpl?.suggestedModels?.[0] ? tpl.suggestedModels[0] : prev.model,
        }))
        setLlmTestResult(null)
      }

      const handleSelectDshProvider = (provId) => {
        if (provId === 'active') {
          const defProv = llmConfig?.dshClient?.providers?.find((p) => p.id === llmConfig?.dshClient?.defaultProviderId)
          setLlmForm((prev) => ({
            ...prev,
            mode: 'follow-dsh',
            dshProviderId: 'active',
            format: 'auto',
            model: '',
            baseUrl: defProv?.baseURL || '',
          }))
        } else {
          const picked = llmConfig?.dshClient?.providers?.find((p) => p.id === provId)
          setLlmForm((prev) => ({
            ...prev,
            mode: 'follow-dsh',
            dshProviderId: provId,
            format: picked?.api || 'auto',
            baseUrl: picked?.baseURL || '',
            model: picked?.models?.[0]?.id || '',
          }))
        }
        setLlmTestResult(null)
      }

      const handleSaveLlmConfig = async () => {
        setBusyLabel('正在保存大模型配置...')
        try {
          const res = await connFetch('/api/video-workbench/llm-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(llmForm),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`保存失败: ${data.error}`, 'error')
            return
          }
          syncLlmFormFromSummary(data.config)
          setShowLlmModal(false)
          notify('大模型接口配置已保存（密钥仅存本地，绝不上链）', 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleTestLlm = async () => {
        setLlmTesting(true)
        setLlmTestResult(null)
        try {
          const res = await connFetch('/api/video-workbench/llm-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(llmForm),
          })
          const data = await res.json()
          if (!data.ok) {
            setLlmTestResult({ ok: false, error: data.error })
            return
          }
          setLlmTestResult(data)
        } catch (err) {
          setLlmTestResult({ ok: false, error: err.message })
        } finally {
          setLlmTesting(false)
        }
      }

      // Handlers: Dual-Track Creation (Draft vs AI Coding Studio)
      const handlePlanLocalDraft = async (andRender = false) => {
        if (!activeProjectDir) return
        setBusyProgress(8)
        setBusyLabel(andRender ? '正在生成本地演练草稿 + 真人配音 + MP4...' : '正在免费规划本地演练草稿...')
        try {
          const endpoint = andRender ? '/api/video-workbench/produce' : '/api/video-workbench/plan'
          const payload = {
            ...(andRender ? { async: true } : {}),
            projectDir: activeProjectDir,
            sources: assetDirInput.trim() || undefined,
            topic: directorForm.topic.trim() || script?.title || '',
            style: directorForm.style,
            engine: directorForm.engine,
            aspectRatio: directorForm.aspectRatio,
            quality: directorForm.quality,
            width: directorForm.quality === 'custom' || directorForm.aspectRatio === 'custom' ? Number(directorForm.customWidth) : undefined,
            height: directorForm.quality === 'custom' || directorForm.aspectRatio === 'custom' ? Number(directorForm.customHeight) : undefined,
            aiBadge: directorForm.aiBadge,
            targetPlatform: directorForm.targetPlatform,
            bgmMode: directorForm.bgmMode,
            creationMode: directorForm.creationMode,
            fps: directorForm.fps,
            voiceId: directorForm.voiceId,
          }
          const res = await connFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const initData = await res.json()
          if (!initData.ok) {
            notify(`草稿生成失败: ${initData.error}`, 'error')
            return
          }
          const finalData = initData.jobId ? await pollBackgroundJob(initData.jobId) : initData
          setAssetVersion((v) => v + 1)
          setSelectedSceneIdx(0)
          await refreshState(activeProjectDir, { autoStep: true, preferredStep: andRender ? 4 : 3 })
          notify(
            andRender
              ? `本地演练草稿成片已输出！分辨率 ${finalData.script?.width}×${finalData.script?.height} (${finalData.script?.aspectRatio})`
              : `已生成 ${finalData.sceneCount} 幕本地草稿（${finalData.script?.dimensionReason || ''}），可预览后交由大模型 AI 精修`,
            'success',
          )
        } catch (err) {
          notify(`草稿生成出错: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
          setBusyProgress(0)
        }
      }

      const handleAiCodingProduce = async (forceDraftRef = directorForm.useDraftReference) => {
        if (!activeProjectDir) return
        if (!llmConfig?.configured) {
          setShowLlmModal(true)
          notify('请先配置您的大模型接口（如 Claude / DeepSeek / OpenAI 或自定义中转），再启动 AI 编程创作', 'info')
          return
        }
        setBusyProgress(4)
        setBusyLabel(`正在启动大模型 (${llmConfig.model}) AI 编程出片工作流...`)
        try {
          const res = await connFetch('/api/video-workbench/ai-produce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              async: true,
              projectDir: activeProjectDir,
              sources: assetDirInput.trim() || undefined,
              topic: directorForm.topic.trim() || script?.title || '',
              userPrompt: directorForm.topic.trim() || script?.goal || '',
              engine: directorForm.engine,
              aspectRatio: directorForm.aspectRatio,
              quality: directorForm.quality,
              width: directorForm.quality === 'custom' || directorForm.aspectRatio === 'custom' ? Number(directorForm.customWidth) : undefined,
              height: directorForm.quality === 'custom' || directorForm.aspectRatio === 'custom' ? Number(directorForm.customHeight) : undefined,
              aiBadge: directorForm.aiBadge,
              creationMode: directorForm.creationMode,
              bgmMode: directorForm.bgmMode,
              bgmTtsPrompt: directorForm.bgmTtsPrompt,
              targetPlatform: directorForm.targetPlatform,
              useDraftReference: forceDraftRef,
              fps: directorForm.fps,
              voiceId: directorForm.voiceId,
              render: true,
            }),
          })
          const initData = await res.json()
          if (!initData.ok) {
            notify(`AI 编程任务启动失败: ${initData.error}`, 'error')
            return
          }
          const finalData = initData.jobId ? await pollBackgroundJob(initData.jobId) : initData
          setAssetVersion((v) => v + 1)
          setSelectedSceneIdx(0)
          await refreshState(activeProjectDir, { autoStep: true, preferredStep: 4 })
          const rounds = finalData.buildLog?.repairRoundsUsed ?? 0
          const tierNote = finalData.buildLog?.tierUsed ? ` · 降级策略 Tier ${finalData.buildLog.tierUsed}` : ''
          notify(
            `${finalData.buildLog?.creationMode === 'schema-plan' ? 'Schema 结构化导演' : '大模型 AI 编程'}出片完成！编译与 ${rounds} 轮自检通过${tierNote}，画幅 ${finalData.script?.width}×${finalData.script?.height}`,
            'success',
          )
        } catch (err) {
          notify(`AI 编程出片失败: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
          setBusyProgress(0)
        }
      }

      // Handlers: Step 3 Script & Scene Edit, Voice Synth, Natural Language Refine & Rollback
      const updateSelectedScene = (patch) => {
        if (!script || !selectedScene) return
        const nextScenes = script.scenes.map((sc, idx) => (idx === selectedSceneIdx ? { ...sc, ...patch } : sc))
        setScript({ ...script, scenes: nextScenes })
        setScriptDirty(true)
      }

      const handleSaveScriptEdits = async () => {
        if (!activeProjectDir || !script) return
        setBusyLabel('正在保存脚本修改并刷新画布...')
        try {
          const res = await connFetch('/api/video-workbench/script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: activeProjectDir, script, regenerateCode: true }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`保存失败: ${data.error}`, 'error')
            return
          }
          setScript(data.script)
          setScriptDirty(false)
          setAssetVersion((v) => v + 1)
          notify('修改已同步', 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleUpdateFormatQuick = async (nextRatio, nextQuality, nextPlatform) => {
        if (!activeProjectDir) return
        if (nextPlatform) {
          setDirectorForm((prev) => ({ ...prev, targetPlatform: nextPlatform }))
        }
        setBusyLabel('正在切换视频比例、平台安全区与画布尺寸...')
        try {
          const res = await connFetch('/api/video-workbench/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              action: 'update-format',
              aspectRatio: nextRatio,
              quality: nextQuality,
              ...(nextPlatform ? { targetPlatform: nextPlatform } : {}),
            }),
          })
          const data = await res.json()
          if (data.ok) {
            setAssetVersion((v) => v + 1)
            await refreshState(activeProjectDir)
            notify(nextPlatform ? `已切换至「${PLATFORM_OPTIONS.find((p) => p.id === nextPlatform)?.label || nextPlatform}」安全区基准` : data.dimensions?.reason || '画幅已更新', 'success')
          }
        } finally {
          setBusyLabel('')
        }
      }

      const handleSynthesizeSceneTts = async (scene) => {
        if (!activeProjectDir || !scene) return
        setBusyLabel(`正在用本地音色库为「${scene.title}」配音...`)
        try {
          if (scriptDirty) await handleSaveScriptEdits()
          const res = await connFetch('/api/video-workbench/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              action: 'tts-scene',
              sceneId: scene.id,
              text: scene.narration,
              emotion: scene.emotion || '平静',
              voiceId: scene.voiceId || 'auto',
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`配音失败: ${data.error}`, 'error')
            return
          }
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify(`已生成配音 (${data.result?.durationSec || ''}s) 并自动对齐时间轴`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleAiRefine = async (overrideInstruction) => {
        const finalInstruction =
          typeof overrideInstruction === 'string' && overrideInstruction.trim()
            ? overrideInstruction.trim()
            : refinePrompt.trim()
        if (!activeProjectDir || !finalInstruction) {
          notify('请输入你希望 AI 调整画面/特效/文案的意见', 'error')
          return
        }
        if (!llmConfig?.configured) {
          setRefinePrompt(finalInstruction)
          setShowLlmModal(true)
          notify('已填入修改指令；请先配置大模型接口后再启动精修', 'info')
          return
        }
        setBusyProgress(10)
        setBusyLabel(`大模型正在根据你的意见精修${refineScope === 'scene' ? `「${selectedScene?.title || '当前幕'}」` : '全片'}...`)
        try {
          const res = await connFetch('/api/video-workbench/ai-refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              async: true,
              projectDir: activeProjectDir,
              sceneId: refineScope === 'scene' ? selectedScene?.id || '' : '',
              instruction: finalInstruction,
              render: true,
            }),
          })
          const initData = await res.json()
          if (!initData.ok) {
            notify(`AI 精修失败: ${initData.error}`, 'error')
            return
          }
          await pollBackgroundJob(initData.jobId)
          setRefinePrompt('')
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify('AI 局部精修完成并已通过自动编译与质检！如需还原可随时点「撤回」', 'success')
        } catch (err) {
          notify(`AI 精修失败: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
          setBusyProgress(0)
        }
      }

      const handleRollbackVersion = async () => {
        if (!activeProjectDir) return
        setBusyLabel('正在恢复上一个保存的版本快照...')
        try {
          const res = await connFetch('/api/video-workbench/ai-refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: activeProjectDir, rollback: true }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(data.message || data.error || '没有可撤回的历史版本', 'info')
            return
          }
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify('已撤回至上一版本快照', 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleOpenCodeDrawer = async () => {
        if (!activeProjectDir) return
        const res = await connFetch(`/api/video-workbench/code?projectDir=${encodeURIComponent(activeProjectDir)}`)
        const data = await res.json()
        if (data.ok) {
          setCodeFiles(data.files || [])
          setSelectedCodePath((data.files || [])[0]?.path || '')
          setShowCodeDrawer(true)
        }
      }

      const handleAiMasterVoice = async (sceneId = '') => {
        if (!activeProjectDir) return
        setBusyProgress(12)
        setBusyLabel(
          sceneId
            ? `正在对分镜 ${sceneId} 执行配音后 AI 大模型声学修音...`
            : '正在对全片配音执行 AI 大模型声学修音 (LUFS / EQ / 齿音 / 混音)...',
        )
        try {
          const res = await connFetch('/api/video-workbench/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              async: true,
              action: 'ai-master-voice',
              projectDir: activeProjectDir,
              sceneIds: sceneId ? [sceneId] : [],
              useLlm: true,
            }),
          })
          const initData = await res.json()
          if (!initData.ok) {
            notify(`AI 修音失败: ${initData.error}`, 'error')
            return
          }
          const finalData = initData.jobId ? await pollBackgroundJob(initData.jobId) : initData
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          const rpt = finalData.report
          notify(
            `配音修音完成 (${rpt?.mode === 'ai-llm' ? `大模型 ${rpt.model}` : '自适应母带'} · 处理 ${rpt?.scenesCount || 0} 幕并重混母带)`,
            'success',
          )
        } catch (err) {
          notify(`AI 修音失败: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
          setBusyProgress(0)
        }
      }

      // Handlers: Step 4 Render & QA
      const handleRenderMp4 = async (draft720p = false) => {
        if (!activeProjectDir) return
        if (scriptDirty) await handleSaveScriptEdits()
        setBusyProgress(6)
        setBusyLabel(draft720p ? '正在快速渲染 720P 预览 MP4...' : '正在渲染全分辨率高质量 MP4 并执行 QA 质检...')
        try {
          const res = await connFetch('/api/video-workbench/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              async: true,
              projectDir: activeProjectDir,
              action: 'render',
              engine: script?.engine || directorForm.engine,
              draft720p,
            }),
          })
          const initData = await res.json()
          if (!initData.ok) {
            notify(`导出失败: ${initData.error}`, 'error')
            return
          }
          await pollBackgroundJob(initData.jobId)
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir, { autoStep: true, preferredStep: 4 })
          notify('高清成片 MP4 导出并完成自动化音画质检！', 'success')
        } catch (err) {
          notify(`渲染失败: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
          setBusyProgress(0)
        }
      }

      const handleRunQaOnly = async () => {
        if (!activeProjectDir) return
        setBusyLabel('正在运行 FFmpeg 黑屏与 EBU R128 响度质检...')
        try {
          const res = await connFetch('/api/video-workbench/qa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: activeProjectDir }),
          })
          const data = await res.json()
          if (data.ok) {
            setQaReport(data.qa)
            notify(data.qa.passed ? '自动化质检全部通过' : '质检完成，请查看详细指标', data.qa.passed ? 'success' : 'info')
          }
        } finally {
          setBusyLabel('')
        }
      }

      // Handlers: Voices
      const handlePreviewVoice = (v) => {
        if (playingVoiceId === v.id) {
          previewAudioRef.current?.pause()
          setPlayingVoiceId('')
          return
        }
        if (previewAudioRef.current) {
          previewAudioRef.current.src = `/api/video-workbench/voices/preview?id=${encodeURIComponent(v.id)}&v=${Date.now()}`
          previewAudioRef.current.play().catch(() => {
            notify('该 .pt 音色向量文件暂无原声样本，请直接选用后配音试听', 'info')
            setPlayingVoiceId('')
          })
          setPlayingVoiceId(v.id)
        }
      }

      const handleAssignVoice = async (v) => {
        setShowVoiceModal(false)
        if (voiceModalTarget === 'global') {
          setDirectorForm((prev) => ({ ...prev, voiceId: v.id }))
          notify(`全局首选音色设为「${v.name}」`, 'success')
          return
        }
        if (selectedScene) {
          updateSelectedScene({ voiceId: v.id, voiceLocked: true })
          notify(`已为「${selectedScene.title}」指定音色「${v.name}」`, 'success')
        }
      }

      const handleImportVoicePack = async () => {
        if (!voiceImportPath.trim()) {
          notify('请输入本地 .wav 或 .pt 音色文件路径', 'error')
          return
        }
        setBusyLabel('正在导入自定义音色包...')
        try {
          const res = await connFetch('/api/video-workbench/voices/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourcePath: voiceImportPath.trim(),
              name: voiceImportName.trim() || undefined,
              gender: voiceImportGender,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`导入音色失败: ${data.error}`, 'error')
            return
          }
          setVoiceCatalog(data.voiceCatalog || [])
          setVoiceImportPath('')
          setVoiceImportName('')
          notify('自定义音色已加入本地音色库！', 'success')
        } finally {
          setBusyLabel('')
        }
      }

      // Handlers: 3-Mode BGM (Upload / LLM Code / IndexTTS-2.5), Voice Cloning Lab, Publish Pack & Vendor Motion
      const handleUploadBgmFile = async (file) => {
        if (!activeProjectDir || !file) return
        setBusyLabel(`正在上传背景音乐「${file.name}」...`)
        try {
          const dataBase64 = await readFileAsBase64(file)
          const res = await connFetch('/api/video-workbench/bgm/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              fileName: file.name,
              dataBase64,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`上传 BGM 失败: ${data.error}`, 'error')
            return
          }
          setDirectorForm((prev) => ({ ...prev, bgmMode: 'uploaded' }))
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify(`已切换为自由上传 BGM「${data.asset?.name || file.name}」（混音时人声进入会自动压低配乐音量）`, 'success')
        } catch (err) {
          notify(`上传 BGM 出错: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
        }
      }

      const handleLlmComposeBgm = async () => {
        if (!activeProjectDir) return
        if (!llmConfig?.configured) {
          setShowLlmModal(true)
          notify('请先配置大模型接口，才能让 AI 编写配乐合成代码', 'info')
          return
        }
        setBusyLabel('大模型正在编写纯 JS 数字音频合成代码并运算 48kHz 配乐...')
        try {
          const res = await connFetch('/api/video-workbench/audio/llm-compose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: activeProjectDir }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`AI 写配乐失败: ${data.error}`, 'error')
            return
          }
          setDirectorForm((prev) => ({ ...prev, bgmMode: 'llm-coded' }))
          setBgmComposePreviewUrl(data.previewUrl || '')
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify(`AI 配乐代码已完成写入 (${data.relScriptPath}) 并生成试听母带`, 'success')
        } catch (err) {
          notify(`AI 写配乐出错: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
        }
      }

      const handleTtsComposeBgm = async () => {
        if (!activeProjectDir) return
        setBusyLabel('IndexTTS-2.5 正在用选定音色合成氛围音乐垫底...')
        try {
          const res = await connFetch('/api/video-workbench/audio/tts-compose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              promptText: directorForm.bgmTtsPrompt || script?.title || '深沉空灵氛围音景',
              voiceId: directorForm.voiceId || 'auto',
              mode: 'bgm-pad',
              durationSec: Math.min(18, Math.max(6, Number(script?.totalDurationSec) || 10)),
              emotion: '深沉',
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`配音引擎作曲失败: ${data.error}`, 'error')
            return
          }
          setDirectorForm((prev) => ({ ...prev, bgmMode: 'tts-engine' }))
          setBgmComposePreviewUrl(data.previewUrl || '')
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify('IndexTTS-2.5 已合成氛围音景并绑定为主配乐！', 'success')
        } catch (err) {
          notify(`配音引擎作曲失败: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
        }
      }

      const handleStopMicRecord = () => {
        if (micTimerRef.current) {
          clearInterval(micTimerRef.current)
          micTimerRef.current = null
        }
        try {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
          }
        } catch {}
        setMicRecording(false)
      }

      const handleStartMicRecord = async () => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
          notify('当前浏览器或环境不支持麦克风直录，请切换到「上传本地音频」选择录音文件', 'error')
          return
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          micChunksRef.current = []
          const mr = new MediaRecorder(stream)
          mediaRecorderRef.current = mr
          mr.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) micChunksRef.current.push(ev.data)
          }
          mr.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop())
            const blob = new Blob(micChunksRef.current, { type: mr.mimeType || 'audio/webm' })
            const b64 = await readFileAsBase64(blob)
            setRecordedB64(b64)
            setRecordedFileName(`mic-clone-${Date.now()}.webm`)
            if (!cloneVoiceName.trim()) setCloneVoiceName(`我的声音-${new Date().toTimeString().slice(0, 5).replace(':', '')}`)
            notify('麦克风采样完成！点击「生成并加入专属音色库」即可立即使用与试听', 'success')
          }
          mr.start(250)
          setMicRecording(true)
          setMicSeconds(0)
          micTimerRef.current = setInterval(() => {
            setMicSeconds((s) => {
              if (s + 1 >= 15) {
                handleStopMicRecord()
                return 15
              }
              return s + 1
            })
          }, 1000)
        } catch (err) {
          notify(`无法开启麦克风 (${err.message})，可改用「上传本地音频」导入`, 'error')
        }
      }

      const handlePickCloneFile = async (file) => {
        if (!file) return
        const b64 = await readFileAsBase64(file)
        setRecordedB64(b64)
        setRecordedFileName(file.name)
        if (!cloneVoiceName.trim()) {
          setCloneVoiceName(file.name.replace(/\.[^.]+$/, ''))
        }
        notify(`已载入参考人声文件「${file.name}」，点击提交即可完成降噪与音色克隆`, 'info')
      }

      const handleSubmitVoiceClone = async () => {
        if (cloneSubMode === 'path') {
          if (!voiceImportPath.trim()) {
            notify('请填写本机参考音频路径 (.wav/.mp3/.pt)', 'error')
            return
          }
          setVoiceImportName(cloneVoiceName || voiceImportName)
          setVoiceImportGender(cloneVoiceGender)
          await handleImportVoicePack()
          return
        }
        if (!recordedB64) {
          notify('请先录制 5–12 秒清晰人声，或选择一个本地参考音频文件', 'error')
          return
        }
        setBusyLabel('正在用 FFmpeg 执行 80Hz 滤波、去静音与响度归一标准化克隆...')
        try {
          const res = await connFetch('/api/video-workbench/voices/clone-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: recordedB64,
              fileName: recordedFileName || 'voice-clone.webm',
              name: cloneVoiceName.trim() || '我的专属声音',
              gender: cloneVoiceGender,
              promptText: cloneVoicePrompt.trim(),
              stripSilence: true,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`声音克隆入库失败: ${data.error}`, 'error')
            return
          }
          setVoiceCatalog(data.voiceCatalog || [])
          setCloneAuditionVoiceId(data.voice?.id || '')
          setRecordedB64('')
          setRecordedFileName('')
          notify(`声音克隆成功！音色「${data.voice?.name}」(${data.durationSec}s 有效人声) 已入库，可点击下方即时试听`, 'success')
        } catch (err) {
          notify(`声音克隆失败: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
        }
      }

      const handleAuditionClonedVoice = async (overrideId) => {
        const vid =
          overrideId ||
          cloneAuditionVoiceId ||
          voiceCatalog.find((v) => v.isCloned || v.id?.startsWith('clone-') || v.category === '专属声纹克隆')?.id ||
          'auto'
        setBusyLabel(`IndexTTS-2.5 正在实时克隆合成试听...`)
        try {
          const res = await connFetch('/api/video-workbench/voices/clone-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              voiceId: vid,
              text: cloneAuditionText.trim(),
              emotion: '温暖',
            }),
          })
          const data = await res.json()
          if (!data.ok || !data.audioDataUrl) {
            notify(`实时试听合成失败: ${data.error || '未返回音频流'}`, 'error')
            return
          }
          setCloneAuditionUrl(data.audioDataUrl)
          setCloneAuditionVoiceId(data.voiceUsed || vid)
          if (previewAudioRef.current) {
            previewAudioRef.current.src = data.audioDataUrl
            previewAudioRef.current.play().catch(() => {})
            setPlayingVoiceId(data.voiceUsed || vid)
          }
          notify(`克隆声线试听生成完成 (${data.durationSec || ''}s)`, 'success')
        } catch (err) {
          notify(`实时试听出错: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
        }
      }

      const handleExportPublishPack = async (overridePlatform) => {
        if (!activeProjectDir) return
        setBusyLabel('正在打包平台封面图、三×三质检墙、标题标签与 AI 合规说明...')
        try {
          const res = await connFetch('/api/video-workbench/publish-pack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              platform: overridePlatform || directorForm.targetPlatform || 'universal',
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`生成发布包失败: ${data.error}`, 'error')
            return
          }
          setPublishPackResult(data)
          notify(`平台发布包已导出至: ${data.packDir}`, 'success')
        } catch (err) {
          notify(`生成发布包失败: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
        }
      }

      const handleImportVendorMotion = async () => {
        if (!activeProjectDir || !vendorSourceDir.trim()) {
          notify('请填写 .motion 或外部 HTML 动效模板目录路径', 'error')
          return
        }
        setBusyLabel('正在使用无头 Chromium 隔离渲染外部动效模板并剥离音轨 (-an)...')
        try {
          const res = await connFetch('/api/video-workbench/vendor/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              sourceDir: vendorSourceDir.trim(),
              name: vendorName.trim() || undefined,
              durationSec: Number(vendorDurationSec) || 4,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`隔离渲染导入失败: ${data.error}`, 'error')
            return
          }
          setShowVendorModal(false)
          setVendorSourceDir('')
          setVendorName('')
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify(`外部动效片段已隔离压制并导入至「${data.assetPath}」`, 'success')
        } catch (err) {
          notify(`导入 .motion 出错: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
        }
      }

      // -----------------------------------------------------------------------
      // v5 AI AGENT COMMAND DECK HANDLERS (Pipeline, Task Center, Teleprompter, Avatar, Skins)
      // -----------------------------------------------------------------------
      const currentTaskRun = useMemo(() => {
        if (!taskRuns.length) return null
        if (selectedRunId) {
          const hit = taskRuns.find((r) => r.id === selectedRunId)
          if (hit) return hit
        }
        return taskRuns.find((r) => r.status === 'running' || r.status === 'paused') || taskRuns[0]
      }, [taskRuns, selectedRunId])

      const hasLiveTask = useMemo(
        () => taskRuns.some((r) => r.status === 'running' || r.status === 'paused' || r.status === 'queued'),
        [taskRuns],
      )

      const fetchTaskRuns = useCallback(
        async (dir = activeProjectDir) => {
          if (!dir) return
          try {
            const res = await connFetch(`/api/video-workbench/tasks?projectDir=${encodeURIComponent(dir)}`)
            const data = await res.json()
            if (data.ok && Array.isArray(data.runs)) {
              setTaskRuns(data.runs)
              if (data.runs[0]?.id) {
                setSelectedRunId((prev) => prev || data.runs[0].id)
              }
            }
          } catch {}
        },
        [connFetch, activeProjectDir],
      )

      useEffect(() => {
        if (activeProjectDir) fetchTaskRuns(activeProjectDir)
      }, [activeProjectDir, fetchTaskRuns])

      useEffect(() => {
        if (!activeProjectDir || !hasLiveTask) return undefined
        const timer = setInterval(async () => {
          const prevActive = taskRuns.find((r) => r.status === 'running' || r.status === 'paused')
          try {
            const res = await connFetch(`/api/video-workbench/tasks?projectDir=${encodeURIComponent(activeProjectDir)}`)
            const data = await res.json()
            if (data.ok && Array.isArray(data.runs)) {
              setTaskRuns(data.runs)
              const nowLive = data.runs.some((r) => r.status === 'running' || r.status === 'paused' || r.status === 'queued')
              if (prevActive && !nowLive) {
                setAssetVersion((v) => v + 1)
                await refreshState(activeProjectDir)
              }
            }
          } catch {}
        }, 1400)
        return () => clearInterval(timer)
      }, [activeProjectDir, hasLiveTask, connFetch])

      // Teleprompter smooth scroll engine (requestAnimationFrame)
      useEffect(() => {
        if (!showTeleprompter || !teleAutoScroll) {
          if (teleRafRef.current) cancelAnimationFrame(teleRafRef.current)
          teleRafRef.current = 0
          return undefined
        }
        let lastTs = 0
        const step = (ts) => {
          if (!lastTs) lastTs = ts
          const dt = Math.min(100, ts - lastTs)
          lastTs = ts
          const box = teleBoxRef.current
          if (box) {
            const pxPerSec = Math.max(8, Number(teleScrollSpeed) * 42)
            box.scrollTop += (pxPerSec * dt) / 1000
          }
          teleRafRef.current = requestAnimationFrame(step)
        }
        teleRafRef.current = requestAnimationFrame(step)
        return () => {
          if (teleRafRef.current) cancelAnimationFrame(teleRafRef.current)
          teleRafRef.current = 0
        }
      }, [showTeleprompter, teleAutoScroll, teleScrollSpeed])

      // Attach camera MediaStream whenever <video> mounts
      useEffect(() => {
        if (camStreaming && camVideoRef.current && camStreamRef.current) {
          camVideoRef.current.srcObject = camStreamRef.current
          camVideoRef.current.play().catch(() => {})
        }
      }, [camStreaming, showTeleprompter])

      // Stop camera stream cleanly on unmount
      useEffect(() => {
        return () => {
          try {
            if (camTimerRef.current) clearInterval(camTimerRef.current)
            if (camStreamRef.current) camStreamRef.current.getTracks().forEach((t) => t.stop())
          } catch {}
        }
      }, [])

      const handleStartOneClickPipeline = async (modeOverride = '', opts = {}) => {
        if (!activeProjectDir) return
        const chosenMode = modeOverride || directorForm.creationMode || 'ai-coded'
        if (chosenMode === 'ai-coded' && !llmConfig?.configured) {
          setShowLlmModal(true)
          notify('AI 团队一键全自动成片需要先连接大模型，或改用【极速草稿预览】体验大屏协同', 'info')
          return
        }
        setBusyLabel('⚡ 正在唤醒 5 大 AI Agent 战队进入全自动协同出片流程...')
        try {
          const uploadedMusic = projectAssets.find((a) => a.type === 'audio' && a.role === 'music')
          const uploadedBgmPath = script?.bgm?.uploadedPath || uploadedMusic?.path || ''
          const avatarSourceFallback =
            avatarCfg.sourcePath ||
            projectAssets.find((a) => a.role === 'avatar_base' || a.role === 'host_video')?.path ||
            ''
          const voiceCloneFallback =
            avatarCfg.voiceSamplePath ||
            projectAssets.find((a) => a.role === 'voice_clone')?.path ||
            ''
          const res = await connFetch('/api/video-workbench/pipeline/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              topic: directorForm.topic,
              mode: chosenMode === 'schema-plan' ? 'fast-draft' : 'ai-coded',
              engine: directorForm.engine,
              style: directorForm.style,
              aspectRatio: directorForm.aspectRatio,
              quality: directorForm.quality,
              width: Number(directorForm.customWidth) || 1920,
              height: Number(directorForm.customHeight) || 1080,
              targetPlatform: directorForm.targetPlatform,
              bgmMode: directorForm.bgmMode,
              uploadedBgmPath,
              voiceId: directorForm.voiceId,
              speechTempo: Number(speechTempo) || 1.0,
              useHostVocal,
              aiBadge: Boolean(directorForm.aiBadge),
              avatarEnabled: Boolean(avatarCfg.enabled),
              avatarMode: avatarCfg.mode,
              avatarLayout: avatarCfg.layout,
              avatarPresetId: avatarCfg.presetId,
              avatarSourcePath: avatarSourceFallback,
              voiceSamplePath: voiceCloneFallback,
              avatarChromaKeyColor: avatarCfg.chromaKeyColor || '',
              trimSeconds: Number(trimClipSec) || 0,
              clipSpeed: Number(clipSpeedMult) || 1.0,
              aiAuthorCode: Boolean(aiAuthorCode),
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`启动协同流水线失败: ${data.error}`, 'error')
            return
          }
          if (Array.isArray(data.runs)) setTaskRuns(data.runs)
          if (data.runId) setSelectedRunId(data.runId)
          if (!opts.stayOnCurrentTab) {
            setActiveStep(0)
            setWarCenterTab('map')
          }
          notify('⚡ 5 大 AI Agent 已进入星图作战大屏，可实时观看节点脉冲协同、日志推演与一键急停', 'success')
        } catch (err) {
          notify(`启动失败: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
        }
      }

      const handleTaskControl = async (action, runId = currentTaskRun?.id, taskId = '') => {
        if (!activeProjectDir && !runId) return
        try {
          const res = await connFetch('/api/video-workbench/tasks/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              runId,
              taskId,
              projectDir: activeProjectDir,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`任务控制失败: ${data.error}`, 'error')
            return
          }
          if (Array.isArray(data.runs)) setTaskRuns(data.runs)
          const labelMap = {
            pause: '已暂停流水线调度（完成当前原子步骤后挂起）',
            resume: '已恢复执行流水线',
            start: '已恢复执行流水线',
            stop: '已发送停止指令并立即强杀关联子进程',
            retry: '正在重试任务流水线',
            'pause-all': '已暂停全部运行中任务',
            'stop-all': '已紧急停止全部任务及子进程',
          }
          notify(labelMap[action] || '操作已执行', action.includes('stop') ? 'info' : 'success')
        } catch (err) {
          notify(`任务控制异常: ${err.message}`, 'error')
        }
      }

      const handleChangeAssetRole = async (assetId, newRole) => {
        if (!activeProjectDir || !assetId) return
        try {
          const res = await connFetch('/api/video-workbench/assets/role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: activeProjectDir, assetId, role: newRole }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`更新素材用途失败: ${data.error}`, 'error')
            return
          }
          await refreshState(activeProjectDir)
          notify(`已标记素材用途为「${newRole}」`, 'success')
        } catch (err) {
          notify(`标记失败: ${err.message}`, 'error')
        }
      }

      const handleRunMediaCurate = async () => {
        if (!activeProjectDir) return
        setBusyLabel('✂️ 素材剪辑 Agent 正在调用 FFmpeg 智能构图裁切与调色...')
        try {
          const res = await connFetch('/api/video-workbench/assets/curate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              aspectRatio: directorForm.aspectRatio,
              quality: directorForm.quality,
              style: directorForm.style,
              trimSeconds: Number(trimClipSec) || 0,
              clipSpeed: Number(clipSpeedMult) || 1.0,
              chromaKeyColor: avatarCfg.chromaKeyColor || '',
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`素材精修失败: ${data.error}`, 'error')
            return
          }
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify(`已完成 ${data.editedCount || 0} 份素材的构图裁切与电影调色精修`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleGenerateTeleprompter = async () => {
        if (!activeProjectDir) return
        setBusyLabel('📝 正在请大模型生成适配出镜节奏的口播提词稿...')
        try {
          const res = await connFetch('/api/video-workbench/teleprompter/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              topic: directorForm.topic || script?.title || '个人品牌/产品介绍',
              durationSec: 45,
              tone: directorForm.style || 'cinematic',
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`生成提词稿失败: ${data.error}`, 'error')
            return
          }
          setTeleLinesText(data.text || (data.lines || []).join('\n'))
          if (teleBoxRef.current) teleBoxRef.current.scrollTop = 0
          notify(`已加载口播提词稿 (${data.model || '脚本引擎'})，可点击「开始滚动」边看边录`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleStopWebcam = () => {
        try {
          if (camTimerRef.current) {
            clearInterval(camTimerRef.current)
            camTimerRef.current = null
          }
          if (camRecorderRef.current && camRecorderRef.current.state === 'recording') {
            camRecorderRef.current.stop()
          }
          if (camStreamRef.current) {
            camStreamRef.current.getTracks().forEach((t) => t.stop())
            camStreamRef.current = null
          }
        } catch {}
        setCamStreaming(false)
        setCamRecording(false)
      }

      const handleStartWebcam = async () => {
        setCamError('')
        if (!navigator.mediaDevices?.getUserMedia) {
          setCamError('当前宿主环境不支持摄像头/麦克风采集（MediaDevices 不可用）')
          return
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: { echoCancellation: true, noiseSuppression: true },
          })
          camStreamRef.current = stream
          setCamStreaming(true)
          setTimeout(() => {
            if (camVideoRef.current) {
              camVideoRef.current.srcObject = stream
              camVideoRef.current.play().catch(() => {})
            }
          }, 40)
        } catch (err) {
          setCamError(`无法开启摄像头或麦克风: ${err.message}`)
          notify(`摄像头打开失败: ${err.message}`, 'error')
        }
      }

      const handleStartCamRecord = () => {
        if (!camStreamRef.current || typeof MediaRecorder === 'undefined') {
          notify('请先点击「开启摄像头预览」授权音视频设备', 'error')
          return
        }
        camChunksRef.current = []
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : ''
        const mr = mime ? new MediaRecorder(camStreamRef.current, { mimeType: mime }) : new MediaRecorder(camStreamRef.current)
        camRecorderRef.current = mr
        mr.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) camChunksRef.current.push(ev.data)
        }
        mr.onstop = async () => {
          if (camTimerRef.current) {
            clearInterval(camTimerRef.current)
            camTimerRef.current = null
          }
          setCamRecording(false)
          setTeleAutoScroll(false)
          const blob = new Blob(camChunksRef.current, { type: mr.mimeType || 'video/webm' })
          if (blob.size < 256 || !activeProjectDir) return
          setBusyLabel('📹 正在保存出镜录像至 assets/recordings/ 并测算时长...')
          try {
            const dataBase64 = await readFileAsBase64(blob)
            const fileName = `host-cam-${Date.now()}.webm`
            const res = await connFetch('/api/video-workbench/assets/recording', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectDir: activeProjectDir,
                fileName,
                role: camTargetRole,
                extractVoiceClone: Boolean(camExtractClone),
                dataBase64,
              }),
            })
            const data = await res.json()
            if (!data.ok) {
              notify(`保存录制失败: ${data.error}`, 'error')
              return
            }
            if (camTargetRole === 'avatar_base') {
              setAvatarCfg((prev) => ({ ...prev, enabled: true, mode: 'cloned-human', sourcePath: data.relPath }))
            }
            setAssetVersion((v) => v + 1)
            await refreshState(activeProjectDir)
            notify(
              `出镜录像已保存 (${Number(data.durationSec || 0).toFixed(1)}s)${data.clonedVoice ? ` · 已同步克隆声纹「${data.clonedVoice.name}」` : ''}`,
              'success',
            )
          } catch (err) {
            notify(`保存录像异常: ${err.message}`, 'error')
          } finally {
            setBusyLabel('')
          }
        }
        mr.start(300)
        setCamSeconds(0)
        setCamRecording(true)
        setTeleAutoScroll(true)
        if (teleBoxRef.current) teleBoxRef.current.scrollTop = 0
        camTimerRef.current = setInterval(() => setCamSeconds((s) => s + 1), 1000)
      }

      const handleStopCamRecord = () => {
        if (camRecorderRef.current && camRecorderRef.current.state === 'recording') {
          camRecorderRef.current.stop()
        }
      }

      const handleGenerateAvatarClip = async () => {
        if (!activeProjectDir) return
        setBusyLabel('🤖 正在生成带 Alpha 透明通道的数字人口播视频 (yuva420p WebM)...')
        try {
          const sourceFallback =
            avatarCfg.sourcePath ||
            projectAssets.find((a) => a.role === 'avatar_base' || a.role === 'host_video')?.path ||
            ''
          const voiceSampleFallback =
            avatarCfg.voiceSamplePath ||
            projectAssets.find((a) => a.role === 'voice_clone')?.path ||
            ''
          const res = await connFetch('/api/video-workbench/avatar/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              avatarMode: avatarCfg.mode,
              sourceVideoPath: sourceFallback,
              voiceId: directorForm.voiceId,
              voiceSamplePath: voiceSampleFallback,
              avatarLayout: avatarCfg.layout,
              presetId: avatarCfg.presetId,
              chromaKeyColor: avatarCfg.chromaKeyColor || '',
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`数字人生成失败: ${data.error}`, 'error')
            return
          }
          setAvatarCfg((prev) => ({ ...prev, enabled: true }))
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir)
          notify(`透明通道数字人已写入脚本 (${data.relPath})，可在监视器实时预览叠加效果`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleUploadSkinWallpaper = async (file) => {
        if (!file) return
        setBusyLabel(`正在上传自定义大屏皮肤「${file.name}」...`)
        try {
          const dataBase64 = await readFileAsBase64(file)
          const res = await connFetch('/api/video-workbench/skin/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, dataBase64 }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`上传皮肤失败: ${data.error}`, 'error')
            return
          }
          setSkinConfig((prev) => ({ ...prev, id: 'custom-image', customUrl: data.url }))
          notify('自定义大屏背景皮肤已生效，支持下方滑块调节模糊度与透明度', 'success')
        } catch (err) {
          notify(`上传皮肤出错: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
        }
      }

      // -----------------------------------------------------------------------
      // REUSABLE STYLES (Computed cleanly from Adaptive Theme `T` + FUI Geometry)
      // -----------------------------------------------------------------------
      const panelStyle = {
        background: T.bgPanel,
        border: `1px solid ${T.borderSubtle}`,
        borderRadius: '14px',
        boxShadow: T.shadowCard,
        backdropFilter: 'blur(20px) saturate(135%)',
        WebkitBackdropFilter: 'blur(20px) saturate(135%)',
      }

      const inputStyle = {
        width: '100%',
        padding: '9px 12px',
        borderRadius: '9px',
        background: T.bgInput,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
        colorScheme: resolvedDark ? 'dark' : 'light',
        fontSize: '13px',
        fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
        outline: 'none',
      }

      const goldBtnStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
        padding: '9px 18px',
        borderRadius: '10px',
        background: resolvedDark
          ? 'linear-gradient(135deg, #F0B64D, #C88318)'
          : 'linear-gradient(135deg, #0F172A, #1E293B)',
        border: resolvedDark ? '1px solid rgba(255, 224, 150, 0.45)' : '1px solid rgba(15, 23, 42, 0.25)',
        color: resolvedDark ? '#07090E' : '#FFFFFF',
        fontSize: '13px',
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }

      const blueBtnStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
        padding: '9px 16px',
        borderRadius: '10px',
        background: T.accentBlue,
        border: 'none',
        color: resolvedDark ? '#04131D' : '#FFFFFF',
        fontSize: '13px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }

      const ghostBtnStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '7px 13px',
        borderRadius: '9px',
        background: resolvedDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
        border: `1px solid ${T.borderSubtle}`,
        color: T.textPrimary,
        fontSize: '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }

      const previewHtmlUrl = activeProjectDir
        ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=index.html&preview=1&v=${assetVersion}`
        : ''
      const masterAudioUrl =
        activeProjectDir && hasMasterAudio
          ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=output/master-audio.wav&v=${assetVersion}`
          : ''
      const mp4Url =
        activeProjectDir && hasMp4
          ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=output/final.mp4&v=${assetVersion}`
          : ''
      const snapshotUrl =
        activeProjectDir && hasSnapshot
          ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=output/snapshot-3x3.png&v=${assetVersion}`
          : ''

      // Shell overlay collapsed pill when inside DSH host chat view
      if (!isMainSlot && mainSlotActive) return null
      if (!isMainSlot && mode !== 'video') {
        return h(
          'div',
          { style: { position: 'fixed', top: '10px', right: '180px', zIndex: 2100 } },
          h(
            'button',
            {
              className: 'dsh-vw-btn',
              onClick: () => switchWorkbenchMode('video'),
              style: { ...goldBtnStyle, padding: '6px 14px', fontSize: '12px', borderRadius: '999px' },
            },
            h(Icon, { name: 'film', size: 13 }),
            ' 打开电影视频工坊',
          ),
        )
      }

      const hiddenInputs = h(
        'div',
        { style: { display: 'none' } },
        h('audio', { ref: stageAudioRef, src: masterAudioUrl || undefined, preload: 'auto' }),
        h('audio', { ref: previewAudioRef, onEnded: () => setPlayingVoiceId('') }),
        h('input', {
          ref: fileInputRef,
          type: 'file',
          multiple: true,
          accept: 'image/*,video/*,audio/*,.txt,.md',
          onChange: (ev) => {
            handleUploadFiles(ev.target.files)
            ev.target.value = ''
          },
        }),
        h('input', {
          ref: folderInputRef,
          type: 'file',
          multiple: true,
          webkitdirectory: 'true',
          onChange: (ev) => {
            handleUploadFiles(ev.target.files)
            ev.target.value = ''
          },
        }),
        h('input', {
          ref: bgmInputRef,
          type: 'file',
          accept: 'audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac',
          onChange: (ev) => {
            if (ev.target.files?.[0]) handleUploadBgmFile(ev.target.files[0])
            ev.target.value = ''
          },
        }),
        h('input', {
          ref: avatarBaseInputRef,
          type: 'file',
          accept: 'video/*,image/*,.mp4,.mov,.webm,.png,.jpg,.jpeg',
          onChange: (ev) => {
            if (ev.target.files?.length) handleUploadFiles(ev.target.files, 'avatar_base')
            ev.target.value = ''
          },
        }),
        h('input', {
          ref: voiceCloneInputRef,
          type: 'file',
          accept: 'audio/*,.mp3,.wav,.flac,.m4a,.ogg',
          onChange: (ev) => {
            if (ev.target.files?.length) handleUploadFiles(ev.target.files, 'voice_clone')
            ev.target.value = ''
          },
        }),
        h('input', {
          ref: skinFileInputRef,
          type: 'file',
          accept: 'image/*,.png,.jpg,.jpeg,.webp',
          onChange: (ev) => {
            if (ev.target.files?.[0]) handleUploadSkinWallpaper(ev.target.files[0])
            ev.target.value = ''
          },
        }),
        h('input', {
          ref: cloneFileInputRef,
          type: 'file',
          accept: 'audio/*,.mp3,.wav,.flac,.m4a,.ogg',
          onChange: (ev) => {
            if (ev.target.files?.[0]) handlePickCloneFile(ev.target.files[0])
            ev.target.value = ''
          },
        }),
      )

      const curW = Number(script?.width) || 1920
      const curH = Number(script?.height) || 1080
      const isPortraitVideo = curW < curH

      // -----------------------------------------------------------------------
      // SIDEBAR (Project Film Reel Drawer)
      // -----------------------------------------------------------------------
      const sidebar = h(
        'aside',
        {
          style: {
            width: '238px',
            flexShrink: 0,
            background: T.bgSidebar,
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            borderRight: `1px solid ${T.borderSubtle}`,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          },
        },
        h(
          'div',
          {
            style: {
              padding: '15px 14px',
              borderBottom: `1px solid ${T.borderSubtle}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
          },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h(Icon, { name: 'film', size: 17, color: T.accentGold }),
            h('span', { style: { fontWeight: 800, fontSize: '14px', letterSpacing: '0.02em' } }, '工程影片库'),
          ),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            h(
              'button',
              {
                className: 'dsh-vw-btn',
                onClick: () => setShowNewModal(true),
                style: { ...ghostBtnStyle, padding: '4px 8px', fontSize: '11.5px', color: T.accentGold, borderColor: T.accentGoldBorder },
              },
              h(Icon, { name: 'plus', size: 12 }),
              '新建',
            ),
            h(
              'button',
              {
                className: 'dsh-vw-btn',
                title: '收起工程库侧栏',
                onClick: () => setShowProjectDrawer(false),
                style: { ...ghostBtnStyle, padding: '4px 6px' },
              },
              h(Icon, { name: 'x', size: 12 }),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '10px' } },
          projects.map((p) => {
            const projId = p.id || p.slug || ''
            const isSel = p.projectDir === activeProjectDir
            const isDel = confirmDeleteDir === p.projectDir
            const lockedBuiltIn = projId === 'demo-html-project' || projId === 'demo-remotion-project'
            return h(
              'div',
              {
                key: p.projectDir,
                onClick: () => !isDel && handleSelectProject(p.projectDir),
                style: {
                  padding: '10px 11px',
                  borderRadius: '10px',
                  marginBottom: '6px',
                  cursor: 'pointer',
                  background: isSel ? T.accentGoldBg : 'transparent',
                  border: `1px solid ${isSel ? T.accentGoldBorder : 'transparent'}`,
                },
              },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } },
                h(
                  'div',
                  {
                    style: {
                      flex: 1,
                      minWidth: 0,
                      fontSize: '13px',
                      fontWeight: isSel ? 700 : 500,
                      color: isSel ? T.textPrimary : T.textSecondary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  },
                  p.name || p.title || projId,
                ),
                !lockedBuiltIn
                  ? h(
                      'button',
                      {
                        className: 'dsh-vw-btn',
                        onClick: (ev) => {
                          ev.stopPropagation()
                          setConfirmDeleteDir(isDel ? '' : p.projectDir)
                        },
                        style: { background: 'transparent', border: 'none', color: T.textMuted, padding: '2px' },
                      },
                      h(Icon, { name: 'trash', size: 12 }),
                    )
                  : null,
              ),
              isDel
                ? h(
                    'div',
                    { style: { marginTop: '6px', display: 'flex', gap: '6px' }, onClick: (ev) => ev.stopPropagation() },
                    h(
                      'button',
                      {
                        className: 'dsh-vw-btn',
                        onClick: () => handleDeleteProject(p.projectDir),
                        style: { flex: 1, padding: '3px', borderRadius: '6px', background: T.accentRed, color: '#fff', border: 'none', fontSize: '11px' },
                      },
                      '确认删除',
                    ),
                    h(
                      'button',
                      {
                        className: 'dsh-vw-btn',
                        onClick: () => setConfirmDeleteDir(''),
                        style: { flex: 1, padding: '3px', borderRadius: '6px', background: T.bgElevated, color: T.textPrimary, border: `1px solid ${T.borderSubtle}`, fontSize: '11px' },
                      },
                      '取消',
                    ),
                  )
                : h(
                    'div',
                    { style: { marginTop: '4px', fontSize: '11px', color: T.textMuted, display: 'flex', gap: '6px', alignItems: 'center' } },
                    h('span', null, `${p.sceneCount || 0} 幕`),
                    h('span', null, '·'),
                    h('span', { style: { textTransform: 'uppercase' } }, p.engine || 'html'),
                    p.hasMp4 ? h('span', { style: { color: T.accentGreen, fontWeight: 700 } }, '● MP4') : null,
                  ),
            )
          }),
        ),
        // Bottom Engine Status Readout
        h(
          'div',
          { style: { padding: '11px 14px', borderTop: `1px solid ${T.borderSubtle}`, fontSize: '11px', color: T.textMuted, display: 'flex', flexDirection: 'column', gap: '4px' } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            h('span', { style: { width: '7px', height: '7px', borderRadius: '50%', background: ttsStatus.ready ? T.accentGreen : '#F59E0B' } }),
            h('span', null, `IndexTTS-2.5 音色库: ${voiceCatalog.length} 个`),
          ),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            h('span', { style: { width: '7px', height: '7px', borderRadius: '50%', background: llmConfig?.configured ? T.accentBlue : T.textMuted } }),
            h(
              'span',
              { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              llmConfig?.configured
                ? `${llmConfig.mode === 'follow-dsh' ? 'DSH 默认' : '自定义'}: ${llmConfig.model}`
                : '大模型: 待设置',
            ),
          ),
        ),
      )

      // -----------------------------------------------------------------------
      // TOP AI COMMAND DECK HEADER + AGENT TEAM HUD BAR
      // -----------------------------------------------------------------------
      const hudAgents = currentTaskRun?.agents?.length
        ? currentTaskRun.agents
        : AGENT_TEAM_DEFS.map((d) => ({
            id: d.id,
            name: d.short,
            subtitle: d.desc,
            status: 'idle',
            progress: 0,
            message: '待命中',
          }))

      const topBar = h(
        'header',
        {
          style: {
            flexShrink: 0,
            background: T.bgSidebar,
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            borderBottom: `1px solid ${hasLiveTask ? T.accentBlueBorder : T.borderSubtle}`,
            boxShadow: hasLiveTask ? '0 4px 24px rgba(34,211,238,0.12)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 4,
          },
        },
        // Row 1: Drawer Toggle & Specs · 6-Tab War Room Nav · Skin / LLM / 3-Way Theme
        h(
          'div',
          {
            style: {
              height: '52px',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            },
          },
          // Left: Collapsible Project Drawer Trigger + Film Spec Badges
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexShrink: 1 } },
            h(
              'button',
              {
                className: 'dsh-vw-btn',
                onClick: () => setShowProjectDrawer((v) => !v),
                title: '展开/收起工程列表与新建工程',
                style: {
                  ...ghostBtnStyle,
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 800,
                  borderColor: showProjectDrawer ? T.accentGoldBorder : T.borderStrong,
                  background: showProjectDrawer ? T.accentGoldBg : T.bgElevated,
                  color: T.textPrimary,
                },
              },
              h(Icon, { name: 'folder', size: 13, color: T.accentGold }),
              h('span', { style: { maxWidth: '115px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, script?.title || '未命名影片'),
              h('span', { style: { fontSize: '10px', color: T.accentGold } }, showProjectDrawer ? '▴' : `▾ ${projects.length}`),
            ),
            script
              ? h(
                  'span',
                  {
                    style: {
                      fontSize: '10px',
                      fontFamily: 'Consolas, monospace',
                      padding: '2px 7px',
                      borderRadius: '6px',
                      background: T.accentBlueBg,
                      color: T.accentBlue,
                      border: `1px solid ${T.accentBlueBorder}`,
                      whiteSpace: 'nowrap',
                    },
                  },
                  `${script.aspectRatio || (curW < curH ? '9:16' : '16:9')} · ${curW}×${curH}`,
                )
              : null,
            hasMp4
              ? h(
                  'span',
                  {
                    style: {
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      background: T.accentGreenBg,
                      color: T.accentGreen,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    },
                  },
                  '● MP4',
                )
              : null,
          ),
          // Center: 6-Tab Navigation (War Room Hero + 4 Precision Stages + Task Logs)
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap', flexShrink: 0 } },
            [
              { id: 0, label: '🛸 作战大屏', accent: 'war' },
              { id: 1, label: '01 素材提词' },
              { id: 2, label: '02 导演数字人' },
              { id: 3, label: '03 三轨监视' },
              { id: 4, label: '04 导出质检' },
              { id: 5, label: '任务日志', icon: 'activity' },
            ].map((st) => {
              const active = activeStep === st.id
              const isWarTab = st.id === 0
              const isTaskTab = st.id === 5
              return h(
                'button',
                {
                  key: st.id,
                  className: 'dsh-vw-btn',
                  onClick: () => {
                    setIsPlaying(false)
                    setActiveStep(st.id)
                    if (isWarTab || isTaskTab) fetchTaskRuns()
                  },
                  style: {
                    padding: isWarTab ? '5px 12px' : '5px 9px',
                    borderRadius: '999px',
                    fontSize: '11.5px',
                    fontWeight: active || isWarTab ? 800 : 500,
                    whiteSpace: 'nowrap',
                    background: active
                      ? isWarTab || isTaskTab
                        ? T.accentBlueBg
                        : T.accentGoldBg
                      : 'transparent',
                    border: `1px solid ${
                      active
                        ? isWarTab || isTaskTab
                          ? T.accentBlueBorder
                          : T.accentGoldBorder
                        : isWarTab
                          ? T.borderStrong
                          : T.borderSubtle
                    }`,
                    boxShadow: active && isWarTab ? `0 0 14px ${T.accentBlueBg}` : 'none',
                    color: active ? (isWarTab || isTaskTab ? T.accentBlue : T.accentGold) : T.textSecondary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  },
                },
                st.icon ? h(Icon, { name: st.icon, size: 12 }) : null,
                st.label,
                (isWarTab || isTaskTab) && hasLiveTask
                  ? h('span', {
                      className: 'dsh-vw-rec-dot',
                      style: { width: '6px', height: '6px', borderRadius: '50%', background: T.accentBlue },
                    })
                  : null,
              )
            }),
          ),
          // Right: Skin · LLM Config · 3-Way Theme · Return to Chat
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 } },
            h(
              'button',
              {
                className: 'dsh-vw-btn',
                onClick: () => setShowSkinModal(true),
                title: '切换大屏皮肤与高斯模糊透明度',
                style: { ...ghostBtnStyle, padding: '5px 9px', fontSize: '11.5px' },
              },
              h(Icon, { name: 'palette', size: 13 }),
              '皮肤',
            ),
            h(
              'button',
              {
                className: 'dsh-vw-btn',
                onClick: () => setShowLlmModal(true),
                style: {
                  ...ghostBtnStyle,
                  padding: '5px 9px',
                  fontSize: '11.5px',
                  borderColor: llmConfig?.configured ? T.accentBlueBorder : T.accentGoldBorder,
                  color: llmConfig?.configured ? T.accentBlue : T.accentGold,
                },
              },
              h(Icon, { name: 'cpu', size: 13 }),
              llmConfig?.configured
                ? `${llmConfig.mode === 'follow-dsh' ? 'DSH·' : ''}${String(llmConfig.model || '').slice(0, 14)}`
                : '配置模型',
            ),
            h(
              'div',
              {
                style: {
                  display: 'inline-flex',
                  padding: '2px',
                  borderRadius: '8px',
                  background: T.bgInput,
                  border: `1px solid ${T.borderSubtle}`,
                },
              },
              [
                { id: 'auto', label: '跟随', title: '自动跟随 DSH / 系统浅色与深色主题' },
                { id: 'dark', label: '暗夜', title: '深空曜石赛博电影暗色主题' },
                { id: 'light', label: '浅色', title: '高定航天白昼主题' },
              ].map((th) => {
                const on = themePref === th.id
                return h(
                  'button',
                  {
                    key: th.id,
                    title: th.title,
                    className: 'dsh-vw-btn',
                    onClick: () => selectThemePref(th.id),
                    style: {
                      padding: '4px 7px',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: on ? 700 : 500,
                      background: on ? T.bgPanel : 'transparent',
                      color: on ? T.textPrimary : T.textMuted,
                      boxShadow: on ? '0 1px 4px rgba(0,0,0,0.14)' : 'none',
                    },
                  },
                  th.label,
                )
              }),
            ),
            !isMainSlot
              ? h(
                  'button',
                  {
                    className: 'dsh-vw-btn',
                    onClick: () => switchWorkbenchMode('chat'),
                    style: { ...ghostBtnStyle, padding: '5px 9px', fontSize: '11.5px' },
                  },
                  '返回对话',
                )
              : null,
          ),
        ),
        // Row 2: Compact Agent Team HUD Bar ONLY when operating inside Manual Precision Steps 1..5
        activeStep !== 0
          ? h(
              'div',
              {
                style: {
                  minHeight: '36px',
                  padding: '4px 16px',
                  borderTop: `1px solid ${T.borderSubtle}`,
                  background: resolvedDark ? 'rgba(7, 9, 14, 0.56)' : 'rgba(241, 244, 250, 0.72)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  flexWrap: 'wrap',
                },
              },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 } },
                h(Icon, { name: 'activity', size: 13, color: hasLiveTask ? T.accentBlue : T.accentGold }),
                h('span', { style: { fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em', color: T.textSecondary } }, 'AGENT 协同 HUD'),
                currentTaskRun
                  ? h(
                      'span',
                      {
                        style: {
                          fontSize: '10.5px',
                          fontFamily: 'Consolas, monospace',
                          padding: '2px 7px',
                          borderRadius: '999px',
                          background: currentTaskRun.status === 'running' ? T.accentBlueBg : T.bgElevated,
                          color: currentTaskRun.status === 'running' ? T.accentBlue : T.textSecondary,
                          border: `1px solid ${T.borderSubtle}`,
                        },
                      },
                      `${Math.round(Number(currentTaskRun.progress || 0))}% · ${Math.round(Number(currentTaskRun.elapsedMs || 0) / 1000)}s`,
                    )
                  : null,
              ),
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center', minWidth: 0, overflowX: 'auto' } },
                hudAgents.map((ag, idx) => {
                  const def = AGENT_TEAM_DEFS[idx] || { short: ag.name, icon: 'sparkles', desc: ag.subtitle }
                  const st = ag.status || 'idle'
                  const isRunning = st === 'running'
                  const isDone = st === 'completed'
                  const isFail = st === 'failed' || st === 'stopped'
                  const isPaused = st === 'paused'
                  const nodeColor = isRunning ? T.accentBlue : isDone ? T.accentGreen : isPaused ? T.accentGold : isFail ? T.accentRed : T.textMuted
                  return h(
                    React.Fragment,
                    { key: ag.id || idx },
                    h(
                      'button',
                      {
                        className: `dsh-vw-hud-node ${isRunning ? 'is-running' : ''}`,
                        onClick: () => {
                          setActiveStep(0)
                          setWarCenterTab('map')
                          fetchTaskRuns()
                        },
                        title: `返回星图态势查看: ${def.short}`,
                        style: {
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          cursor: 'pointer',
                          background: isRunning ? T.accentBlueBg : isDone ? T.accentGreenBg : isPaused ? T.accentGoldBg : isFail ? T.accentRedBg : 'transparent',
                          border: `1px solid ${isRunning ? T.accentBlueBorder : isDone ? T.accentGreen : isPaused ? T.accentGoldBorder : T.borderSubtle}`,
                          color: st === 'idle' ? T.textSecondary : nodeColor,
                          fontSize: '11px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        },
                      },
                      h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: nodeColor } }),
                      def.short,
                      isRunning ? h('span', { style: { fontFamily: 'Consolas, monospace', fontSize: '10px' } }, `${Math.round(Number(ag.progress || 0))}%`) : isDone ? '✓' : null,
                    ),
                    idx < hudAgents.length - 1
                      ? h(
                          'svg',
                          { width: 20, height: 10, viewBox: '0 0 20 10', style: { flexShrink: 0, opacity: isRunning || isDone ? 0.95 : 0.35 } },
                          h('line', {
                            x1: 2,
                            y1: 5,
                            x2: 18,
                            y2: 5,
                            className: isRunning ? 'dsh-vw-hud-flow' : '',
                            stroke: isRunning || isDone ? T.accentBlue : T.textMuted,
                            strokeWidth: isRunning ? 2 : 1.5,
                            strokeDasharray: '4 3',
                          }),
                        )
                      : null,
                  )
                }),
              ),
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 } },
                currentTaskRun && (currentTaskRun.status === 'running' || currentTaskRun.status === 'paused')
                  ? h(
                      React.Fragment,
                      null,
                      h('button', { className: 'dsh-vw-btn', onClick: () => handleTaskControl(currentTaskRun.status === 'paused' ? 'resume' : 'pause', currentTaskRun.id), style: { ...ghostBtnStyle, padding: '3px 9px', fontSize: '11px', color: T.accentGold, borderColor: T.accentGoldBorder } }, currentTaskRun.status === 'paused' ? '▶ 恢复' : '⏸ 暂停'),
                      h('button', { className: 'dsh-vw-btn', onClick: () => handleTaskControl('stop', currentTaskRun.id), style: { ...ghostBtnStyle, padding: '3px 9px', fontSize: '11px', color: T.accentRed, borderColor: 'rgba(244,63,94,0.45)' } }, '■ 停止'),
                    )
                  : h(
                      'button',
                      { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: () => handleStartOneClickPipeline(), style: { ...goldBtnStyle, padding: '4px 12px', fontSize: '11px', borderRadius: '999px' } },
                      h(Icon, { name: 'zap', size: 12 }),
                      '回作战大屏一键出片',
                    ),
              ),
            )
          : null,
      )

      const statusBanner =
        busyLabel || toast
          ? h(
              'div',
              {
                style: {
                  padding: '8px 20px',
                  background: busyLabel
                    ? T.accentBlueBg
                    : toast?.type === 'error'
                      ? T.accentRedBg
                      : toast?.type === 'success'
                        ? T.accentGreenBg
                        : T.accentGoldBg,
                  borderBottom: `1px solid ${T.borderSubtle}`,
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                },
              },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 } },
                h('span', { style: { fontWeight: 600 } }, busyLabel || toast.message),
                busyLabel && busyProgress > 0
                  ? h(
                      'div',
                      { style: { flex: '0 0 180px', height: '5px', borderRadius: '99px', background: 'rgba(128,128,128,0.25)', overflow: 'hidden' } },
                      h('div', { style: { width: `${busyProgress}%`, height: '100%', background: T.accentBlue } }),
                    )
                  : null,
              ),
              !busyLabel && toast
                ? h(
                    'button',
                    { onClick: () => setToast(null), style: { background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer' } },
                    h(Icon, { name: 'x', size: 13 }),
                  )
                : null,
            )
          : null

      // -----------------------------------------------------------------------
      // STEP 0 (DEFAULT HOME): AI AGENT 团队数字信息作战大屏 (MISSION CONTROL WAR ROOM)
      // -----------------------------------------------------------------------
      const taskStatusStyle = (st) => {
        if (st === 'running') return { label: '运行中', color: T.accentBlue, bg: T.accentBlueBg }
        if (st === 'paused') return { label: '已暂停', color: T.accentGold, bg: T.accentGoldBg }
        if (st === 'completed') return { label: '已完成', color: T.accentGreen, bg: T.accentGreenBg }
        if (st === 'stopped') return { label: '已停止', color: T.textMuted, bg: T.bgElevated }
        if (st === 'failed') return { label: '异常', color: T.accentRed, bg: T.accentRedBg }
        return { label: '等待中', color: T.textSecondary, bg: T.bgElevated }
      }

      const mountedBgmItem =
        projectAssets.find((a) => a.path === script?.bgm?.uploadedPath) ||
        projectAssets.find((a) => a.role === 'music')
      const specialRoleCount = projectAssets.filter((a) => ['host_video', 'avatar_base', 'voice_clone'].includes(a.role)).length

      const warRoomFuiCard = {
        ...panelStyle,
        borderColor: hasLiveTask ? T.accentBlueBorder : T.borderStrong,
        boxShadow: hasLiveTask
          ? `${T.shadowCard}, 0 0 28px rgba(34, 211, 238, 0.14)`
          : T.shadowCard,
      }

      const warRoomView = h(
        'div',
        {
          style: {
            position: 'relative',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        },
        h(
          'div',
          {
            style: {
              position: 'relative',
              zIndex: 1,
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: '266px minmax(0, 1fr) 316px',
              gap: '12px',
              padding: '12px 14px',
              overflow: 'hidden',
            },
          },
          // LEFT WING: Consolidated 5-Channel Intake · Camera Teleprompter · Asset Telemetry · Live DSP Spectrum
          h(
            'aside',
            {
              className: 'dsh-vw-fui-card dsh-vw-scroll',
              onDragOver: (ev) => {
                ev.preventDefault()
                setIsDragging(true)
              },
              onDragLeave: () => setIsDragging(false),
              onDrop: (ev) => {
                ev.preventDefault()
                setIsDragging(false)
                handleUploadFiles(ev.dataTransfer?.files)
              },
              style: {
                ...warRoomFuiCard,
                padding: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: '11px',
                overflowY: 'auto',
                minHeight: 0,
                borderStyle: isDragging ? 'dashed' : 'solid',
                borderColor: isDragging ? T.accentGold : warRoomFuiCard.borderColor,
              },
            },
            h('div', { className: 'dsh-vw-reticle dsh-vw-reticle-tl', style: { borderColor: T.accentBlue } }),
            h('div', { className: 'dsh-vw-reticle dsh-vw-reticle-tr', style: { borderColor: T.accentBlue } }),

            // Wing Title + Jump to Step 1 Detail
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h(
                'div',
                null,
                h('div', { style: { fontSize: '10px', fontFamily: 'Consolas, monospace', letterSpacing: '0.1em', color: T.accentBlue, fontWeight: 800 } }, 'SUPPLY & TELEMETRY'),
                h('div', { style: { fontSize: '14px', fontWeight: 800 } }, '📦 统一素材补给仓'),
              ),
              h(
                'button',
                {
                  className: 'dsh-vw-btn',
                  onClick: () => setActiveStep(1),
                  style: { ...ghostBtnStyle, padding: '4px 8px', fontSize: '11px' },
                },
                '清单精修 →',
              ),
            ),

            // 2x3 Consolidated Material Intake Matrix
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' } },
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => fileInputRef.current?.click(), style: { ...blueBtnStyle, padding: '8px 6px', fontSize: '11.5px', justifyContent: 'center' } },
                h(Icon, { name: 'upload', size: 13 }),
                '图片/视频',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => folderInputRef.current?.click(), style: { ...ghostBtnStyle, padding: '8px 6px', fontSize: '11.5px', justifyContent: 'center' } },
                h(Icon, { name: 'folder', size: 13 }),
                '批量文件夹',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => bgmInputRef.current?.click(), style: { ...ghostBtnStyle, padding: '8px 6px', fontSize: '11.5px', justifyContent: 'center', borderColor: T.accentGoldBorder, color: T.accentGold } },
                '🎵 BGM 配乐',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => avatarBaseInputRef.current?.click(), style: { ...ghostBtnStyle, padding: '8px 6px', fontSize: '11.5px', justifyContent: 'center', borderColor: T.accentBlueBorder, color: T.accentBlue } },
                h(Icon, { name: 'avatar', size: 13 }),
                '数字人底板',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => voiceCloneInputRef.current?.click(), style: { ...ghostBtnStyle, padding: '8px 6px', fontSize: '11.5px', justifyContent: 'center' } },
                h(Icon, { name: 'mic', size: 12 }),
                '克隆声纹',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => setShowVendorModal(true), style: { ...ghostBtnStyle, padding: '8px 6px', fontSize: '11.5px', justifyContent: 'center' } },
                '✨ .motion',
              ),
            ),

            // Promoted Webcam Teleprompter Studio Trigger
            h(
              'button',
              {
                className: 'dsh-vw-btn',
                onClick: () => {
                  setShowTeleprompter(true)
                  setActiveStep(1)
                },
                style: {
                  ...ghostBtnStyle,
                  width: '100%',
                  padding: '9px 10px',
                  fontSize: '12px',
                  justifyContent: 'space-between',
                  background: resolvedDark ? 'rgba(34, 211, 238, 0.08)' : 'rgba(2, 132, 199, 0.07)',
                  borderColor: T.accentBlueBorder,
                  color: T.accentBlue,
                },
              },
              h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, h(Icon, { name: 'camera', size: 14 }), '📹 打开提词器摄像头拍摄棚'),
              h('span', { style: { fontSize: '10px', opacity: 0.8 } }, '去录制 →'),
            ),

            // Live Asset Counters Matrix
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' } },
              [
                { k: '视觉素材', v: (assetSummary.image || 0) + (assetSummary.video || 0), tone: T.accentBlue },
                { k: 'BGM/声纹', v: (mountedBgmItem ? 1 : 0) + specialRoleCount, tone: T.accentGold },
                { k: '分镜幕数', v: script?.scenes?.length || 0, tone: T.accentGreen },
              ].map((st) =>
                h(
                  'div',
                  {
                    key: st.k,
                    style: {
                      padding: '8px 6px',
                      borderRadius: '9px',
                      background: T.bgElevated,
                      border: `1px solid ${T.borderSubtle}`,
                      textAlign: 'center',
                    },
                  },
                  h('div', { style: { fontSize: '16px', fontWeight: 900, fontFamily: 'Consolas, monospace', color: st.tone } }, st.v),
                  h('div', { style: { fontSize: '10px', color: T.textMuted, marginTop: '2px' } }, st.k),
                ),
              ),
            ),

            // Mounted Resource Feed
            h(
              'div',
              {
                style: {
                  padding: '9px 10px',
                  borderRadius: '9px',
                  background: T.bgElevated,
                  border: `1px solid ${T.borderSubtle}`,
                  fontSize: '11px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                },
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('span', { style: { color: T.textMuted } }, '挂载配乐'),
                h('span', { style: { fontWeight: 700, color: mountedBgmItem ? T.accentGreen : T.textSecondary, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, mountedBgmItem ? mountedBgmItem.name : directorForm.bgmMode === 'llm-coded' ? 'AI 代码现写配乐' : '待导入'),
              ),
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('span', { style: { color: T.textMuted } }, '数字人口播'),
                h('span', { style: { fontWeight: 700, color: avatarCfg.enabled ? T.accentBlue : T.textSecondary } }, avatarCfg.enabled ? `${avatarCfg.mode === 'cloned-human' ? '克隆真人' : 'AI 数字人'} · 已激活` : '按需关闭'),
              ),
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('span', { style: { color: T.textMuted } }, 'TTS 声纹库'),
                h('span', { style: { fontWeight: 700, color: ttsStatus.ready ? T.accentGreen : T.accentGold } }, `IndexTTS-2.5 · ${voiceCatalog.length} 音色`),
              ),
            ),

            // Live Animated DSP Audio & Signal Waveform Card
            h(
              'div',
              {
                style: {
                  marginTop: 'auto',
                  padding: '9px 10px',
                  borderRadius: '10px',
                  background: resolvedDark ? 'rgba(5, 9, 18, 0.72)' : 'rgba(241, 245, 251, 0.9)',
                  border: `1px solid ${hasLiveTask ? T.accentBlueBorder : T.borderSubtle}`,
                },
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' } },
                h('span', { style: { fontSize: '10px', fontFamily: 'Consolas, monospace', fontWeight: 800, color: hasLiveTask ? T.accentBlue : T.textMuted } }, hasLiveTask ? '● DSP SIGNAL LOCKED' : '◆ ACOUSTIC SPECTRUM IDLE'),
                h('span', { style: { fontSize: '10px', fontFamily: 'Consolas, monospace', color: T.accentGold } }, `${curW}×${curH}`),
              ),
              h(AudioWaveformCanvas, { active: hasLiveTask || Boolean(busyLabel), isPlaying, dark: resolvedDark }),
            ),
          ),

          // CENTER STAGE (>50% focal core): Constellation Battle Map <-> Live MP4 / HTML5 Cinema Monitor
          h(
            'section',
            {
              className: 'dsh-vw-fui-card',
              style: {
                ...warRoomFuiCard,
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
              },
            },
            // Stage Switcher Header
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
              h(
                'div',
                {
                  style: {
                    display: 'inline-flex',
                    padding: '3px',
                    borderRadius: '999px',
                    background: T.bgInput,
                    border: `1px solid ${T.borderStrong}`,
                  },
                },
                [
                  { id: 'map', label: '✦ Agent 星图作战态势' },
                  { id: 'monitor', label: hasMp4 ? '🎞 实时成片监看台 (MP4就绪)' : '🎞 实时成片监看台' },
                ].map((tb) => {
                  const on = warCenterTab === tb.id
                  return h(
                    'button',
                    {
                      key: tb.id,
                      className: 'dsh-vw-btn',
                      onClick: () => setWarCenterTab(tb.id),
                      style: {
                        padding: '5px 13px',
                        borderRadius: '999px',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: on ? 800 : 500,
                        background: on ? (tb.id === 'map' ? T.accentBlueBg : T.accentGoldBg) : 'transparent',
                        color: on ? (tb.id === 'map' ? T.accentBlue : T.accentGold) : T.textSecondary,
                      },
                    },
                    tb.label,
                  )
                }),
              ),
              // Live Telemetry Badges
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11px', fontFamily: 'Consolas, monospace' } },
                h(
                  'span',
                  {
                    style: {
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: hasLiveTask ? T.accentBlueBg : T.bgElevated,
                      color: hasLiveTask ? T.accentBlue : T.textSecondary,
                      border: `1px solid ${hasLiveTask ? T.accentBlueBorder : T.borderSubtle}`,
                    },
                  },
                  hasLiveTask
                    ? `MISSION ${Math.round(Number(currentTaskRun?.progress || 0))}% · ${Math.round(Number(currentTaskRun?.elapsedMs || 0) / 1000)}s`
                    : `ENGINE: ${String(script?.engine || directorForm.engine || 'remotion').toUpperCase()}`,
                ),
                h(
                  'button',
                  {
                    className: 'dsh-vw-btn',
                    onClick: () => setActiveStep(3),
                    style: { ...ghostBtnStyle, padding: '4px 10px', fontSize: '11px' },
                  },
                  '打开三轨时间轴 →',
                ),
              ),
            ),

            // Center Stage Main Viewport
            warCenterTab === 'map'
              ? h(WarRoomConstellationStage, {
                  agents: hudAgents,
                  activeRun: currentTaskRun,
                  hasMp4,
                  previewHtmlUrl,
                  avatarEnabled: avatarCfg.enabled,
                  dark: resolvedDark,
                  T,
                  onJumpStep: (st) => setActiveStep(st),
                  onSwitchToMonitor: () => setWarCenterTab('monitor'),
                })
              : h(
                  'div',
                  {
                    style: {
                      flex: 1,
                      minHeight: 0,
                      borderRadius: '12px',
                      background: T.monitorShell,
                      border: `1px solid ${T.borderStrong}`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '14px',
                      position: 'relative',
                      overflow: 'hidden',
                    },
                  },
                  mp4Url
                    ? h('video', {
                        key: mp4Url,
                        src: mp4Url,
                        controls: true,
                        playsInline: true,
                        preload: 'auto',
                        style: {
                          maxWidth: '100%',
                          maxHeight: '100%',
                          borderRadius: '8px',
                          aspectRatio: `${curW} / ${curH}`,
                          boxShadow: '0 20px 50px rgba(0,0,0,0.65)',
                        },
                      })
                    : previewHtmlUrl && (script?.scenes?.length || 0) > 0
                      ? h('iframe', {
                          ref: iframeRef,
                          src: previewHtmlUrl,
                          style: {
                            height: isPortraitVideo ? '100%' : 'auto',
                            width: isPortraitVideo ? 'auto' : '100%',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            aspectRatio: `${curW} / ${curH}`,
                            border: 'none',
                            borderRadius: '8px',
                            background: '#000',
                          },
                          onLoad: () => seekToFrame(currentFrame, false),
                        })
                      : h(
                          'div',
                          { style: { textAlign: 'center', color: '#9CA3B5', padding: '32px' } },
                          h('div', { style: { fontSize: '14px', fontWeight: 700, color: '#E2E8F0', marginBottom: '6px' } }, '成片监看台待命'),
                          h('div', { style: { fontSize: '12px' } }, '点击右侧「⚡ 一键启动 AI Agent 团队全自动出片」或「极速演练出片」，合成后即可在此直接预览 MP4 与动态分镜。'),
                        ),
                ),
          ),

          // RIGHT WING: Zero-Barrier One-Click Launch Cockpit + Live Subtask & Telemetry Log Terminal
          h(
            'aside',
            {
              className: 'dsh-vw-fui-card',
              style: {
                ...warRoomFuiCard,
                padding: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                minHeight: 0,
                overflow: 'hidden',
              },
            },
            h('div', { className: 'dsh-vw-reticle dsh-vw-reticle-bl', style: { borderColor: T.accentGold } }),
            h('div', { className: 'dsh-vw-reticle dsh-vw-reticle-br', style: { borderColor: T.accentGold } }),

            // Header + Presets
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
              h('span', { style: { fontSize: '12.5px', fontWeight: 800, color: T.accentGold } }, '⚡ 一键协同出片控制台'),
              h(
                'div',
                { style: { display: 'flex', gap: '4px' } },
                TOPIC_PRESETS.map((pr) =>
                  h(
                    'button',
                    {
                      key: pr.label,
                      className: 'dsh-vw-btn',
                      onClick: () => setDirectorForm((prev) => ({ ...prev, topic: pr.topic })),
                      style: { ...ghostBtnStyle, padding: '2px 7px', fontSize: '10px' },
                    },
                    pr.label.slice(0, 3),
                  ),
                ),
              ),
            ),

            // Creative Topic Box
            h('textarea', {
              rows: 3,
              value: directorForm.topic,
              onChange: (ev) => setDirectorForm((prev) => ({ ...prev, topic: ev.target.value })),
              placeholder: '输入视频主题、卖点或旁白需求；左侧导入素材后，AI 团队将自动剪辑、配音、合成动效并输出 MP4...',
              style: { ...inputStyle, fontSize: '12px', padding: '8px 10px', resize: 'none', lineHeight: 1.48 },
            }),

            // Compact 2x2 Tactile Spec Selectors
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' } },
              h(
                'select',
                {
                  value: directorForm.aspectRatio,
                  onChange: (ev) => setDirectorForm((prev) => ({ ...prev, aspectRatio: ev.target.value })),
                  style: { ...inputStyle, padding: '6px 8px', fontSize: '11.5px' },
                },
                ASPECT_RATIO_OPTIONS.map((ar) => h('option', { key: ar.id, value: ar.id }, `${ar.icon} ${ar.label}`)),
              ),
              h(
                'select',
                {
                  value: directorForm.quality,
                  onChange: (ev) => setDirectorForm((prev) => ({ ...prev, quality: ev.target.value })),
                  style: { ...inputStyle, padding: '6px 8px', fontSize: '11.5px' },
                },
                QUALITY_OPTIONS.map((q) => h('option', { key: q.id, value: q.id }, q.label)),
              ),
              h(
                'select',
                {
                  value: avatarCfg.enabled ? avatarCfg.mode : 'off',
                  onChange: (ev) => {
                    const val = ev.target.value
                    if (val === 'off') setAvatarCfg((prev) => ({ ...prev, enabled: false }))
                    else setAvatarCfg((prev) => ({ ...prev, enabled: true, mode: val }))
                  },
                  style: { ...inputStyle, padding: '6px 8px', fontSize: '11.5px' },
                },
                h('option', { value: 'off' }, '数字人: 关闭'),
                h('option', { value: 'ai-human' }, '🤖 AI 数字人'),
                h('option', { value: 'cloned-human' }, '👤 克隆真人'),
              ),
              h(
                'select',
                {
                  value: directorForm.bgmMode,
                  onChange: (ev) => setDirectorForm((prev) => ({ ...prev, bgmMode: ev.target.value })),
                  style: { ...inputStyle, padding: '6px 8px', fontSize: '11.5px' },
                },
                h('option', { value: 'llm-coded' }, 'BGM: AI代码配乐'),
                h('option', { value: 'uploaded' }, `BGM: 个人上传`),
                h('option', { value: 'tts-engine' }, 'BGM: TTS氛围'),
              ),
            ),

            // Signature Reactor Plasma CTA Button
            h(
              'button',
              {
                className: 'dsh-vw-btn dsh-vw-reactor-btn',
                disabled: Boolean(busyLabel),
                onClick: () => handleStartOneClickPipeline('', { stayOnCurrentTab: true }),
                style: {
                  ...goldBtnStyle,
                  width: '100%',
                  padding: '11px 14px',
                  fontSize: '13px',
                  boxShadow: resolvedDark
                    ? '0 0 26px rgba(229, 169, 60, 0.32)'
                    : '0 8px 20px rgba(15, 23, 42, 0.2)',
                },
              },
              h(Icon, { name: 'zap', size: 15 }),
              llmConfig?.configured ? '⚡ 一键启动 AI Agent 团队出片' : '连接模型后 · ⚡ 一键全自动出片',
            ),

            // Secondary Fast Draft + Live Kill / Pause Switch Row
            h(
              'div',
              { style: { display: 'flex', gap: '6px' } },
              h(
                'button',
                {
                  className: 'dsh-vw-btn',
                  disabled: Boolean(busyLabel),
                  onClick: () => handleStartOneClickPipeline('schema-plan', { stayOnCurrentTab: true }),
                  style: { ...ghostBtnStyle, flex: 1, padding: '6px 8px', fontSize: '11px', justifyContent: 'center' },
                },
                '🎞 极速演练 (免大模型)',
              ),
              currentTaskRun && (currentTaskRun.status === 'running' || currentTaskRun.status === 'paused')
                ? h(
                    React.Fragment,
                    null,
                    h(
                      'button',
                      {
                        className: 'dsh-vw-btn',
                        onClick: () => handleTaskControl(currentTaskRun.status === 'paused' ? 'resume' : 'pause', currentTaskRun.id),
                        style: { ...ghostBtnStyle, padding: '6px 9px', fontSize: '11px', color: T.accentGold, borderColor: T.accentGoldBorder },
                      },
                      currentTaskRun.status === 'paused' ? '▶ 恢复' : '⏸ 暂停',
                    ),
                    h(
                      'button',
                      {
                        className: 'dsh-vw-btn',
                        onClick: () => handleTaskControl('stop', currentTaskRun.id),
                        style: { ...ghostBtnStyle, padding: '6px 9px', fontSize: '11px', color: T.accentRed, borderColor: 'rgba(244,63,94,0.45)' },
                      },
                      '■ 急停',
                    ),
                  )
                : h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      onClick: () => {
                        setActiveStep(5)
                        fetchTaskRuns()
                      },
                      style: { ...ghostBtnStyle, padding: '6px 9px', fontSize: '11px' },
                    },
                    '全量日志',
                  ),
            ),

            // Live Subtask Meters + Streaming Telemetry Terminal
            h(
              'div',
              { style: { flex: 1, minHeight: '130px', display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden', borderTop: `1px solid ${T.borderSubtle}`, paddingTop: '9px' } },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('span', { style: { fontSize: '10.5px', fontWeight: 800, color: T.accentBlue, fontFamily: 'Consolas, monospace' } }, 'LIVE TELEMETRY & LOG STREAM'),
                h('span', { style: { fontSize: '10px', color: T.textMuted, fontFamily: 'Consolas, monospace' } }, currentTaskRun ? currentTaskRun.status.toUpperCase() : 'STANDBY'),
              ),
              (currentTaskRun?.tasks || []).length > 0
                ? h(
                    'div',
                    { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '5px' } },
                    (currentTaskRun.tasks || []).slice(0, 6).map((tk) => {
                      const st = taskStatusStyle(tk.status)
                      return h(
                        'div',
                        {
                          key: tk.id,
                          style: {
                            minWidth: 0,
                            overflow: 'hidden',
                            padding: '5px 7px',
                            borderRadius: '7px',
                            background: T.bgElevated,
                            border: `1px solid ${tk.status === 'running' ? T.accentBlueBorder : T.borderSubtle}`,
                            fontSize: '10px',
                          },
                        },
                        h(
                          'div',
                          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', fontWeight: 700, minWidth: 0 } },
                          h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, tk.name),
                          h('span', { style: { flexShrink: 0, color: st.color, fontFamily: 'Consolas, monospace' } }, `${Math.round(Number(tk.progress || 0))}%`),
                        ),
                        h(
                          'div',
                          { style: { marginTop: '4px', height: '3px', borderRadius: '99px', background: 'rgba(128,128,128,0.2)', overflow: 'hidden' } },
                          h('div', { style: { width: `${Math.round(Number(tk.progress || 0))}%`, height: '100%', background: st.color } }),
                        ),
                      )
                    }),
                  )
                : null,
              h(
                'div',
                {
                  className: 'dsh-vw-scroll',
                  style: {
                    flex: 1,
                    minHeight: '72px',
                    overflowY: 'auto',
                    padding: '8px 9px',
                    borderRadius: '9px',
                    background: resolvedDark ? 'rgba(4, 7, 13, 0.86)' : '#0B1220',
                    border: `1px solid ${hasLiveTask ? T.accentBlueBorder : 'rgba(255,255,255,0.12)'}`,
                    fontFamily: 'Consolas, monospace',
                    fontSize: '10.5px',
                    lineHeight: 1.55,
                    color: '#CBD5E1',
                  },
                },
                (currentTaskRun?.logs || []).length > 0
                  ? (currentTaskRun.logs || []).slice(-22).map((lg, idx) =>
                      h(
                        'div',
                        {
                          key: idx,
                          style: { color: lg.level === 'error' ? '#FB7185' : lg.level === 'warn' ? '#FBBF24' : '#BAE6FD' },
                        },
                        `[${lg.ts ? new Date(lg.ts).toLocaleTimeString('zh-CN', { hour12: false }) : '--:--:--'}] [${lg.stage || 'swarm'}] ${lg.message}`,
                      ),
                    )
                  : h('div', { style: { color: '#64748B' } }, '> 5 大 AI Agent 已就位，等待触发协同指令...\n> 点击上方【极速演练】或【⚡ 一键启动】即可观察实时协同星图与终端推演日志。'),
              ),
            ),
          ),
        ),
      )

      // -----------------------------------------------------------------------
      // STEP 1: UNIFIED ASSET FUNNEL + TELEPROMPTER STUDIO + ONE-CLICK PIPELINE
      // -----------------------------------------------------------------------
      const step1View = h(
        'div',
        { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '22px 28px' } },
        h(
          'div',
          { style: { maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' } },
          // Top Title Row
          h(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' } },
            h(
              'div',
              null,
              h('h2', { style: { fontSize: '21px', fontWeight: 800, margin: 0, letterSpacing: '0.01em' } }, '01 · 项目创建与统一素材拍摄中心'),
              h('p', { style: { margin: '5px 0 0', fontSize: '12.5px', color: T.textSecondary } }, '把画面素材、个人 BGM 配乐、数字人底板、声纹干声与真人提词出镜全部收口于此。填完主题即可点击「⚡ 一键全自动出片」。'),
            ),
            h(
              'button',
              { className: 'dsh-vw-btn', onClick: () => setActiveStep(2), style: ghostBtnStyle },
              '下一步：精细调节导演/数字人/混音 →',
            ),
          ),

          // CARD A: Hero Topic + Quick Settings + ⚡ One-Click Multi-Agent Launchpad
          h(
            'div',
            {
              style: {
                ...panelStyle,
                padding: '18px 20px',
                borderColor: T.accentBlueBorder,
                background: resolvedDark
                  ? 'linear-gradient(135deg, rgba(13,17,26,0.88), rgba(16,26,42,0.78))'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.92), rgba(240,247,255,0.88))',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.35fr) minmax(300px, 0.9fr)',
                gap: '18px',
                alignItems: 'stretch',
              },
            },
            h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: '9px' } },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
                h('label', { style: { fontSize: '13px', fontWeight: 800, color: T.accentBlue } }, '⚡ 核心视频创意 / 口播主题'),
                h(
                  'div',
                  { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' } },
                  TOPIC_PRESETS.map((pr) =>
                    h(
                      'button',
                      {
                        key: pr.label,
                        className: 'dsh-vw-btn',
                        onClick: () => setDirectorForm((prev) => ({ ...prev, topic: pr.topic })),
                        style: { ...ghostBtnStyle, padding: '3px 9px', fontSize: '11px' },
                      },
                      pr.label,
                    ),
                  ),
                ),
              ),
              h('textarea', {
                rows: 3,
                value: directorForm.topic,
                onChange: (ev) => setDirectorForm((prev) => ({ ...prev, topic: ev.target.value })),
                placeholder: '输入你想创作的视频主题、产品卖点或口播文案重点；若已导入素材，4 大 AI Agent 会自动配合素材写出代码成片...',
                style: { ...inputStyle, resize: 'vertical', lineHeight: 1.55, flex: 1 },
              }),
              // Quick Specs Row
              h(
                'div',
                { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
                h(
                  'select',
                  {
                    value: directorForm.aspectRatio,
                    onChange: (ev) => setDirectorForm((prev) => ({ ...prev, aspectRatio: ev.target.value })),
                    style: { ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: '12px' },
                  },
                  ASPECT_RATIO_OPTIONS.map((ar) => h('option', { key: ar.id, value: ar.id }, `${ar.icon} ${ar.label}`)),
                ),
                h(
                  'select',
                  {
                    value: directorForm.quality,
                    onChange: (ev) => setDirectorForm((prev) => ({ ...prev, quality: ev.target.value })),
                    style: { ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: '12px' },
                  },
                  QUALITY_OPTIONS.map((q) => h('option', { key: q.id, value: q.id }, `${q.label}`)),
                ),
                h(
                  'select',
                  {
                    value: avatarCfg.enabled ? avatarCfg.mode : 'off',
                    onChange: (ev) => {
                      const val = ev.target.value
                      if (val === 'off') setAvatarCfg((prev) => ({ ...prev, enabled: false }))
                      else setAvatarCfg((prev) => ({ ...prev, enabled: true, mode: val }))
                    },
                    style: { ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: '12px' },
                  },
                  h('option', { value: 'off' }, '数字人: 不启用'),
                  h('option', { value: 'ai-human' }, '🤖 启用纯 AI 数字人出镜'),
                  h('option', { value: 'cloned-human' }, '👤 启用克隆真人数字人'),
                ),
                h(
                  'select',
                  {
                    value: directorForm.bgmMode,
                    onChange: (ev) => setDirectorForm((prev) => ({ ...prev, bgmMode: ev.target.value })),
                    style: { ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: '12px' },
                  },
                  h('option', { value: 'llm-coded' }, 'BGM: AI 现写代码配乐'),
                  h('option', { value: 'uploaded' }, `BGM: 个人上传 (${mountedBgmItem ? mountedBgmItem.name : '待导入'})`),
                  h('option', { value: 'tts-engine' }, 'BGM: IndexTTS 氛围垫底'),
                ),
              ),
            ),
            // Right Launchbox
            h(
              'div',
              {
                style: {
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: resolvedDark ? 'rgba(7, 9, 14, 0.62)' : 'rgba(255, 255, 255, 0.72)',
                  border: `1px solid ${T.accentGoldBorder}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '10px',
                },
              },
              h(
                'div',
                null,
                h('div', { style: { fontSize: '12.5px', fontWeight: 800, color: T.accentGold } }, '4 大 AI Agent 全自动协同作战流水线'),
                h('div', { style: { fontSize: '11px', color: T.textSecondary, marginTop: '4px', lineHeight: 1.5 } }, '依次驱动「策划导演 → 素材剪辑 → 配音混音(含数字人) → 动效自检 MP4」，全过程可随时在顶部 HUD 或任务中心暂停/急停/接管。'),
              ),
              h(
                'button',
                {
                  className: 'dsh-vw-btn',
                  disabled: Boolean(busyLabel),
                  onClick: () => handleStartOneClickPipeline(),
                  style: {
                    ...goldBtnStyle,
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14px',
                    boxShadow: resolvedDark ? '0 8px 24px rgba(229, 169, 60, 0.25)' : '0 8px 20px rgba(15, 23, 42, 0.16)',
                  },
                },
                h(Icon, { name: 'zap', size: 16 }),
                llmConfig?.configured ? '⚡ 一键全自动出片 (AI 团队协同)' : '配置大模型后 · ⚡ 一键全自动出片',
              ),
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
                h(
                  'button',
                  {
                    className: 'dsh-vw-btn',
                    disabled: Boolean(busyLabel),
                    onClick: () => handleStartOneClickPipeline('schema-plan'),
                    style: { ...ghostBtnStyle, justifyContent: 'center', fontSize: '11.5px' },
                  },
                  '🎞 极速演练出片 (免大模型)',
                ),
                h(
                  'button',
                  {
                    className: 'dsh-vw-btn',
                    onClick: () => setActiveStep(2),
                    style: { ...ghostBtnStyle, justifyContent: 'center', fontSize: '11.5px', borderColor: T.accentBlueBorder, color: T.accentBlue },
                  },
                  '🎛 进入分步精修模式 →',
                ),
              ),
            ),
          ),

          // CARD B: Unified 5-Channel Asset Funnel (Pictures, Videos, BGM Music, Avatar Base, Voice Clone, .motion)
          h(
            'div',
            {
              onDragOver: (ev) => {
                ev.preventDefault()
                setIsDragging(true)
              },
              onDragLeave: () => setIsDragging(false),
              onDrop: (ev) => {
                ev.preventDefault()
                setIsDragging(false)
                handleUploadFiles(ev.dataTransfer?.files)
              },
              style: {
                ...panelStyle,
                padding: '20px 22px',
                borderStyle: isDragging ? 'dashed' : 'solid',
                borderWidth: isDragging ? '2px' : '1px',
                borderColor: isDragging ? T.accentGold : T.borderSubtle,
              },
            },
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' } },
              h(
                'div',
                null,
                h('div', { style: { fontSize: '14.5px', fontWeight: 800 } }, '📦 统一素材导入与用途分类入口'),
                h('div', { style: { fontSize: '11.5px', color: T.textMuted, marginTop: '2px' } }, '支持直接拖拽文件到此处，或按用途一键导入；所有 BGM 音乐与声音克隆样本统一从此进入工程'),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px' } },
                mountedBgmItem
                  ? h('span', { style: { padding: '3px 9px', borderRadius: '999px', background: T.accentGreenBg, color: T.accentGreen, fontWeight: 700 } }, `🎵 已挂载 BGM: ${mountedBgmItem.name}`)
                  : h('span', { style: { padding: '3px 9px', borderRadius: '999px', background: T.bgElevated, color: T.textMuted } }, '未挂载个人 BGM'),
                specialRoleCount > 0
                  ? h('span', { style: { padding: '3px 9px', borderRadius: '999px', background: T.accentBlueBg, color: T.accentBlue, fontWeight: 700 } }, `👤 出镜/数字人/声纹 ×${specialRoleCount}`)
                  : null,
              ),
            ),
            // 6 Clear Channel Buttons
            h(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' } },
              h('button', { className: 'dsh-vw-btn', onClick: () => fileInputRef.current?.click(), style: blueBtnStyle }, h(Icon, { name: 'upload', size: 14 }), ' 图片/实拍视频素材'),
              h('button', { className: 'dsh-vw-btn', onClick: () => folderInputRef.current?.click(), style: ghostBtnStyle }, h(Icon, { name: 'folder', size: 14 }), ' 导入文件夹'),
              h('button', { className: 'dsh-vw-btn', onClick: () => bgmInputRef.current?.click(), style: { ...ghostBtnStyle, borderColor: T.accentGoldBorder, color: T.accentGold } }, '🎵 导入 BGM 背景音乐'),
              h('button', { className: 'dsh-vw-btn', onClick: () => avatarBaseInputRef.current?.click(), style: { ...ghostBtnStyle, borderColor: T.accentBlueBorder, color: T.accentBlue } }, h(Icon, { name: 'avatar', size: 14 }), ' 导入数字人/本人底板'),
              h('button', { className: 'dsh-vw-btn', onClick: () => voiceCloneInputRef.current?.click(), style: ghostBtnStyle }, h(Icon, { name: 'mic', size: 13 }), ' 导入克隆声音样本'),
              h('button', { className: 'dsh-vw-btn', onClick: () => setShowVendorModal(true), style: ghostBtnStyle }, '✨ 导入 .motion 动效片段'),
            ),
            // Path import w/ Role Selector
            h(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' } },
              h(
                'select',
                {
                  value: assetImportRole,
                  onChange: (ev) => setAssetImportRole(ev.target.value),
                  style: { ...inputStyle, width: '175px', padding: '8px 10px', fontSize: '12px' },
                },
                h('option', { value: '' }, '自动识别文件类型'),
                h('option', { value: 'visual' }, '标记为: 视觉分镜素材'),
                h('option', { value: 'music' }, '标记为: BGM 背景音乐'),
                h('option', { value: 'avatar_base' }, '标记为: 数字人底板'),
                h('option', { value: 'host_video' }, '标记为: 真人出镜镜头'),
                h('option', { value: 'voice_clone' }, '标记为: 声音克隆样本'),
                h('option', { value: 'sfx' }, '标记为: 音效素材'),
              ),
              h('input', {
                value: assetDirInput,
                onChange: (ev) => setAssetDirInput(ev.target.value),
                onKeyDown: (ev) => ev.key === 'Enter' && handleImportByPath(),
                placeholder: '或粘贴本机图片/视频/音乐/人像路径或文件夹绝对路径，回车批量导入...',
                style: { ...inputStyle, flex: 1, minWidth: '240px' },
              }),
              h('button', { className: 'dsh-vw-btn', onClick: handleImportByPath, style: ghostBtnStyle }, '路径导入'),
            ),

            // Toggle Header for Built-in Teleprompter + Camera Capture Studio
            h(
              'div',
              {
                style: {
                  borderTop: `1px solid ${T.borderSubtle}`,
                  paddingTop: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                },
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' } },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                  h('span', { style: { fontSize: '13.5px', fontWeight: 800 } }, '📹 现场真人出镜拍摄 · 可调速智能提词板'),
                  h('span', { style: { fontSize: '11px', color: T.textMuted } }, '没有现成出镜录像？直接调用电脑摄像头录制并保存至 assets/recordings/'),
                ),
                h(
                  'button',
                  {
                    className: 'dsh-vw-btn',
                    onClick: () => setShowTeleprompter((v) => !v),
                    style: showTeleprompter ? blueBtnStyle : { ...ghostBtnStyle, borderColor: T.accentBlueBorder, color: T.accentBlue },
                  },
                  h(Icon, { name: 'camera', size: 14 }),
                  showTeleprompter ? '收起提词拍摄棚' : '打开摄像头提词录制棚',
                ),
              ),

              showTeleprompter
                ? h(
                    'div',
                    {
                      style: {
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1.35fr) minmax(290px, 0.9fr)',
                        gap: '16px',
                        padding: '14px',
                        borderRadius: '12px',
                        background: resolvedDark ? 'rgba(5, 8, 14, 0.78)' : 'rgba(241, 245, 250, 0.9)',
                        border: `1px solid ${T.accentBlueBorder}`,
                      },
                    },
                    // Left: Webcam Video + Semi-Transparent Adjustable Teleprompter Overlay
                    h(
                      'div',
                      {
                        style: {
                          position: 'relative',
                          aspectRatio: '16 / 9',
                          background: '#030508',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          border: `1px solid ${camRecording ? T.accentRed : 'rgba(255,255,255,0.14)'}`,
                        },
                      },
                      camStreaming
                        ? h('video', {
                            ref: camVideoRef,
                            muted: true,
                            playsInline: true,
                            autoPlay: true,
                            style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' },
                          })
                        : h(
                            'div',
                            {
                              style: {
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                color: '#CBD5E1',
                                padding: '20px',
                                textAlign: 'center',
                              },
                            },
                            h(Icon, { name: 'camera', size: 30, color: T.accentBlue }),
                            h('div', { style: { fontSize: '13px', fontWeight: 700 } }, camError || '摄像头待开启 · 上方可叠加实时滚动口播提词板'),
                            h(
                              'button',
                              { className: 'dsh-vw-btn', onClick: handleStartWebcam, style: blueBtnStyle },
                              h(Icon, { name: 'camera', size: 14 }),
                              '开启摄像头与麦克风预览',
                            ),
                          ),
                      // Semi-transparent Teleprompter Overlay on top of Webcam
                      h(
                        'div',
                        {
                          ref: teleBoxRef,
                          className: 'dsh-vw-scroll',
                          style: {
                            position: 'absolute',
                            inset: '8% 6% 12% 6%',
                            background: `rgba(7, 9, 14, ${teleBgOpacity})`,
                            backdropFilter: 'blur(4px)',
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.14)',
                            overflowY: 'auto',
                            padding: '28% 22px 45% 22px',
                            pointerEvents: 'auto',
                          },
                        },
                        // Reading Eye-Level Guide Hairline
                        h('div', {
                          style: {
                            position: 'sticky',
                            top: '28%',
                            height: '2px',
                            background: 'linear-gradient(90deg, rgba(229,169,60,0.85), rgba(34,211,238,0.85))',
                            marginBottom: '12px',
                            pointerEvents: 'none',
                          },
                        }),
                        h(
                          'div',
                          {
                            style: {
                              color: '#F8FAFC',
                              fontSize: `${teleFontSize}px`,
                              lineHeight: teleLineHeight,
                              fontWeight: 700,
                              textShadow: '0 2px 10px rgba(0,0,0,0.9)',
                              whiteSpace: 'pre-wrap',
                              textAlign: 'center',
                              transform: teleMirror ? 'scaleX(-1)' : 'none',
                            },
                          },
                          teleLinesText || '请点击右侧「✨ AI 加载提词稿」或直接粘贴口播词...',
                        ),
                      ),
                      // Top-left Live REC Status Pill
                      camRecording
                        ? h(
                            'div',
                            {
                              style: {
                                position: 'absolute',
                                top: '10px',
                                left: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '7px',
                                padding: '4px 10px',
                                borderRadius: '999px',
                                background: 'rgba(225,29,72,0.88)',
                                color: '#fff',
                                fontSize: '12px',
                                fontWeight: 800,
                                fontFamily: 'Consolas, monospace',
                              },
                            },
                            h('span', { className: 'dsh-vw-rec-dot', style: { width: '8px', height: '8px', borderRadius: '50%', background: '#fff' } }),
                            `REC ${fmtTimecode(camSeconds * 30, 30)}`,
                          )
                        : null,
                    ),

                    // Right: Teleprompter Script + Scroll/Font/LineHeight/Mirror + Record Buttons
                    h(
                      'div',
                      { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
                      h(
                        'div',
                        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
                        h('span', { style: { fontSize: '12px', fontWeight: 700 } }, '口播提词文案（支持实时编辑）'),
                        h(
                          'div',
                          { style: { display: 'flex', gap: '6px' } },
                          h(
                            'button',
                            { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: handleGenerateTeleprompter, style: { ...ghostBtnStyle, padding: '4px 9px', fontSize: '11px', color: T.accentGold, borderColor: T.accentGoldBorder } },
                            '✨ AI 加载/生成提词稿',
                          ),
                          h(
                            'button',
                            {
                              className: 'dsh-vw-btn',
                              onClick: () => setTeleAutoScroll((v) => !v),
                              style: { ...ghostBtnStyle, padding: '4px 9px', fontSize: '11px', color: teleAutoScroll ? T.accentGreen : T.textPrimary },
                            },
                            teleAutoScroll ? '⏸ 暂停滚词' : '▶ 测试滚词',
                          ),
                          h(
                            'button',
                            {
                              className: 'dsh-vw-btn',
                              onClick: () => {
                                if (teleBoxRef.current) teleBoxRef.current.scrollTop = 0
                              },
                              style: { ...ghostBtnStyle, padding: '4px 8px', fontSize: '11px' },
                            },
                            '⟲ 归零',
                          ),
                        ),
                      ),
                      h('textarea', {
                        rows: 3,
                        value: teleLinesText,
                        onChange: (ev) => setTeleLinesText(ev.target.value),
                        style: { ...inputStyle, fontSize: '12px', resize: 'vertical', lineHeight: 1.5 },
                      }),
                      // 4 Real-time Sliders + Mirror Toggle
                      h(
                        'div',
                        { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' } },
                        h(
                          'label',
                          null,
                          `滚词速度: ${Number(teleScrollSpeed).toFixed(1)}x`,
                          h('input', { type: 'range', min: 0.3, max: 3.5, step: 0.1, value: teleScrollSpeed, onChange: (ev) => setTeleScrollSpeed(Number(ev.target.value)), style: { width: '100%' } }),
                        ),
                        h(
                          'label',
                          null,
                          `文字字号: ${teleFontSize}px`,
                          h('input', { type: 'range', min: 16, max: 48, step: 1, value: teleFontSize, onChange: (ev) => setTeleFontSize(Number(ev.target.value)), style: { width: '100%' } }),
                        ),
                        h(
                          'label',
                          null,
                          `行距倍数: ${Number(teleLineHeight).toFixed(2)}`,
                          h('input', { type: 'range', min: 1.2, max: 2.4, step: 0.05, value: teleLineHeight, onChange: (ev) => setTeleLineHeight(Number(ev.target.value)), style: { width: '100%' } }),
                        ),
                        h(
                          'label',
                          null,
                          `面板遮罩: ${Math.round(teleBgOpacity * 100)}%`,
                          h('input', { type: 'range', min: 0.15, max: 0.9, step: 0.05, value: teleBgOpacity, onChange: (ev) => setTeleBgOpacity(Number(ev.target.value)), style: { width: '100%' } }),
                        ),
                      ),
                      h(
                        'div',
                        { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '11.5px' } },
                        h(
                          'label',
                          { style: { display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' } },
                          h('input', { type: 'checkbox', checked: teleMirror, onChange: (ev) => setTeleMirror(ev.target.checked) }),
                          '🪞 提词文字镜面翻转',
                        ),
                        h(
                          'label',
                          { style: { display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' } },
                          h('input', { type: 'checkbox', checked: camExtractClone, onChange: (ev) => setCamExtractClone(ev.target.checked) }),
                          '🎤 同步提取声纹克隆',
                        ),
                      ),
                      h(
                        'div',
                        { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
                        h('span', { style: { fontSize: '11px', color: T.textMuted, whiteSpace: 'nowrap' } }, '保存角色:'),
                        h(
                          'select',
                          {
                            value: camTargetRole,
                            onChange: (ev) => setCamTargetRole(ev.target.value),
                            style: { ...inputStyle, padding: '6px 9px', fontSize: '12px' },
                          },
                          h('option', { value: 'host_video' }, '真人出镜镜头 (host_video)'),
                          h('option', { value: 'avatar_base' }, '克隆数字人底板 (avatar_base)'),
                        ),
                      ),
                      h(
                        'div',
                        { style: { display: 'flex', gap: '8px', marginTop: '2px' } },
                        !camStreaming
                          ? h('button', { className: 'dsh-vw-btn', onClick: handleStartWebcam, style: { ...blueBtnStyle, flex: 1 } }, '开启摄像头预览')
                          : h('button', { className: 'dsh-vw-btn', onClick: handleStopWebcam, style: ghostBtnStyle }, '关闭摄像头'),
                        camStreaming
                          ? !camRecording
                            ? h('button', { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: handleStartCamRecord, style: { ...goldBtnStyle, flex: 1 } }, '● 开始录制并滚词')
                            : h('button', { className: 'dsh-vw-btn', onClick: handleStopCamRecord, style: { ...goldBtnStyle, flex: 1, background: '#E11D48', color: '#fff' } }, `■ 停止保存 (${camSeconds}s)`)
                          : null,
                      ),
                    ),
                  )
                : null,
            ),
          ),

          // CARD C: Filter Tabs & Grid w/ Inline Role Switcher
          h(
            'div',
            { style: { ...panelStyle, padding: '18px' } },
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' } },
              h(
                'div',
                { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                [
                  { id: 'all', label: `全部 (${projectAssets.length})` },
                  { id: 'image', label: `图片 (${assetSummary.image || 0})` },
                  { id: 'video', label: `视频 (${assetSummary.video || 0})` },
                  { id: 'music', label: `BGM 配乐 (${assetSummary.music || 0})` },
                  { id: 'special', label: `出镜/数字人/声纹 (${specialRoleCount})` },
                ].map((tb) => {
                  const on = assetFilter === tb.id
                  return h(
                    'button',
                    {
                      key: tb.id,
                      className: 'dsh-vw-btn',
                      onClick: () => setAssetFilter(tb.id),
                      style: {
                        ...ghostBtnStyle,
                        padding: '5px 11px',
                        background: on ? T.accentGoldBg : 'transparent',
                        borderColor: on ? T.accentGoldBorder : T.borderSubtle,
                        color: on ? T.accentGold : T.textSecondary,
                      },
                    },
                    tb.label,
                  )
                }),
              ),
              h('span', { style: { fontSize: '11.5px', color: T.textMuted } }, '提示：素材精修后的成片放在 assets/edited/；可在每张卡片下方切换用途角色'),
            ),
            filteredAssets.length === 0
              ? h('div', { style: { padding: '24px', textAlign: 'center', color: T.textMuted, fontSize: '13px' } }, '暂未导入此类素材，可直接点击上方「⚡ 一键全自动出片」纯编码生成，或拖拽文件导入。')
              : h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(186px, 1fr))', gap: '12px' } },
                  filteredAssets.map((a) => {
                    const roleBadgeMap = {
                      host_video: { label: 'HOST 出镜', color: T.accentBlue },
                      avatar_base: { label: '数字人底板', color: T.accentGold },
                      voice_clone: { label: '克隆声纹', color: '#A855F7' },
                      music: { label: 'BGM 配乐', color: T.accentGreen },
                    }
                    const badge = roleBadgeMap[a.role]
                    return h(
                      'div',
                      {
                        key: a.id,
                        style: {
                          borderRadius: '10px',
                          overflow: 'hidden',
                          background: T.bgElevated,
                          border: `1px solid ${badge ? badge.color : T.borderSubtle}`,
                        },
                      },
                      h(
                        'div',
                        { style: { height: '104px', background: '#05070C', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
                        a.type === 'image'
                          ? h('img', {
                              src: `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=${encodeURIComponent(a.path)}&v=${assetVersion}`,
                              style: { width: '100%', height: '100%', objectFit: 'cover' },
                            })
                          : a.type === 'video'
                            ? h('video', {
                                src: `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=${encodeURIComponent(a.path)}&v=${assetVersion}`,
                                muted: true,
                                style: { width: '100%', height: '100%', objectFit: 'cover' },
                              })
                            : h('span', { style: { fontSize: '26px' } }, a.role === 'music' ? '🎵' : a.role === 'voice_clone' ? '🎤' : '🔊'),
                        badge
                          ? h(
                              'span',
                              {
                                style: {
                                  position: 'absolute',
                                  top: '6px',
                                  left: '6px',
                                  padding: '2px 6px',
                                  borderRadius: '5px',
                                  background: 'rgba(7,9,14,0.82)',
                                  color: badge.color,
                                  fontSize: '10px',
                                  fontWeight: 800,
                                },
                              },
                              badge.label,
                            )
                          : null,
                        h(
                          'button',
                          {
                            onClick: () => handleDeleteAsset(a.id),
                            style: {
                              position: 'absolute',
                              top: '6px',
                              right: '6px',
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              border: 'none',
                              background: 'rgba(0,0,0,0.65)',
                              color: '#fff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            },
                          },
                          h(Icon, { name: 'x', size: 11 }),
                        ),
                      ),
                      h(
                        'div',
                        { style: { padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '5px' } },
                        h('div', { style: { fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.name),
                        h(
                          'div',
                          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' } },
                          h(
                            'span',
                            { style: { fontSize: '10.5px', color: T.textMuted, fontFamily: 'Consolas, monospace' } },
                            a.width && a.height ? `${a.width}×${a.height}` : a.durationSec ? `${Number(a.durationSec).toFixed(1)}s` : a.type,
                          ),
                          h(
                            'select',
                            {
                              value: a.role || 'visual',
                              onChange: (ev) => handleChangeAssetRole(a.id, ev.target.value),
                              style: {
                                fontSize: '10.5px',
                                padding: '2px 5px',
                                borderRadius: '5px',
                                background: T.bgInput,
                                color: T.textSecondary,
                                border: `1px solid ${T.borderSubtle}`,
                              },
                            },
                            h('option', { value: 'visual' }, '视觉镜头'),
                            h('option', { value: 'music' }, 'BGM配乐'),
                            h('option', { value: 'sfx' }, '音效'),
                            h('option', { value: 'host_video' }, '真人出镜'),
                            h('option', { value: 'avatar_base' }, '数字人底板'),
                            h('option', { value: 'voice_clone' }, '声纹样本'),
                          ),
                        ),
                      ),
                    )
                  }),
                ),
          ),
        ),
      )

      // -----------------------------------------------------------------------
      // STEP 2: DIRECTOR STUDIO (Aspect Ratio + Resolution + Dual Track Creation)
      // -----------------------------------------------------------------------
      const selectedVoiceLabel =
        directorForm.voiceId === 'auto'
          ? '✨ AI 根据每幕情绪自动匹配 (推荐)'
          : voiceCatalog.find((v) => v.id === directorForm.voiceId)?.name || directorForm.voiceId

      const step2View = h(
        'div',
        { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '26px 32px' } },
        h(
          'div',
          { style: { maxWidth: '1060px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' } },
          h(
            'div',
            null,
            h('h2', { style: { fontSize: '21px', fontWeight: 800, margin: 0 } }, '02 · 导演构思 · 画幅比例与创作引擎'),
            h('p', { style: { margin: '5px 0 0', fontSize: '13px', color: T.textSecondary } }, '先设定主题与成片比例（支持 AI 智能判断或自由指定），您可先免费跑「本地演练草稿」确认素材节奏，再交给「大模型 AI 编程」写出电影级高定动画。'),
          ),
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '18px', alignItems: 'start' } },
            // LEFT COLUMN: Creative Prompt + Style + Engine
            h(
              'div',
              { style: { ...panelStyle, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' } },
              h(
                'div',
                null,
                h('label', { style: { display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '7px' } }, '你想创作什么主题的视频？（越具体，大模型写出的动效与字幕越惊艳）'),
                h('textarea', {
                  rows: 4,
                  value: directorForm.topic,
                  onChange: (ev) => setDirectorForm((prev) => ({ ...prev, topic: ev.target.value })),
                  placeholder: '例如：制作一个 30 秒高燃科技产品发布短片。开头黑金粒子聚拢，中间分屏展现 3 个核心实测指标从 0 飙升至 99%，最后全屏震撼号召落地。',
                  style: { ...inputStyle, resize: 'vertical', lineHeight: 1.55 },
                }),
                h(
                  'div',
                  { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } },
                  TOPIC_PRESETS.map((tp) =>
                    h(
                      'button',
                      {
                        key: tp.label,
                        className: 'dsh-vw-btn',
                        onClick: () => setDirectorForm((prev) => ({ ...prev, topic: tp.topic })),
                        style: { ...ghostBtnStyle, padding: '4px 10px', fontSize: '11px' },
                      },
                      `+ ${tp.label}`,
                    ),
                  ),
                ),
              ),
              h(
                'div',
                null,
                h('label', { style: { display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '8px' } }, '视觉基调与配乐气质'),
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' } },
                  STYLE_OPTIONS.map((st) => {
                    const on = directorForm.style === st.id
                    return h(
                      'button',
                      {
                        key: st.id,
                        className: 'dsh-vw-btn',
                        onClick: () => setDirectorForm((prev) => ({ ...prev, style: st.id })),
                        style: {
                          padding: '10px 6px',
                          borderRadius: '10px',
                          textAlign: 'center',
                          background: on ? T.accentGoldBg : T.bgElevated,
                          border: `1px solid ${on ? T.accentGoldBorder : T.borderSubtle}`,
                          color: T.textPrimary,
                        },
                      },
                      h('div', { style: { width: '16px', height: '4px', borderRadius: '99px', background: st.swatch, margin: '0 auto 6px' } }),
                      h('div', { style: { fontSize: '12px', fontWeight: 700 } }, st.label),
                    )
                  }),
                ),
              ),
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' } }, '渲染编程引擎'),
                  h(
                    'select',
                    {
                      value: directorForm.engine,
                      onChange: (ev) => setDirectorForm((prev) => ({ ...prev, engine: ev.target.value })),
                      style: inputStyle,
                    },
                    h('option', { value: 'remotion' }, 'Remotion TSX (AI 编程首选)'),
                    h('option', { value: 'html' }, 'HyperFrames HTML5/Canvas'),
                  ),
                ),
                h(
                  'div',
                  null,
                  h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' } }, '帧率 FPS & 合规角标'),
                  h(
                    'div',
                    { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
                    h(
                      'select',
                      {
                        value: directorForm.fps,
                        onChange: (ev) => setDirectorForm((prev) => ({ ...prev, fps: Number(ev.target.value) })),
                        style: { ...inputStyle, width: '96px' },
                      },
                      h('option', { value: 30 }, '30 fps'),
                      h('option', { value: 60 }, '60 fps'),
                    ),
                    h(
                      'label',
                      { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: T.textSecondary, cursor: 'pointer' } },
                      h('input', {
                        type: 'checkbox',
                        checked: directorForm.aiBadge,
                        onChange: (ev) => setDirectorForm((prev) => ({ ...prev, aiBadge: ev.target.checked })),
                      }),
                      '显示 AI 生成角标',
                    ),
                  ),
                ),
              ),
              // Creation Mode Selector (AI Coded vs Schema Plan w/ Tier 1-4 Degradation)
              h(
                'div',
                null,
                h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '7px' } }, '创作生成架构模式'),
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
                  CREATION_MODE_OPTIONS.map((cm) => {
                    const on = directorForm.creationMode === cm.id
                    return h(
                      'button',
                      {
                        key: cm.id,
                        className: 'dsh-vw-btn',
                        onClick: () => setDirectorForm((prev) => ({ ...prev, creationMode: cm.id })),
                        style: {
                          padding: '9px 10px',
                          borderRadius: '10px',
                          textAlign: 'left',
                          background: on ? T.accentBlueBg : T.bgElevated,
                          border: `1px solid ${on ? T.accentBlueBorder : T.borderSubtle}`,
                          color: T.textPrimary,
                        },
                      },
                      h('div', { style: { fontSize: '12px', fontWeight: 700, color: on ? T.accentBlue : T.textPrimary } }, cm.title),
                      h('div', { style: { fontSize: '10.5px', color: T.textMuted, marginTop: '2px', lineHeight: 1.35 } }, cm.desc),
                    )
                  }),
                ),
              ),
              // 3-Mode Audio / BGM Engine Card
              h(
                'div',
                { style: { padding: '12px', borderRadius: '11px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}`, display: 'flex', flexDirection: 'column', gap: '9px' } },
                h('label', { style: { fontSize: '12px', fontWeight: 800 } }, '🎵 背景音乐与声场生成方式 (三模式自由切换)'),
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px' } },
                  BGM_MODE_OPTIONS.map((bm) => {
                    const on = directorForm.bgmMode === bm.id
                    return h(
                      'button',
                      {
                        key: bm.id,
                        className: 'dsh-vw-btn',
                        onClick: () => setDirectorForm((prev) => ({ ...prev, bgmMode: bm.id })),
                        style: {
                          padding: '8px 7px',
                          borderRadius: '9px',
                          textAlign: 'left',
                          background: on ? T.accentGoldBg : T.bgPanel,
                          border: `1px solid ${on ? T.accentGoldBorder : T.borderSubtle}`,
                          color: T.textPrimary,
                        },
                      },
                      h('div', { style: { fontSize: '11.5px', fontWeight: 700, color: on ? T.accentGold : T.textPrimary } }, `${bm.icon} ${bm.title}`),
                      h('div', { style: { fontSize: '10px', color: T.textMuted, marginTop: '2px', lineHeight: 1.35 } }, bm.desc),
                    )
                  }),
                ),
                directorForm.bgmMode === 'llm-coded'
                  ? h(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
                      h('span', { style: { fontSize: '11px', color: T.textSecondary } }, '成片时大模型会自动编写 audio/ai_bgm_synth.js 生成原创音乐；也可先点击试写试听'),
                      h(
                        'button',
                        { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: handleLlmComposeBgm, style: { ...ghostBtnStyle, fontSize: '11px', padding: '5px 10px' } },
                        '🎹 AI 现写代码试生成 BGM',
                      ),
                    )
                  : directorForm.bgmMode === 'uploaded'
                  ? h(
                      'div',
                      { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                      h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
                        h(
                          'span',
                          { style: { fontSize: '11px', color: T.textSecondary } },
                          script?.bgm?.uploadedPath || script?.bgm?.path
                            ? `当前挂载 BGM: ${script.bgm.uploadedPath || script.bgm.path}`
                            : `已在第 1 步导入 ${assetSummary.music || 0} 首个人配乐（混音自动闪避人声）`,
                        ),
                        h(
                          'button',
                          { className: 'dsh-vw-btn', onClick: () => setActiveStep(1), style: { ...ghostBtnStyle, fontSize: '11px', padding: '4px 10px', borderColor: T.accentGoldBorder, color: T.accentGold } },
                          '← 前往第 1 步导入/更换 BGM',
                        ),
                      ),
                      projectAssets.filter((a) => a.type === 'audio' && a.role === 'music').length > 0
                        ? h(
                            'select',
                            {
                              value: script?.bgm?.uploadedPath || projectAssets.find((a) => a.role === 'music')?.path || '',
                              onChange: (ev) => {
                                const rel = ev.target.value
                                if (!rel || !script) return
                                setScript((prev) => ({
                                  ...prev,
                                  bgmMode: 'uploaded',
                                  bgm: { ...(prev?.bgm || {}), mode: 'uploaded', uploadedPath: rel, path: rel },
                                }))
                                setScriptDirty(true)
                              },
                              style: { ...inputStyle, padding: '6px 9px', fontSize: '11.5px' },
                            },
                            projectAssets
                              .filter((a) => a.type === 'audio' && a.role === 'music')
                              .map((m) => h('option', { key: m.id, value: m.path }, `🎵 ${m.name} (${m.path})`)),
                          )
                        : null,
                    )
                  : h(
                      'div',
                      { style: { display: 'flex', flexDirection: 'column', gap: '7px' } },
                      h(
                        'div',
                        { style: { display: 'flex', gap: '6px' } },
                        h('input', {
                          value: directorForm.bgmTtsPrompt,
                          onChange: (ev) => setDirectorForm((prev) => ({ ...prev, bgmTtsPrompt: ev.target.value })),
                          placeholder: '输入配音引擎要哼唱/氛围铺底的乐感提示词...',
                          style: { ...inputStyle, fontSize: '11.5px', padding: '6px 10px' },
                        }),
                        h(
                          'button',
                          { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: handleTtsComposeBgm, style: { ...blueBtnStyle, fontSize: '11px', padding: '6px 11px' } },
                          '🎙 IndexTTS 合成 BGM',
                        ),
                      ),
                    ),
                bgmComposePreviewUrl
                  ? h('audio', { src: bgmComposePreviewUrl, controls: true, style: { width: '100%', height: '32px' } })
                  : null,
              ),
            ),
            // RIGHT COLUMN: Aspect Ratio + Resolution + Voice + Dual-Track Action Buttons
            h(
              'div',
              { style: { ...panelStyle, padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' } },
              h(
                'div',
                null,
                h('label', { style: { display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '8px' } }, '画幅比例（AI 智能判定 或 自由指定）'),
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px' } },
                  ASPECT_RATIO_OPTIONS.map((ar) => {
                    const on = directorForm.aspectRatio === ar.id
                    return h(
                      'button',
                      {
                        key: ar.id,
                        className: 'dsh-vw-btn',
                        onClick: () => setDirectorForm((prev) => ({ ...prev, aspectRatio: ar.id })),
                        style: {
                          padding: '8px 8px',
                          borderRadius: '9px',
                          textAlign: 'left',
                          background: on ? T.accentBlueBg : T.bgElevated,
                          border: `1px solid ${on ? T.accentBlueBorder : T.borderSubtle}`,
                          color: T.textPrimary,
                        },
                      },
                      h('div', { style: { fontSize: '12px', fontWeight: 700, color: on ? T.accentBlue : T.textPrimary } }, `${ar.icon} ${ar.label}`),
                      h('div', { style: { fontSize: '10px', color: T.textMuted, marginTop: '2px' } }, ar.sub),
                    )
                  }),
                ),
              ),
              h(
                'div',
                null,
                h('label', { style: { display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '7px' } }, '输出分辨率规格'),
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' } },
                  QUALITY_OPTIONS.map((q) => {
                    const on = directorForm.quality === q.id
                    return h(
                      'button',
                      {
                        key: q.id,
                        className: 'dsh-vw-btn',
                        onClick: () => setDirectorForm((prev) => ({ ...prev, quality: q.id })),
                        style: {
                          padding: '7px 4px',
                          borderRadius: '8px',
                          textAlign: 'center',
                          background: on ? T.accentGoldBg : T.bgElevated,
                          border: `1px solid ${on ? T.accentGoldBorder : T.borderSubtle}`,
                          color: on ? T.accentGold : T.textPrimary,
                        },
                      },
                      h('div', { style: { fontSize: '12px', fontWeight: 700 } }, q.label),
                      h('div', { style: { fontSize: '10px', color: T.textMuted } }, q.desc),
                    )
                  }),
                ),
                directorForm.quality === 'custom' || directorForm.aspectRatio === 'custom'
                  ? h(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' } },
                      h('input', {
                        type: 'number',
                        value: directorForm.customWidth,
                        onChange: (ev) => setDirectorForm((prev) => ({ ...prev, customWidth: ev.target.value })),
                        placeholder: '宽度 px',
                        style: inputStyle,
                      }),
                      h('span', null, '×'),
                      h('input', {
                        type: 'number',
                        value: directorForm.customHeight,
                        onChange: (ev) => setDirectorForm((prev) => ({ ...prev, customHeight: ev.target.value })),
                        placeholder: '高度 px',
                        style: inputStyle,
                      }),
                    )
                  : null,
              ),
              // Platform Safe-Zone Selector
              h(
                'div',
                null,
                h(
                  'div',
                  { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' } },
                  h('label', { style: { fontSize: '13px', fontWeight: 700 } }, '目标发布平台（安全区自动避让）'),
                  safeZonePreflight
                    ? h(
                        'span',
                        { style: { fontSize: '10.5px', color: safeZonePreflight.passed ? T.accentGreen : T.accentGold } },
                        safeZonePreflight.passed ? '✓ 安全区校验通过' : `⚠ 字幕/贴片有 ${safeZonePreflight.collisions?.length || 1} 处靠边告警`,
                      )
                    : null,
                ),
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' } },
                  PLATFORM_OPTIONS.map((pl) => {
                    const on = directorForm.targetPlatform === pl.id
                    return h(
                      'button',
                      {
                        key: pl.id,
                        title: pl.desc,
                        className: 'dsh-vw-btn',
                        onClick: () => setDirectorForm((prev) => ({ ...prev, targetPlatform: pl.id })),
                        style: {
                          padding: '7px 4px',
                          borderRadius: '8px',
                          textAlign: 'center',
                          background: on ? T.accentBlueBg : T.bgElevated,
                          border: `1px solid ${on ? T.accentBlueBorder : T.borderSubtle}`,
                          color: on ? T.accentBlue : T.textPrimary,
                          fontSize: '11.5px',
                          fontWeight: 700,
                        },
                      },
                      pl.label,
                    )
                  }),
                ),
              ),
              // Voice Selection & Speed / Host Vocal / Curate Strip
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '11px 12px', borderRadius: '10px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}` } },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
                  h(
                    'div',
                    null,
                    h('div', { style: { fontSize: '11px', color: T.textMuted } }, '本地配音与声纹克隆库 (IndexTTS-2.5 · 自动修音/去静音/响度标准化)'),
                    h('div', { style: { fontSize: '12px', fontWeight: 700, marginTop: '2px' } }, selectedVoiceLabel),
                  ),
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      onClick: () => {
                        setVoiceModalTarget('global')
                        setShowVoiceModal(true)
                      },
                      style: ghostBtnStyle,
                    },
                    h(Icon, { name: 'mic', size: 12 }),
                    '挑选 / 克隆音色',
                  ),
                ),
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center', paddingTop: '6px', borderTop: `1px solid ${T.borderSubtle}` } },
                  h(
                    'label',
                    { style: { fontSize: '11px', color: T.textSecondary } },
                    `语速倍率 (${Number(speechTempo).toFixed(2)}x): `,
                    h('input', {
                      type: 'range',
                      min: 0.75,
                      max: 1.5,
                      step: 0.05,
                      value: speechTempo,
                      onChange: (ev) => setSpeechTempo(Number(ev.target.value)),
                      style: { width: '110px', verticalAlign: 'middle', marginLeft: '4px' },
                    }),
                  ),
                  h(
                    'label',
                    { style: { fontSize: '11px', color: T.textSecondary, display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' } },
                    h('input', {
                      type: 'checkbox',
                      checked: useHostVocal,
                      onChange: (ev) => setUseHostVocal(ev.target.checked),
                    }),
                    '使用真人出镜原声',
                  ),
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', paddingTop: '4px' } },
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      disabled: Boolean(busyLabel),
                      onClick: handleRunMediaCurate,
                      style: { ...ghostBtnStyle, fontSize: '11px', padding: '5px 10px' },
                    },
                    '✂️ 运行 FFmpeg 智能裁切构图与调色 (assets/edited/)',
                  ),
                  h(
                    'label',
                    { style: { fontSize: '11px', color: T.textSecondary, display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' } },
                    h('input', { type: 'checkbox', checked: aiAuthorCode, onChange: (ev) => setAiAuthorCode(ev.target.checked) }),
                    'AI 编写动效/音效源码',
                  ),
                ),
              ),

              // AI Digital Human & Cloned Avatar Studio (dsh-tool-avatar)
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '9px',
                    padding: '12px',
                    borderRadius: '10px',
                    background: avatarCfg.enabled ? T.accentBlueBg : T.bgElevated,
                    border: `1px solid ${avatarCfg.enabled ? T.accentBlueBorder : T.borderSubtle}`,
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
                  h(
                    'label',
                    { style: { display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', color: avatarCfg.enabled ? T.accentBlue : T.textPrimary } },
                    h('input', {
                      type: 'checkbox',
                      checked: avatarCfg.enabled,
                      onChange: (ev) => setAvatarCfg((prev) => ({ ...prev, enabled: ev.target.checked })),
                    }),
                    '🤖 AI 数字人 & 克隆真人数字人口播叠加 (Alpha WebM)',
                  ),
                  h(
                    'span',
                    { style: { fontSize: '10.5px', fontFamily: 'Consolas, monospace', color: T.textMuted } },
                    `引擎: ${avatarProvider?.provider || 'auto'}`,
                  ),
                ),
                avatarCfg.enabled
                  ? h(
                      'div',
                      { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                      h(
                        'div',
                        { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' } },
                        [
                          { id: 'ai-human', label: '✨ 纯 AI 虚拟数字人' },
                          { id: 'cloned-human', label: '👤 克隆真人数字人' },
                        ].map((m) => {
                          const on = avatarCfg.mode === m.id
                          return h(
                            'button',
                            {
                              key: m.id,
                              className: 'dsh-vw-btn',
                              onClick: () => setAvatarCfg((prev) => ({ ...prev, mode: m.id })),
                              style: {
                                padding: '6px 8px',
                                borderRadius: '8px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                background: on ? T.bgPanel : 'transparent',
                                border: `1px solid ${on ? T.accentBlueBorder : T.borderSubtle}`,
                                color: on ? T.accentBlue : T.textSecondary,
                              },
                            },
                            m.label,
                          )
                        }),
                      ),
                      avatarCfg.mode === 'ai-human'
                        ? h(
                            'select',
                            {
                              value: avatarCfg.presetId,
                              onChange: (ev) => setAvatarCfg((prev) => ({ ...prev, presetId: ev.target.value })),
                              style: { ...inputStyle, padding: '6px 9px', fontSize: '12px' },
                            },
                            (avatarTemplates.length
                              ? avatarTemplates
                              : [
                                  { id: 'cyber-anchor', name: '赛博科技主理人' },
                                  { id: 'warm-mentor', name: '温暖故事讲述者' },
                                  { id: 'tech-founder', name: '极客创始人口播' },
                                ]
                            ).map((t) => h('option', { key: t.id, value: t.id }, `AI 形象模板: ${t.name}`)),
                          )
                        : h(
                            'div',
                            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' } },
                            h(
                              'select',
                              {
                                value: avatarCfg.sourcePath,
                                onChange: (ev) => setAvatarCfg((prev) => ({ ...prev, sourcePath: ev.target.value })),
                                style: { ...inputStyle, padding: '6px 8px', fontSize: '11.5px' },
                              },
                              h('option', { value: '' }, '选择本人底板视频/人像 (可在第1步上传)'),
                              projectAssets
                                .filter((a) => a.type === 'video' || a.type === 'image')
                                .map((a) => h('option', { key: a.id, value: a.path }, `${a.role === 'avatar_base' || a.role === 'host_video' ? '★ ' : ''}${a.name}`)),
                            ),
                            h(
                              'select',
                              {
                                value: avatarCfg.voiceSamplePath,
                                onChange: (ev) => setAvatarCfg((prev) => ({ ...prev, voiceSamplePath: ev.target.value })),
                                style: { ...inputStyle, padding: '6px 8px', fontSize: '11.5px' },
                              },
                              h('option', { value: '' }, '克隆声纹样本 (IndexTTS-2.5)'),
                              projectAssets
                                .filter((a) => a.role === 'voice_clone' || a.type === 'audio' || a.role === 'host_video')
                                .map((a) => h('option', { key: a.id, value: a.path }, `${a.role === 'voice_clone' ? '🎤 ' : ''}${a.name}`)),
                            ),
                          ),
                      h(
                        'div',
                        { style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } },
                        h(
                          'div',
                          { style: { display: 'flex', gap: '5px' } },
                          [
                            { id: 'pip-br', label: '右下画中画' },
                            { id: 'pip-bl', label: '左下画中画' },
                            { id: 'fullscreen', label: '全屏口播' },
                          ].map((ly) => {
                            const on = avatarCfg.layout === ly.id
                            return h(
                              'button',
                              {
                                key: ly.id,
                                className: 'dsh-vw-btn',
                                onClick: () => setAvatarCfg((prev) => ({ ...prev, layout: ly.id })),
                                style: {
                                  ...ghostBtnStyle,
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  borderColor: on ? T.accentGoldBorder : T.borderSubtle,
                                  color: on ? T.accentGold : T.textSecondary,
                                },
                              },
                              ly.label,
                            )
                          }),
                        ),
                        h(
                          'button',
                          {
                            className: 'dsh-vw-btn',
                            disabled: Boolean(busyLabel),
                            onClick: handleGenerateAvatarClip,
                            style: { ...blueBtnStyle, padding: '5px 10px', fontSize: '11px' },
                          },
                          '🎬 生成透明通道数字人',
                        ),
                      ),
                    )
                  : h('div', { style: { fontSize: '11px', color: T.textMuted } }, '开启后自动输出 yuva420p 透明通道 WebM 并在 Remotion / HTML 中叠层合成。'),
              ),

              // DUAL-TRACK EXECUTION CARDS
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '9px', paddingTop: '4px', borderTop: `1px solid ${T.borderSubtle}` } },
                h(
                  'button',
                  {
                    className: 'dsh-vw-btn',
                    disabled: Boolean(busyLabel),
                    onClick: () => handleStartOneClickPipeline(),
                    style: { ...blueBtnStyle, width: '100%', padding: '10px 14px', fontSize: '13px' },
                  },
                  h(Icon, { name: 'zap', size: 14 }),
                  '⚡ 按当前导演+数字人配置 · 启动 4-Agent 全自动出片流水线',
                ),
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      disabled: Boolean(busyLabel),
                      onClick: () => handlePlanLocalDraft(false),
                      style: { ...ghostBtnStyle, padding: '10px', justifyContent: 'center' },
                    },
                    '📋 仅规划草稿 (秒出)',
                  ),
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      disabled: Boolean(busyLabel),
                      onClick: () => handlePlanLocalDraft(true),
                      style: { ...ghostBtnStyle, padding: '10px', justifyContent: 'center' },
                    },
                    '🎞 生成本地演练成片',
                  ),
                ),
                h(
                  'label',
                  { style: { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: T.textSecondary, cursor: 'pointer' } },
                  h('input', {
                    type: 'checkbox',
                    checked: directorForm.useDraftReference,
                    onChange: (ev) => setDirectorForm((prev) => ({ ...prev, useDraftReference: ev.target.checked })),
                  }),
                  '以当前本地草稿与已生成音轨为参考基准，交给大模型升级重写代码与配乐',
                ),
                h(
                  'button',
                  {
                    className: 'dsh-vw-btn',
                    disabled: Boolean(busyLabel),
                    onClick: () => handleAiCodingProduce(directorForm.useDraftReference),
                    style: { ...goldBtnStyle, width: '100%', padding: '12px 18px', fontSize: '14px' },
                  },
                  h(Icon, { name: 'sparkles', size: 15 }),
                  llmConfig?.configured
                    ? `大模型 AI 编程出片 (${llmConfig.model})`
                    : '点击配置大模型 → 启动 AI 编程极致出片',
                ),
              ),
            ),
          ),
        ),
      )

      // -----------------------------------------------------------------------
      // STEP 3: CINEMA MONITOR + TIMELINE + INSPECTOR & NATURAL LANGUAGE REFINE
      // -----------------------------------------------------------------------
      const totalFrames = Math.max(1, Number(script?.totalDurationInFrames) || 300)
      const fps = Number(script?.fps) || 30

      const step3View = h(
        'div',
        { style: { flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' } },
        // Center: Reference Monitor + Timeline
        h(
          'div',
          { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bgApp } },
          // Monitor Toolbar
          h(
            'div',
            {
              style: {
                padding: '9px 18px',
                borderBottom: `1px solid ${T.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
              },
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('span', { style: { fontSize: '12px', fontWeight: 700, color: T.textSecondary } }, `参考监视器`),
              h(
                'select',
                {
                  value: script?.aspectRatio || '16:9',
                  onChange: (ev) => handleUpdateFormatQuick(ev.target.value, script?.quality || '1080p'),
                  style: { ...inputStyle, width: 'auto', padding: '4px 10px', fontSize: '12px' },
                },
                ASPECT_RATIO_OPTIONS.filter((o) => o.id !== 'auto').map((o) => h('option', { key: o.id, value: o.id }, o.label)),
              ),
              h(
                'select',
                {
                  value: directorForm.targetPlatform || script?.targetPlatform || 'universal',
                  onChange: (ev) => {
                    handleUpdateFormatQuick(script?.aspectRatio || '16:9', script?.quality || '1080p', ev.target.value)
                    setShowSafeGuides(true)
                  },
                  style: { ...inputStyle, width: 'auto', padding: '4px 10px', fontSize: '12px' },
                },
                PLATFORM_OPTIONS.map((pl) => h('option', { key: pl.id, value: pl.id }, `平台: ${pl.label}`)),
              ),
              h(
                'button',
                {
                  className: 'dsh-vw-btn',
                  onClick: () => setShowSafeGuides((v) => !v),
                  style: { ...ghostBtnStyle, padding: '4px 10px', color: showSafeGuides ? T.accentGold : safeZonePreflight?.passed === false ? T.accentRed : T.textSecondary },
                },
                safeZonePreflight?.passed === false ? '安全框遮罩 ⚠' : '平台安全框遮罩',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => setShowVendorModal(true), style: { ...ghostBtnStyle, padding: '4px 10px' } },
                '✨ 导入 .motion',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: handleOpenCodeDrawer, style: { ...ghostBtnStyle, padding: '4px 10px' } },
                h(Icon, { name: 'code', size: 12 }),
                '源码 / 修复日志',
              ),
            ),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              script?.authoringMode !== 'ai-coded'
                ? h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      disabled: Boolean(busyLabel),
                      onClick: () => handleAiCodingProduce(true),
                      style: { ...goldBtnStyle, padding: '6px 12px', fontSize: '12px' },
                    },
                    h(Icon, { name: 'sparkles', size: 12 }),
                    '草稿已确认 → 交由大模型升级成片',
                  )
                : null,
              h(
                'button',
                {
                  className: 'dsh-vw-btn',
                  onClick: () => setActiveStep(4),
                  style: { ...blueBtnStyle, padding: '6px 13px', fontSize: '12px' },
                },
                '去导出 / 质检 →',
              ),
            ),
          ),
          // Calibrated Black Monitor Stage (Auto-fits Portrait 9:16, Square 1:1, or Landscape 16:9!)
          h(
            'div',
            {
              style: {
                flex: 1,
                minHeight: 0,
                background: T.monitorShell,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                position: 'relative',
              },
            },
            h(
              'div',
              {
                style: {
                  position: 'relative',
                  height: isPortraitVideo ? '100%' : 'auto',
                  width: isPortraitVideo ? 'auto' : '100%',
                  maxWidth: isPortraitVideo ? 'none' : '820px',
                  maxHeight: '100%',
                  aspectRatio: `${curW} / ${curH}`,
                  background: '#000',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.14)',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.65)',
                },
              },
              previewHtmlUrl
                ? h('iframe', {
                    ref: iframeRef,
                    src: previewHtmlUrl,
                    style: { width: '100%', height: '100%', border: 'none', display: 'block', background: '#000' },
                    onLoad: () => seekToFrame(currentFrame, false),
                  })
                : h('div', { style: { color: '#9CA3B5', fontSize: '13px', padding: '40px', textAlign: 'center' } }, '请先在第 2 步生成本地草稿或大模型成片'),
              script?.avatarClip?.path
                ? h(
                    'div',
                    {
                      style: {
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        zIndex: 14,
                        padding: '3px 9px',
                        borderRadius: '999px',
                        background: 'rgba(7,9,14,0.82)',
                        border: '1px solid rgba(34,211,238,0.55)',
                        color: '#22D3EE',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        pointerEvents: 'none',
                      },
                    },
                    `🤖 Alpha 透明数字人已叠层 (${script.avatarLayout || script.avatarClip.layout || 'pip-br'})`,
                  )
                : null,
              // Platform-Accurate Safe-Zone Exclusion Overlay + Inner Safe Boundary
              showSafeGuides
                ? h(
                    'div',
                    { style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 12 } },
                    (safeZonePreflight?.obstructions || []).map((obs) =>
                      h(
                        'div',
                        {
                          key: obs.id,
                          style: {
                            position: 'absolute',
                            left: `${obs.x * 100}%`,
                            top: `${obs.y * 100}%`,
                            width: `${obs.w * 100}%`,
                            height: `${obs.h * 100}%`,
                            background: obs.tone === 'danger' ? 'rgba(244, 63, 94, 0.24)' : 'rgba(229, 169, 60, 0.16)',
                            border: `1px dashed ${obs.tone === 'danger' ? 'rgba(244, 63, 94, 0.65)' : 'rgba(229, 169, 60, 0.6)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          },
                        },
                        h(
                          'span',
                          {
                            style: {
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: 'rgba(0,0,0,0.68)',
                              color: '#FFF',
                              fontSize: '10px',
                              fontWeight: 700,
                            },
                          },
                          `遮挡区 · ${obs.label}`,
                        ),
                      ),
                    ),
                    h(
                      'div',
                      {
                        style: {
                          position: 'absolute',
                          top: `${(safeZonePreflight?.safeInsets?.top ?? 0.08) * 100}%`,
                          bottom: `${(safeZonePreflight?.safeInsets?.bottom ?? 0.08) * 100}%`,
                          left: `${(safeZonePreflight?.safeInsets?.left ?? 0.08) * 100}%`,
                          right: `${(safeZonePreflight?.safeInsets?.right ?? 0.08) * 100}%`,
                          border: '1.5px dashed rgba(34, 197, 94, 0.72)',
                        },
                      },
                      h('div', { style: { position: 'absolute', left: '33.33%', top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,0.12)' } }),
                      h('div', { style: { position: 'absolute', left: '66.66%', top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,0.12)' } }),
                      h('div', { style: { position: 'absolute', top: '33.33%', left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.12)' } }),
                      h('div', { style: { position: 'absolute', top: '66.66%', left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.12)' } }),
                    ),
                  )
                : null,
            ),
          ),
          // Transport Scrubber Bar
          h(
            'div',
            {
              style: {
                padding: '8px 18px',
                background: T.bgSidebar,
                borderTop: `1px solid ${T.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              },
            },
            h(
              'button',
              {
                className: 'dsh-vw-btn',
                onClick: () => setIsPlaying((p) => !p),
                style: { ...goldBtnStyle, padding: '5px 12px', fontSize: '12px' },
              },
              h(Icon, { name: isPlaying ? 'pause' : 'play', size: 12 }),
              isPlaying ? '暂停' : '播放',
            ),
            h(
              'button',
              { className: 'dsh-vw-btn', onClick: () => seekToFrame(currentFrame - 1), style: { ...ghostBtnStyle, padding: '4px 8px' } },
              '-1f',
            ),
            h(
              'button',
              { className: 'dsh-vw-btn', onClick: () => seekToFrame(currentFrame + 1), style: { ...ghostBtnStyle, padding: '4px 8px' } },
              '+1f',
            ),
            h('input', {
              type: 'range',
              min: 0,
              max: Math.max(1, totalFrames - 1),
              value: currentFrame,
              onChange: (ev) => {
                setIsPlaying(false)
                seekToFrame(Number(ev.target.value))
              },
              style: { flex: 1, accentColor: T.accentGold, cursor: 'pointer' },
            }),
            h(
              'span',
              { style: { fontFamily: 'Consolas, monospace', fontSize: '12px', color: T.textSecondary, whiteSpace: 'nowrap' } },
              `${fmtTimecode(currentFrame, fps)} · F${currentFrame}/${totalFrames}`,
            ),
          ),
          // Three-Track Cinema Timeline (V1 视觉分镜轨 · S1 字幕与数字人轨 · A1 配音与闪避配乐轨)
          h(
            'div',
            {
              className: 'dsh-vw-scroll',
              style: {
                padding: '10px 16px',
                background: T.bgPanel,
                backdropFilter: 'blur(18px)',
                borderTop: `1px solid ${T.borderSubtle}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                overflowX: 'auto',
                flexShrink: 0,
              },
            },
            // Track 1: V1 视觉分镜轨
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '640px' } },
              h(
                'div',
                { style: { width: '98px', flexShrink: 0, fontSize: '10.5px', fontWeight: 800, color: T.accentGold, fontFamily: 'Consolas, monospace' } },
                'V1 · 视觉分镜',
              ),
              h(
                'div',
                { style: { flex: 1, display: 'flex', gap: '6px' } },
                scenes.map((sc, idx) => {
                  const isSel = idx === selectedSceneIdx
                  const isPlayNow = idx === activePlayingSceneIdx
                  return h(
                    'div',
                    {
                      key: sc.id || idx,
                      onClick: () => {
                        setSelectedSceneIdx(idx)
                        setIsPlaying(false)
                        seekToFrame(sc.startFrame || 0)
                      },
                      style: {
                        minWidth: '120px',
                        flex: `${Math.max(1, Number(sc.durationSec) || 3)} 1 0`,
                        padding: '6px 9px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: isSel ? T.accentGoldBg : T.bgElevated,
                        border: `1.5px solid ${isSel ? T.accentGoldBorder : isPlayNow ? T.accentBlueBorder : T.borderSubtle}`,
                      },
                    },
                    h(
                      'div',
                      { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: isSel ? T.accentGold : T.textMuted, fontFamily: 'Consolas, monospace' } },
                      h('span', null, `S${String(idx + 1).padStart(2, '0')}`),
                      h('span', null, `${Number(sc.durationSec || 0).toFixed(1)}s`),
                    ),
                    h(
                      'div',
                      { style: { fontSize: '11.5px', fontWeight: 700, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                      sc.title || `第 ${idx + 1} 幕`,
                    ),
                  )
                }),
              ),
            ),
            // Track 2: S1 字幕与透明数字人轨
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '640px' } },
              h(
                'div',
                { style: { width: '98px', flexShrink: 0, fontSize: '10.5px', fontWeight: 800, color: T.accentBlue, fontFamily: 'Consolas, monospace' } },
                'S1 · 字幕/数字人',
              ),
              h(
                'div',
                { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' } },
                h(
                  'div',
                  { style: { display: 'flex', gap: '6px' } },
                  scenes.map((sc, idx) =>
                    h(
                      'div',
                      {
                        key: `cap-${sc.id || idx}`,
                        onClick: () => {
                          setSelectedSceneIdx(idx)
                          setIsPlaying(false)
                          seekToFrame(sc.startFrame || 0)
                        },
                        style: {
                          minWidth: '120px',
                          flex: `${Math.max(1, Number(sc.durationSec) || 3)} 1 0`,
                          padding: '3px 7px',
                          borderRadius: '6px',
                          background: T.accentBlueBg,
                          border: `1px solid ${idx === selectedSceneIdx ? T.accentBlueBorder : T.borderSubtle}`,
                          fontSize: '10px',
                          color: T.textSecondary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        },
                      },
                      `💬 ${sc.caption || sc.narration || '动态字幕条'}`,
                    ),
                  ),
                ),
                script?.avatarClip?.path
                  ? h(
                      'div',
                      {
                        onClick: () => setActiveStep(2),
                        title: '点击返回第 2 步调整数字人模式与画中画布局',
                        style: {
                          padding: '3px 9px',
                          borderRadius: '6px',
                          background: 'rgba(34, 211, 238, 0.16)',
                          border: '1px dashed rgba(34, 211, 238, 0.5)',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: T.accentBlue,
                          cursor: 'pointer',
                        },
                      },
                      `🤖 Alpha 透明数字人叠层 (${script.avatarClip.mode || 'ai-human'} · ${script.avatarLayout || script.avatarClip.layout || 'pip-br'}) · ${script.avatarClip.path}`,
                    )
                  : null,
              ),
            ),
            // Track 3: A1 配音与闪避配乐轨
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '640px' } },
              h(
                'div',
                { style: { width: '98px', flexShrink: 0, fontSize: '10.5px', fontWeight: 800, color: T.accentGreen, fontFamily: 'Consolas, monospace' } },
                'A1 · 配音与闪避',
              ),
              h(
                'div',
                { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' } },
                h(
                  'div',
                  { style: { display: 'flex', gap: '6px' } },
                  scenes.map((sc, idx) => {
                    const hasAudio = Boolean(sc.narration && sc.narration.trim())
                    return h(
                      'div',
                      {
                        key: `aud-${sc.id || idx}`,
                        style: {
                          minWidth: '120px',
                          flex: `${Math.max(1, Number(sc.durationSec) || 3)} 1 0`,
                          padding: '3px 7px',
                          borderRadius: '6px',
                          background: hasAudio ? T.accentGreenBg : T.bgInput,
                          border: `1px solid ${hasAudio ? 'rgba(34,197,94,0.4)' : T.borderSubtle}`,
                          fontSize: '10px',
                          color: hasAudio ? T.accentGreen : T.textMuted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        },
                      },
                      hasAudio ? `🔊 口播 (${sc.emotion || '平静'} · BGM自动闪避)` : '— 无口播 —',
                    )
                  }),
                ),
                h(
                  'div',
                  {
                    style: {
                      padding: '3px 9px',
                      borderRadius: '6px',
                      background: resolvedDark ? 'rgba(229, 169, 60, 0.12)' : 'rgba(183, 121, 31, 0.1)',
                      border: `1px solid ${T.accentGoldBorder}`,
                      fontSize: '10px',
                      color: T.accentGold,
                      display: 'flex',
                      justifyContent: 'space-between',
                    },
                  },
                  h('span', null, `🎵 BGM 闪避母带轨 · 模式: ${script?.bgmMode || script?.audioSpec?.bgmMode || directorForm.bgmMode || 'llm-coded'}`),
                  h('span', { style: { fontFamily: 'Consolas, monospace' } }, hasMasterAudio ? '✓ master-audio.wav 已混音 (-14 LUFS)' : '待合成音轨'),
                ),
              ),
            ),
          ),
        ),
        // Right Inspector: Scene Copy/Voice + Natural Language AI Refine Box
        h(
          'aside',
          {
            className: 'dsh-vw-scroll',
            style: {
              width: '340px',
              flexShrink: 0,
              background: T.bgSidebar,
              borderLeft: `1px solid ${T.borderSubtle}`,
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            },
          },
          // AI Natural Language Co-Pilot Card
          h(
            'div',
            {
              style: {
                padding: '13px',
                borderRadius: '12px',
                background: resolvedDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(37, 99, 235, 0.05)',
                border: `1px solid ${T.accentBlueBorder}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
              },
            },
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('span', { style: { fontSize: '12px', fontWeight: 800, color: T.accentBlue } }, '💬 对 AI 说（小白快捷一键纠错 / 自然语言精修）'),
              historyCount > 0
                ? h(
                    'button',
                    { className: 'dsh-vw-btn', onClick: handleRollbackVersion, style: { ...ghostBtnStyle, padding: '3px 8px', fontSize: '11px' } },
                    h(Icon, { name: 'undo', size: 11 }),
                    `撤回 (${historyCount})`,
                  )
                : null,
            ),
            h(
              'div',
              { style: { display: 'flex', flexWrap: 'wrap', gap: '5px' } },
              QUICK_FIX_PILLS.map((pill) =>
                h(
                  'button',
                  {
                    key: pill.label,
                    className: 'dsh-vw-btn',
                    disabled: Boolean(busyLabel),
                    onClick: () => handleAiRefine(pill.prompt),
                    style: {
                      ...ghostBtnStyle,
                      padding: '3px 8px',
                      fontSize: '10.5px',
                      borderRadius: '99px',
                    },
                  },
                  pill.label,
                ),
              ),
            ),
            h('textarea', {
              rows: 3,
              value: refinePrompt,
              onChange: (ev) => setRefinePrompt(ev.target.value),
              placeholder: '点上方快捷胶囊一键修片，或直接说：把这一幕改成震撼的数字滚动特效，配乐更紧凑...',
              style: { ...inputStyle, fontSize: '12px', resize: 'vertical' },
            }),
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
              h(
                'select',
                {
                  value: refineScope,
                  onChange: (ev) => setRefineScope(ev.target.value),
                  style: { ...inputStyle, width: 'auto', padding: '5px 8px', fontSize: '11px' },
                },
                h('option', { value: 'scene' }, `仅改当前幕 (${selectedScene?.id || 'S01'})`),
                h('option', { value: 'global' }, '整体风格与全片代码'),
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: handleAiRefine, style: { ...blueBtnStyle, padding: '6px 12px', fontSize: '12px' } },
                h(Icon, { name: 'sparkles', size: 12 }),
                '立即精修',
              ),
            ),
          ),
          // Scene Properties Form
          selectedScene
            ? h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '11px' } },
                h('div', { style: { fontSize: '13px', fontWeight: 800 } }, `分镜微调 · ${selectedScene.id}`),
                h(
                  'div',
                  null,
                  h('label', { style: { fontSize: '11px', color: T.textMuted, display: 'block', marginBottom: '4px' } }, '画面主标题'),
                  h('input', {
                    value: selectedScene.title || '',
                    onChange: (ev) => updateSelectedScene({ title: ev.target.value }),
                    style: inputStyle,
                  }),
                ),
                h(
                  'div',
                  null,
                  h('label', { style: { fontSize: '11px', color: T.textMuted, display: 'block', marginBottom: '4px' } }, '口播旁白与字幕'),
                  h('textarea', {
                    rows: 4,
                    value: selectedScene.narration || '',
                    onChange: (ev) => updateSelectedScene({ narration: ev.target.value }),
                    style: { ...inputStyle, resize: 'vertical', lineHeight: 1.5 },
                  }),
                ),
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
                  h(
                    'div',
                    null,
                    h('label', { style: { fontSize: '11px', color: T.textMuted, display: 'block', marginBottom: '4px' } }, '情绪语气'),
                    h(
                      'select',
                      {
                        value: selectedScene.emotion || '平静',
                        onChange: (ev) => updateSelectedScene({ emotion: ev.target.value }),
                        style: inputStyle,
                      },
                      availableEmotions.map((em) => h('option', { key: em, value: em }, em)),
                    ),
                  ),
                  h(
                    'div',
                    null,
                    h('label', { style: { fontSize: '11px', color: T.textMuted, display: 'block', marginBottom: '4px' } }, '运镜动效'),
                    h(
                      'select',
                      {
                        value: selectedScene.kenBurns || 'zoom-in',
                        onChange: (ev) => updateSelectedScene({ kenBurns: ev.target.value }),
                        style: inputStyle,
                      },
                      MOTION_OPTIONS.map((m) => h('option', { key: m.value, value: m.value }, m.label)),
                    ),
                  ),
                ),
                h(
                  'div',
                  { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '8px', background: T.bgPanel, border: `1px solid ${T.borderSubtle}` } },
                  h('span', { style: { fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `音色: ${selectedScene.voiceId || 'auto'}`),
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      onClick: () => {
                        setVoiceModalTarget('scene')
                        setShowVoiceModal(true)
                      },
                      style: { ...ghostBtnStyle, padding: '4px 9px', fontSize: '11px' },
                    },
                    '换音色',
                  ),
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: '8px', marginTop: '4px' } },
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      disabled: Boolean(busyLabel),
                      onClick: handleSaveScriptEdits,
                      style: { ...ghostBtnStyle, flex: 1, justifyContent: 'center', borderColor: scriptDirty ? T.accentGoldBorder : T.borderSubtle, color: scriptDirty ? T.accentGold : T.textPrimary },
                    },
                    scriptDirty ? '保存并更新*' : '保存',
                  ),
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      disabled: Boolean(busyLabel),
                      onClick: () => handleSynthesizeSceneTts(selectedScene),
                      style: { ...goldBtnStyle, flex: 1.4 },
                    },
                    h(Icon, { name: 'mic', size: 12 }),
                    '重配本幕人声',
                  ),
                ),
                // Post-TTS AI Voice Mastering Card
                h(
                  'div',
                  {
                    style: {
                      marginTop: '6px',
                      padding: '11px',
                      borderRadius: '10px',
                      background: resolvedDark ? 'rgba(229, 169, 60, 0.08)' : 'rgba(180, 83, 9, 0.05)',
                      border: `1px solid ${T.accentGoldBorder}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    },
                  },
                  h(
                    'div',
                    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                    h('span', { style: { fontSize: '11.5px', fontWeight: 800, color: T.accentGold } }, '🎚 配音后 AI 大模型声学修音'),
                    selectedScene.voiceMastering?.applied
                      ? h(
                          'span',
                          { style: { fontSize: '10px', fontFamily: 'Consolas, monospace', color: T.accentGreen } },
                          `${Number(selectedScene.voiceMastering.beforeLufs || -20).toFixed(1)}→${Number(selectedScene.voiceMastering.afterLufs || -15.5).toFixed(1)} LUFS`,
                        )
                      : h('span', { style: { fontSize: '10px', color: T.textMuted } }, '干声待精修'),
                  ),
                  selectedScene.voiceMastering?.applied
                    ? h(
                        'div',
                        { style: { fontSize: '10.5px', color: T.textSecondary, lineHeight: 1.45 } },
                        selectedScene.voiceMastering.eqSummary,
                        selectedScene.voiceMastering.rationale
                          ? h('div', { style: { color: T.textMuted, marginTop: '3px' } }, selectedScene.voiceMastering.rationale)
                          : null,
                      )
                    : h(
                        'div',
                        { style: { fontSize: '10.5px', color: T.textSecondary, lineHeight: 1.45 } },
                        'IndexTTS-2.5 合成后由 AI 大模型分析响度/齿音/动态，通过 48kHz 均衡与压限母带提亮人声。',
                      ),
                  h(
                    'div',
                    { style: { display: 'flex', gap: '6px' } },
                    h(
                      'button',
                      {
                        className: 'dsh-vw-btn',
                        disabled: Boolean(busyLabel),
                        onClick: () => handleAiMasterVoice(selectedScene.id),
                        style: { ...ghostBtnStyle, flex: 1, justifyContent: 'center', fontSize: '11px', padding: '5px 8px' },
                      },
                      '✨ AI 修音本幕',
                    ),
                    h(
                      'button',
                      {
                        className: 'dsh-vw-btn',
                        disabled: Boolean(busyLabel),
                        onClick: () => handleAiMasterVoice(''),
                        style: { ...blueBtnStyle, flex: 1.2, justifyContent: 'center', fontSize: '11px', padding: '5px 8px' },
                      },
                      '🎛 全片 AI 修音混音',
                    ),
                  ),
                ),
              )
            : null,
        ),
      )

      // -----------------------------------------------------------------------
      // STEP 4: CINEMA EXPORT & AUTOMATED QA AUDIT
      // -----------------------------------------------------------------------
      const step4View = h(
        'div',
        { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '26px 32px' } },
        h(
          'div',
          { style: { maxWidth: '1040px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' } },
          h(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' } },
            h(
              'div',
              null,
              h('h2', { style: { fontSize: '21px', fontWeight: 800, margin: 0 } }, '04 · 成片交付与 FFmpeg 自动质检'),
              h('p', { style: { margin: '5px 0 0', fontSize: '13px', color: T.textSecondary } }, `当前输出规格：${script?.width || 1920}×${script?.height || 1080} (${script?.aspectRatio || '16:9'}) · ${script?.fps || 30}fps · 总长 ${script?.totalDurationSec || 0}s`),
            ),
            h(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              h('button', { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: () => handleRenderMp4(true), style: ghostBtnStyle }, '⚡ 720P 极速试渲染'),
              h('button', { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: () => handleRenderMp4(false), style: goldBtnStyle }, h(Icon, { name: 'film', size: 14 }), ' 渲染最终高清 MP4'),
              hasMp4
                ? h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      disabled: Boolean(busyLabel),
                      onClick: () => handleExportPublishPack(directorForm.targetPlatform),
                      style: { ...ghostBtnStyle, borderColor: T.accentGoldBorder, color: T.accentGold },
                    },
                    '📦 一键导出平台发布包',
                  )
                : null,
              mp4Url
                ? h(
                    'a',
                    {
                      href: mp4Url,
                      download: `${script?.title || 'dsh-video'}.mp4`,
                      className: 'dsh-vw-btn',
                      style: { ...blueBtnStyle, textDecoration: 'none' },
                    },
                    h(Icon, { name: 'download', size: 14 }),
                    '下载 MP4',
                  )
                : null,
            ),
          ),
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: '18px', alignItems: 'start' } },
            // MP4 Theater Box
            h(
              'div',
              {
                style: {
                  background: T.monitorShell,
                  borderRadius: '14px',
                  border: `1px solid ${T.borderStrong}`,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '360px',
                  maxHeight: '520px',
                  padding: '12px',
                },
              },
              mp4Url
                ? h('video', {
                    key: mp4Url,
                    src: mp4Url,
                    controls: true,
                    playsInline: true,
                    preload: 'auto',
                    style: {
                      maxWidth: '100%',
                      maxHeight: '490px',
                      borderRadius: '8px',
                      aspectRatio: `${curW} / ${curH}`,
                    },
                  })
                : h('div', { style: { color: '#9CA3B5', fontSize: '13px', textAlign: 'center', padding: '40px' } }, '尚未导出 MP4，点击右上角「渲染最终高清 MP4」即可完成音画压制。'),
            ),
            // Automated FFmpeg QA & Telemetry Card
            h(
              'div',
              { style: { ...panelStyle, padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' } },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 800, fontSize: '14px' } },
                  h(Icon, { name: 'shield', size: 16, color: qaReport?.passed ? T.accentGreen : T.accentGold }),
                  '成片 QA 自动化质检报告',
                ),
                h(
                  'button',
                  { className: 'dsh-vw-btn', disabled: !hasMp4 || Boolean(busyLabel), onClick: handleRunQaOnly, style: { ...ghostBtnStyle, padding: '4px 10px', fontSize: '11px' } },
                  '重新质检',
                ),
              ),
              qaReport?.checks?.length
                ? qaReport.checks.map((ck, i) =>
                    h(
                      'div',
                      {
                        key: i,
                        style: {
                          padding: '9px 11px',
                          borderRadius: '9px',
                          background: ck.passed ? T.accentGreenBg : T.accentRedBg,
                          border: `1px solid ${ck.passed ? 'rgba(34,197,94,0.28)' : 'rgba(244,63,94,0.32)'}`,
                        },
                      },
                      h(
                        'div',
                        { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: ck.passed ? T.accentGreen : T.accentRed } },
                        h('span', null, `${ck.passed ? '✓' : '✕'} ${ck.name}`),
                      ),
                      h('div', { style: { fontSize: '11px', color: T.textSecondary, marginTop: '3px', fontFamily: 'Consolas, monospace' } }, ck.value),
                    ),
                  )
                : h('div', { style: { fontSize: '12px', color: T.textMuted, padding: '16px 0' } }, '渲染成片后将自动检验：黑屏异常、EBU R128 响度峰值、音画时长同步与 BT.709 色彩规格。'),
              buildLog
                ? h(
                    'div',
                    { style: { padding: '10px', borderRadius: '9px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}`, fontSize: '11px', color: T.textSecondary } },
                    h('div', { style: { fontWeight: 700, color: T.textPrimary, marginBottom: '4px' } }, `🤖 AI 编程编译记录 (${buildLog.model || ''})`),
                    h('div', null, `自动修复轮次: ${buildLog.repairRoundsUsed ?? 0} 轮 · 生成文件数: ${buildLog.generatedFiles?.length || 0}`),
                    h('div', { style: { marginTop: '4px' } }, `尺寸依据: ${buildLog.dimensionReason || script?.dimensionReason || ''}`),
                  )
                : null,
              hasSnapshot
                ? h(
                    'div',
                    null,
                    h(
                      'button',
                      { className: 'dsh-vw-btn', onClick: () => setShowMatrixPreview((v) => !v), style: { ...ghostBtnStyle, width: '100%' } },
                      showMatrixPreview ? '收起关键帧校验图' : '展开渲染关键帧抽检图',
                    ),
                    showMatrixPreview
                      ? h('img', { src: snapshotUrl, style: { width: '100%', borderRadius: '8px', marginTop: '8px', border: `1px solid ${T.borderSubtle}` } })
                      : null,
                  )
                : null,
            ),
          ),
          publishPackResult
            ? h(
                'div',
                { style: { ...panelStyle, padding: '18px', borderColor: T.accentGoldBorder, display: 'flex', flexDirection: 'column', gap: '12px' } },
                h(
                  'div',
                  { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } },
                  h('div', { style: { fontSize: '15px', fontWeight: 800, color: T.accentGold } }, `📦 平台发布包已生成 (${publishPackResult.platformLabel || publishPackResult.platform})`),
                  h('span', { style: { fontSize: '11px', fontFamily: 'Consolas, monospace', color: T.textMuted } }, publishPackResult.packDir),
                ),
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'start' } },
                  publishPackResult.coverUrl
                    ? h('img', { src: publishPackResult.coverUrl, style: { width: '100%', borderRadius: '9px', border: `1px solid ${T.borderStrong}` } })
                    : h('div', { style: { padding: '24px', borderRadius: '9px', background: T.bgElevated, textAlign: 'center', fontSize: '12px', color: T.textMuted } }, '封面图 cover.png 已写入目录'),
                  h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                    h('div', { style: { fontSize: '12px', fontWeight: 700 } }, '推荐发布标题 (点击可复制 / 参考 meta.md)：'),
                    (publishPackResult.suggestedTitles || []).map((t, idx) =>
                      h(
                        'div',
                        { key: idx, style: { fontSize: '12px', padding: '6px 10px', borderRadius: '7px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}` } },
                        t,
                      ),
                    ),
                    h('div', { style: { fontSize: '12px', color: T.accentBlue, fontWeight: 600 } }, (publishPackResult.hashtags || []).join(' ')),
                    h('div', { style: { fontSize: '11px', color: T.textSecondary, lineHeight: 1.45 } }, `合规与授权声明：${publishPackResult.complianceNotice || ''} · 商用字体 SIL OFL 1.1`),
                  ),
                ),
              )
            : null,
        ),
      )

      // -----------------------------------------------------------------------
      // MODALS: New Project, Model-Agnostic LLM Settings, Code Drawer, Voice Picker
      // -----------------------------------------------------------------------
      const modalBackdropStyle = {
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 12, 0.72)',
        backdropFilter: 'blur(6px)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }

      const newProjectModal = showNewModal
        ? h(
            'div',
            { style: modalBackdropStyle, onClick: () => setShowNewModal(false) },
            h(
              'div',
              { style: { ...panelStyle, width: '430px', maxWidth: '100%', padding: '22px' }, onClick: (ev) => ev.stopPropagation() },
              h('h3', { style: { margin: '0 0 12px', fontSize: '16px', fontWeight: 800 } }, '新建视频工程'),
              h('input', {
                autoFocus: true,
                value: newProjectTitle,
                onChange: (ev) => setNewProjectTitle(ev.target.value),
                onKeyDown: (ev) => ev.key === 'Enter' && handleCreateProject(),
                placeholder: '输入作品标题，例如：新品发布会视觉大片',
                style: { ...inputStyle, marginBottom: '16px' },
              }),
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
                h('button', { className: 'dsh-vw-btn', onClick: () => setShowNewModal(false), style: ghostBtnStyle }, '取消'),
                h('button', { className: 'dsh-vw-btn', onClick: handleCreateProject, style: goldBtnStyle }, '立即创建'),
              ),
            ),
          )
        : null

      const activeTemplate = llmConfig?.templates?.find((t) => t.id === llmForm.provider)
      const dshClient = llmConfig?.dshClient || { available: false, providers: [] }
      const dshActiveProv = dshClient.providers?.find((p) => p.id === (llmForm.dshProviderId === 'active' ? dshClient.defaultProviderId : llmForm.dshProviderId)) || null
      const protocolOptions = llmConfig?.protocols || [
        { id: 'openai-completions', label: 'OpenAI 兼容 Chat · /v1/chat/completions' },
        { id: 'anthropic-messages', label: 'Anthropic Messages · /v1/messages' },
        { id: 'openai-responses', label: 'OpenAI Responses · /v1/responses' },
        { id: 'gemini-native', label: 'Gemini 原生 · /v1beta/models' },
      ]

      const llmModal = showLlmModal
        ? h(
            'div',
            { style: modalBackdropStyle, onClick: () => setShowLlmModal(false) },
            h(
              'div',
              {
                className: 'dsh-vw-scroll',
                style: { ...panelStyle, width: '680px', maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' },
                onClick: (ev) => ev.stopPropagation(),
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('h3', { style: { margin: 0, fontSize: '17px', fontWeight: 800 } }, '🤖 多模型与四协议设置（默认跟随 DSH 客户端）'),
                h('button', { onClick: () => setShowLlmModal(false), style: { background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer' } }, h(Icon, { name: 'x', size: 17 })),
              ),
              h(
                'p',
                { style: { margin: 0, fontSize: '12px', color: T.textSecondary, lineHeight: 1.55 } },
                '默认自动同步 DSH 客户端当前使用的模型与网关凭据；您也可随时在插件内独立切换其它模型或中转，完整支持 OpenAI Chat、Anthropic Messages、OpenAI Responses、Gemini 原生 四种协议。配音则始终由本地 IndexTTS-2.5 合成并支持大模型修音。',
              ),
              // 2-Way Source Selector: Follow DSH Client vs Custom Override
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
                h(
                  'button',
                  {
                    className: 'dsh-vw-btn',
                    onClick: () => {
                      setLlmForm((p) => ({ ...p, mode: 'follow-dsh' }))
                      setLlmTestResult(null)
                    },
                    style: {
                      ...ghostBtnStyle,
                      justifyContent: 'center',
                      padding: '10px',
                      background: llmForm.mode !== 'custom' ? T.accentBlueBg : T.bgElevated,
                      borderColor: llmForm.mode !== 'custom' ? T.accentBlueBorder : T.borderSubtle,
                      color: llmForm.mode !== 'custom' ? T.accentBlue : T.textSecondary,
                      fontWeight: llmForm.mode !== 'custom' ? 800 : 500,
                    },
                  },
                  '🔄 跟随 DSH 客户端配置（默认）',
                ),
                h(
                  'button',
                  {
                    className: 'dsh-vw-btn',
                    onClick: () => {
                      setLlmForm((p) => ({ ...p, mode: 'custom' }))
                      setLlmTestResult(null)
                    },
                    style: {
                      ...ghostBtnStyle,
                      justifyContent: 'center',
                      padding: '10px',
                      background: llmForm.mode === 'custom' ? T.accentGoldBg : T.bgElevated,
                      borderColor: llmForm.mode === 'custom' ? T.accentGoldBorder : T.borderSubtle,
                      color: llmForm.mode === 'custom' ? T.accentGold : T.textSecondary,
                      fontWeight: llmForm.mode === 'custom' ? 800 : 500,
                    },
                  },
                  '🛠 插件独立自定义配置',
                ),
              ),
              llmForm.mode !== 'custom'
                ? h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px', borderRadius: '12px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}` } },
                    dshClient.available
                      ? h(
                          React.Fragment,
                          null,
                          h(
                            'div',
                            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' } },
                            h('span', { style: { fontWeight: 700, color: T.textPrimary } }, `已读取 DSH Profile (${dshClient.profile}) 客户端渠道`),
                            h('span', { style: { fontSize: '11px', fontFamily: 'Consolas, monospace', color: T.accentBlue } }, `默认: ${dshClient.defaultProviderId || '-'} / ${dshClient.defaultModelId || '-'}`),
                          ),
                          h(
                            'div',
                            { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
                            h(
                              'button',
                              {
                                className: 'dsh-vw-btn',
                                onClick: () => handleSelectDshProvider('active'),
                                style: {
                                  ...ghostBtnStyle,
                                  padding: '5px 10px',
                                  fontSize: '11px',
                                  background: llmForm.dshProviderId === 'active' ? T.accentBlueBg : T.bgPanel,
                                  borderColor: llmForm.dshProviderId === 'active' ? T.accentBlueBorder : T.borderSubtle,
                                  color: llmForm.dshProviderId === 'active' ? T.accentBlue : T.textPrimary,
                                },
                              },
                              '✨ 实时跟随 DSH 当前默认',
                            ),
                            (dshClient.providers || []).map((prov) => {
                              const on = llmForm.dshProviderId === prov.id
                              return h(
                                'button',
                                {
                                  key: prov.id,
                                  className: 'dsh-vw-btn',
                                  onClick: () => handleSelectDshProvider(prov.id),
                                  style: {
                                    ...ghostBtnStyle,
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    background: on ? T.accentBlueBg : T.bgPanel,
                                    borderColor: on ? T.accentBlueBorder : T.borderSubtle,
                                    color: on ? T.accentBlue : T.textSecondary,
                                  },
                                },
                                `${prov.displayName || prov.id} · ${prov.hasApiKey ? '密钥已存' : '无密钥'}`,
                              )
                            }),
                          ),
                          dshActiveProv
                            ? h(
                                'div',
                                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '2px' } },
                                h(
                                  'div',
                                  null,
                                  h('label', { style: { fontSize: '11px', color: T.textMuted, display: 'block', marginBottom: '4px' } }, '接口协议（可单独覆盖 4 种协议）'),
                                  h(
                                    'select',
                                    {
                                      value: llmForm.format,
                                      onChange: (ev) => setLlmForm((p) => ({ ...p, format: ev.target.value })),
                                      style: inputStyle,
                                    },
                                    h('option', { value: 'auto' }, `跟随 DSH 配置 (${dshActiveProv.api})`),
                                    protocolOptions.map((po) => h('option', { key: po.id, value: po.id }, po.label)),
                                  ),
                                ),
                                h(
                                  'div',
                                  null,
                                  h('label', { style: { fontSize: '11px', color: T.textMuted, display: 'block', marginBottom: '4px' } }, '选用模型 ID（留空则跟随 DSH 默认）'),
                                  h('input', {
                                    value: llmForm.model,
                                    onChange: (ev) => setLlmForm((p) => ({ ...p, model: ev.target.value })),
                                    placeholder: dshClient.defaultModelId || dshActiveProv.models?.[0]?.id || '跟随 DSH 默认模型',
                                    style: inputStyle,
                                  }),
                                ),
                              )
                            : null,
                          dshActiveProv?.models?.length
                            ? h(
                                'div',
                                { style: { display: 'flex', flexWrap: 'wrap', gap: '5px' } },
                                dshActiveProv.models.slice(0, 14).map((m) => {
                                  const on = (llmForm.model || dshClient.defaultModelId) === m.id
                                  return h(
                                    'button',
                                    {
                                      key: m.id,
                                      className: 'dsh-vw-btn',
                                      onClick: () => setLlmForm((p) => ({ ...p, model: m.id })),
                                      style: {
                                        ...ghostBtnStyle,
                                        padding: '3px 8px',
                                        fontSize: '11px',
                                        fontFamily: 'Consolas, monospace',
                                        background: on ? T.accentGoldBg : 'transparent',
                                        borderColor: on ? T.accentGoldBorder : T.borderSubtle,
                                        color: on ? T.accentGold : T.textSecondary,
                                      },
                                    },
                                    m.id,
                                  )
                                }),
                              )
                            : null,
                        )
                      : h('div', { style: { fontSize: '12px', color: T.textSecondary } }, '未检测到本机 DSH 客户端配置目录 (~/.dsh)，请切换到右侧「插件独立自定义配置」。'),
                  )
                : h(
                    React.Fragment,
                    null,
                    h(
                      'div',
                      { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
                      (llmConfig?.templates || []).map((tpl) => {
                        const on = llmForm.provider === tpl.id
                        return h(
                          'button',
                          {
                            key: tpl.id,
                            className: 'dsh-vw-btn',
                            onClick: () => handleProviderTemplateChange(tpl.id),
                            style: {
                              ...ghostBtnStyle,
                              padding: '5px 10px',
                              fontSize: '11px',
                              background: on ? T.accentBlueBg : T.bgElevated,
                              borderColor: on ? T.accentBlueBorder : T.borderSubtle,
                              color: on ? T.accentBlue : T.textSecondary,
                            },
                          },
                          tpl.id === 'custom' ? '自由填写中转/定制' : tpl.label.split(' ')[0],
                        )
                      }),
                    ),
                    h(
                      'div',
                      { style: { display: 'grid', gridTemplateColumns: '1fr 240px', gap: '10px' } },
                      h(
                        'div',
                        null,
                        h('label', { style: { fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' } }, 'API 接口地址 (Base URL)'),
                        h('input', {
                          value: llmForm.baseUrl,
                          onChange: (ev) => setLlmForm((p) => ({ ...p, baseUrl: ev.target.value })),
                          placeholder: 'https://api.openai.com/v1 或 任意中转 URL',
                          style: inputStyle,
                        }),
                      ),
                      h(
                        'div',
                        null,
                        h('label', { style: { fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' } }, '接口协议格式 (4 种协议)'),
                        h(
                          'select',
                          {
                            value: llmForm.format,
                            onChange: (ev) => setLlmForm((p) => ({ ...p, format: ev.target.value })),
                            style: inputStyle,
                          },
                          h('option', { value: 'auto' }, 'Auto 自动识别'),
                          protocolOptions.map((po) => h('option', { key: po.id, value: po.id }, po.label)),
                        ),
                      ),
                    ),
                    h(
                      'div',
                      { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
                      h(
                        'div',
                        null,
                        h('label', { style: { fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' } }, `API Key ${llmConfig?.mode === 'custom' && llmConfig?.hasApiKey ? `(已存: ${llmConfig.maskedApiKey})` : ''}`),
                        h('input', {
                          type: 'password',
                          value: llmForm.apiKey,
                          onChange: (ev) => setLlmForm((p) => ({ ...p, apiKey: ev.target.value })),
                          placeholder: llmConfig?.mode === 'custom' && llmConfig?.hasApiKey ? '留空即保留原密钥' : 'sk-...',
                          style: inputStyle,
                        }),
                      ),
                      h(
                        'div',
                        null,
                        h('label', { style: { fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' } }, '模型名称 ID（可自由填写任意模型）'),
                        h('input', {
                          value: llmForm.model,
                          onChange: (ev) => setLlmForm((p) => ({ ...p, model: ev.target.value })),
                          placeholder: '例如 claude-opus-5-5 / gpt-6.1-sol / gemini-2.5-pro',
                          style: inputStyle,
                        }),
                      ),
                    ),
                    (activeTemplate?.suggestedModels?.length || llmTestResult?.availableModels?.length)
                      ? h(
                          'div',
                          { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
                          (llmTestResult?.availableModels?.length ? llmTestResult.availableModels.slice(0, 12) : activeTemplate?.suggestedModels || []).map((m) =>
                            h(
                              'button',
                              {
                                key: m,
                                className: 'dsh-vw-btn',
                                onClick: () => setLlmForm((p) => ({ ...p, model: m })),
                                style: { ...ghostBtnStyle, padding: '3px 8px', fontSize: '11px', fontFamily: 'Consolas, monospace' },
                              },
                              m,
                            ),
                          ),
                        )
                      : null,
                  ),
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } },
                h('label', { style: { fontSize: '12px', color: T.textSecondary } }, '代码编译/质检自动修复最大轮数:'),
                h(
                  'select',
                  {
                    value: llmForm.maxRepairRounds,
                    onChange: (ev) => setLlmForm((p) => ({ ...p, maxRepairRounds: Number(ev.target.value) })),
                    style: { ...inputStyle, width: '100px' },
                  },
                  [1, 2, 3, 4, 5].map((n) => h('option', { key: n, value: n }, `${n} 轮`)),
                ),
              ),
              llmTestResult
                ? h(
                    'div',
                    {
                      style: {
                        padding: '10px 12px',
                        borderRadius: '9px',
                        fontSize: '12px',
                        background: llmTestResult.ok ? T.accentGreenBg : T.accentRedBg,
                        color: llmTestResult.ok ? T.accentGreen : T.accentRed,
                      },
                    },
                    llmTestResult.ok
                      ? `✓ 连接成功 (${llmTestResult.latencyMs}ms · 协议 ${llmTestResult.protocol} · 模型 ${llmTestResult.model})`
                      : `✕ 测试失败: ${llmTestResult.error}`,
                  )
                : null,
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' } },
                h('button', { className: 'dsh-vw-btn', disabled: llmTesting, onClick: handleTestLlm, style: ghostBtnStyle }, llmTesting ? '测试中...' : '测试连接并获取模型'),
                h('button', { className: 'dsh-vw-btn', onClick: handleSaveLlmConfig, style: goldBtnStyle }, '保存配置'),
              ),
            ),
          )
        : null

      const activeCodeFile = codeFiles.find((f) => f.path === selectedCodePath) || codeFiles[0] || null
      const codeDrawer = showCodeDrawer
        ? h(
            'div',
            { style: modalBackdropStyle, onClick: () => setShowCodeDrawer(false) },
            h(
              'div',
              {
                style: { ...panelStyle, width: '880px', maxWidth: '96vw', height: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
                onClick: (ev) => ev.stopPropagation(),
              },
              h(
                'div',
                { style: { padding: '14px 18px', borderBottom: `1px solid ${T.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('strong', { style: { fontSize: '14px' } }, '工程源码与 AI 自动修复日志检视'),
                h('button', { onClick: () => setShowCodeDrawer(false), style: { background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer' } }, h(Icon, { name: 'x', size: 16 })),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: '6px', padding: '10px 14px', overflowX: 'auto', borderBottom: `1px solid ${T.borderSubtle}`, background: T.bgSidebar } },
                codeFiles.map((f) =>
                  h(
                    'button',
                    {
                      key: f.path,
                      className: 'dsh-vw-btn',
                      onClick: () => setSelectedCodePath(f.path),
                      style: {
                        ...ghostBtnStyle,
                        fontFamily: 'Consolas, monospace',
                        fontSize: '11px',
                        padding: '4px 10px',
                        background: activeCodeFile?.path === f.path ? T.accentGoldBg : 'transparent',
                        borderColor: activeCodeFile?.path === f.path ? T.accentGoldBorder : T.borderSubtle,
                        color: activeCodeFile?.path === f.path ? T.accentGold : T.textSecondary,
                      },
                    },
                    f.path,
                  ),
                ),
              ),
              h(
                'pre',
                {
                  className: 'dsh-vw-scroll',
                  style: { flex: 1, margin: 0, padding: '16px', overflow: 'auto', fontFamily: 'Consolas, monospace', fontSize: '12px', lineHeight: 1.55, color: T.textPrimary, background: T.bgInput },
                },
                activeCodeFile ? activeCodeFile.content : '暂无源码文件',
              ),
            ),
          )
        : null

      const voiceModal = showVoiceModal
        ? h(
            'div',
            { style: modalBackdropStyle, onClick: () => setShowVoiceModal(false) },
            h(
              'div',
              {
                style: { ...panelStyle, width: '680px', maxWidth: '95vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column', padding: '20px', gap: '12px' },
                onClick: (ev) => ev.stopPropagation(),
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } },
                h(
                  'div',
                  { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      onClick: () => setVoiceTab('library'),
                      style: {
                        ...ghostBtnStyle,
                        padding: '7px 14px',
                        background: voiceTab === 'library' ? T.accentGoldBg : T.bgElevated,
                        borderColor: voiceTab === 'library' ? T.accentGoldBorder : T.borderSubtle,
                        color: voiceTab === 'library' ? T.accentGold : T.textPrimary,
                        fontWeight: 700,
                      },
                    },
                    `🎙 本地音色库 (${voiceCatalog.length})`,
                  ),
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      onClick: () => setVoiceTab('clone'),
                      style: {
                        ...ghostBtnStyle,
                        padding: '7px 14px',
                        background: voiceTab === 'clone' ? T.accentBlueBg : T.bgElevated,
                        borderColor: voiceTab === 'clone' ? T.accentBlueBorder : T.borderSubtle,
                        color: voiceTab === 'clone' ? T.accentBlue : T.textPrimary,
                        fontWeight: 700,
                      },
                    },
                    '🧬 声音克隆实验室 (录 5 秒即克隆本人声音)',
                  ),
                ),
                h('button', { 'aria-label': '关闭', title: '关闭弹窗', onClick: () => setShowVoiceModal(false), style: { background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer' } }, h(Icon, { name: 'x', size: 16 })),
              ),
              voiceTab === 'clone'
                ? h(
                    'div',
                    { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' } },
                    h(
                      'div',
                      { style: { padding: '12px', borderRadius: '10px', background: resolvedDark ? 'rgba(56,189,248,0.08)' : 'rgba(37,99,235,0.05)', border: `1px solid ${T.accentBlueBorder}`, fontSize: '12px', color: T.textSecondary, lineHeight: 1.55 } },
                      'IndexTTS-2.5 支持零样本（Zero-Shot）人声克隆：只需 ',
                      h('strong', { style: { color: T.textPrimary } }, '5–12 秒清晰干声'),
                      '（现录麦克风 / 上传 mp3、wav、m4a、flac / 本机路径），系统自动用 FFmpeg 去除低频底噪、裁剪首尾静音并标准化至 24kHz 单声道 WAV 写入本地私有库，绝不上传云端。',
                    ),
                    // 3 clone input sources
                    h(
                      'div',
                      { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' } },
                      [
                        { id: 'mic', label: '🎙 麦克风现场录音' },
                        { id: 'file', label: '📁 选择本地音频文件' },
                        { id: 'path', label: '📂 粘贴本机路径' },
                      ].map((m) =>
                        h(
                          'button',
                          {
                            key: m.id,
                            className: 'dsh-vw-btn',
                            onClick: () => setCloneSubMode(m.id),
                            style: {
                              ...ghostBtnStyle,
                              justifyContent: 'center',
                              background: cloneSubMode === m.id ? T.accentGoldBg : T.bgElevated,
                              borderColor: cloneSubMode === m.id ? T.accentGoldBorder : T.borderSubtle,
                              color: cloneSubMode === m.id ? T.accentGold : T.textPrimary,
                            },
                          },
                          m.label,
                        ),
                      ),
                    ),
                    cloneSubMode === 'mic'
                      ? h(
                          'div',
                          { style: { padding: '14px', borderRadius: '10px', background: T.bgElevated, border: `1px solid ${micRecording ? T.accentRed : T.borderSubtle}`, display: 'flex', flexDirection: 'column', gap: '9px' } },
                          h('div', { style: { fontSize: '12px', color: T.textSecondary } }, '参考朗读示例（自然语速读完即可）：「你好，我是正在录制视频配音的创作者，今天天气晴朗，故事从这里正式开始。」'),
                          h(
                            'div',
                            { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                            !micRecording
                              ? h('button', { className: 'dsh-vw-btn', onClick: handleStartMicRecord, style: goldBtnStyle }, '🔴 开始录制声音 (5–15 秒)')
                              : h('button', { className: 'dsh-vw-btn', onClick: handleStopMicRecord, style: { ...goldBtnStyle, background: T.accentRed, color: '#FFF' } }, `⏹ 停止录音 (${micSeconds}s / 15s)`),
                            recordedB64
                              ? h('span', { style: { fontSize: '12px', color: T.accentGreen, fontWeight: 700 } }, `✓ 已采集录音样本 (${recordedFileName})`)
                              : null,
                          ),
                        )
                      : cloneSubMode === 'file'
                      ? h(
                          'div',
                          { style: { padding: '14px', borderRadius: '10px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' } },
                          h(
                            'div',
                            { style: { fontSize: '12px', color: recordedB64 ? T.accentGreen : T.textSecondary } },
                            recordedB64 ? `✓ 已选择音频样本：${recordedFileName}` : '支持本地 .wav / .mp3 / .flac / .m4a / .ogg 文件，推荐 5–15 秒纯净人声',
                          ),
                          h('button', { className: 'dsh-vw-btn', onClick: () => cloneFileInputRef.current?.click(), style: blueBtnStyle }, '选择音频文件'),
                        )
                      : h('input', {
                          value: voiceImportPath,
                          onChange: (ev) => setVoiceImportPath(ev.target.value),
                          placeholder: '填写本机参考音频或索引文件绝对路径 (.wav / .mp3 / .pt)',
                          style: inputStyle,
                        }),
                    // Clone metadata + submit
                    h(
                      'div',
                      { style: { display: 'grid', gridTemplateColumns: '1.35fr 92px 1.65fr', gap: '8px' } },
                      h('input', {
                        value: cloneVoiceName,
                        onChange: (ev) => setCloneVoiceName(ev.target.value),
                        placeholder: '音色名称（如 我的配音）',
                        style: inputStyle,
                      }),
                      h(
                        'select',
                        { value: cloneVoiceGender, onChange: (ev) => setCloneVoiceGender(ev.target.value), style: inputStyle },
                        h('option', { value: 'female' }, '女声'),
                        h('option', { value: 'male' }, '男声'),
                      ),
                      h('input', {
                        value: cloneVoicePrompt,
                        onChange: (ev) => setCloneVoicePrompt(ev.target.value),
                        placeholder: '参考台词（选填，留空自动识别）',
                        style: inputStyle,
                      }),
                    ),
                    h(
                      'button',
                      { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: handleSubmitVoiceClone, style: { ...goldBtnStyle, width: '100%' } },
                      '🧬 降噪标准化并加入专属音色库',
                    ),
                    // Audition Lab
                    h(
                      'div',
                      { style: { padding: '12px', borderRadius: '10px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}`, display: 'flex', flexDirection: 'column', gap: '8px' } },
                      h('div', { style: { fontSize: '12px', fontWeight: 800 } }, '🎧 克隆音色即时合成试听与选用'),
                      h(
                        'div',
                        { style: { display: 'flex', gap: '8px' } },
                        h(
                          'select',
                          {
                            value:
                              cloneAuditionVoiceId ||
                              voiceCatalog.find((v) => v.isCloned || v.id?.startsWith('clone-') || v.category === '专属声纹克隆')?.id ||
                              '',
                            onChange: (ev) => setCloneAuditionVoiceId(ev.target.value),
                            style: { ...inputStyle, flex: 0.9 },
                          },
                          voiceCatalog.filter((v) => v.isCloned || v.id?.startsWith('clone-') || v.category === '专属声纹克隆' || v.tags?.includes('自定义音色')).length
                            ? voiceCatalog
                                .filter((v) => v.isCloned || v.id?.startsWith('clone-') || v.category === '专属声纹克隆' || v.tags?.includes('自定义音色'))
                                .map((v) => h('option', { key: v.id, value: v.id }, `${v.name} (已克隆)`))
                            : voiceCatalog.slice(0, 20).map((v) => h('option', { key: v.id, value: v.id }, v.name)),
                        ),
                        h('input', {
                          value: cloneAuditionText,
                          onChange: (ev) => setCloneAuditionText(ev.target.value),
                          placeholder: '输入任意一句台词，立即试听你克隆出来的配音效果...',
                          style: { ...inputStyle, flex: 1.6 },
                        }),
                      ),
                      h(
                        'div',
                        { style: { display: 'flex', gap: '8px' } },
                        h(
                          'button',
                          { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: () => handleAuditionClonedVoice(), style: { ...blueBtnStyle, flex: 1 } },
                          '▶ 用 IndexTTS-2.5 实时试听',
                        ),
                        h(
                          'button',
                          {
                            className: 'dsh-vw-btn',
                            onClick: () => {
                              const picked =
                                cloneAuditionVoiceId ||
                                voiceCatalog.find((v) => v.isCloned || v.id?.startsWith('clone-') || v.category === '专属声纹克隆')?.id
                              if (picked) handleAssignVoice(voiceCatalog.find((v) => v.id === picked) || { id: picked, name: picked })
                            },
                            style: { ...ghostBtnStyle, flex: 0.8 },
                          },
                          '✓ 设为当前全局配音',
                        ),
                      ),
                      cloneAuditionUrl ? h('audio', { src: cloneAuditionUrl, controls: true, style: { width: '100%', height: '32px' } }) : null,
                    ),
                  )
                : h(
                    'div',
                    { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '10px' } },
                    h(
                      'div',
                      { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
                      h('input', {
                        value: voiceSearch,
                        onChange: (ev) => setVoiceSearch(ev.target.value),
                        placeholder: '搜索音色名称或标签 (如 解说 / 男声 / 磁性)...',
                        style: { ...inputStyle, flex: 1 },
                      }),
                      ['all', 'female', 'male'].map((g) =>
                        h(
                          'button',
                          {
                            key: g,
                            className: 'dsh-vw-btn',
                            onClick: () => setVoiceGenderFilter(g),
                            style: {
                              ...ghostBtnStyle,
                              background: voiceGenderFilter === g ? T.accentGoldBg : T.bgElevated,
                              borderColor: voiceGenderFilter === g ? T.accentGoldBorder : T.borderSubtle,
                            },
                          },
                          g === 'all' ? '全部' : g === 'female' ? '女声' : '男声',
                        ),
                      ),
                      h(
                        'button',
                        {
                          className: 'dsh-vw-btn',
                          onClick: () => handleAssignVoice({ id: 'auto', name: 'AI 自动匹配' }),
                          style: { ...blueBtnStyle, fontSize: '12px', padding: '6px 12px' },
                        },
                        '设为 AI 自动分配',
                      ),
                    ),
                    // Quick custom voice pack import
                    h(
                      'div',
                      { style: { display: 'flex', gap: '6px', padding: '10px', borderRadius: '9px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}` } },
                      h('input', {
                        value: voiceImportPath,
                        onChange: (ev) => setVoiceImportPath(ev.target.value),
                        placeholder: '导入自定义参考音频/模型路径 (.wav / .pt)',
                        style: { ...inputStyle, flex: 1.5, fontSize: '12px', padding: '6px 10px' },
                      }),
                      h('input', {
                        value: voiceImportName,
                        onChange: (ev) => setVoiceImportName(ev.target.value),
                        placeholder: '音色名称',
                        style: { ...inputStyle, flex: 0.7, fontSize: '12px', padding: '6px 10px' },
                      }),
                      h(
                        'select',
                        { value: voiceImportGender, onChange: (ev) => setVoiceImportGender(ev.target.value), style: { ...inputStyle, width: '74px', fontSize: '12px', padding: '6px' } },
                        h('option', { value: 'female' }, '女'),
                        h('option', { value: 'male' }, '男'),
                      ),
                      h('button', { className: 'dsh-vw-btn', onClick: handleImportVoicePack, style: ghostBtnStyle }, '导入'),
                    ),
                    h(
                      'div',
                      { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' } },
                      filteredVoices.slice(0, 60).map((v) => {
                        const isPlayingThis = playingVoiceId === v.id
                        return h(
                          'div',
                          {
                            key: v.id,
                            style: {
                              padding: '9px 12px',
                              borderRadius: '9px',
                              background: T.bgElevated,
                              border: `1px solid ${T.borderSubtle}`,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px',
                            },
                          },
                          h(
                            'div',
                            { style: { minWidth: 0 } },
                            h('div', { style: { fontSize: '13px', fontWeight: 700 } }, v.name || v.id),
                            h('div', { style: { fontSize: '11px', color: T.textMuted } }, `${v.gender || ''} · ${(v.tags || []).slice(0, 4).join(' / ')}`),
                          ),
                          h(
                            'div',
                            { style: { display: 'flex', gap: '6px', flexShrink: 0 } },
                            h(
                              'button',
                              { className: 'dsh-vw-btn', onClick: () => handlePreviewVoice(v), style: { ...ghostBtnStyle, padding: '4px 10px' } },
                              h(Icon, { name: isPlayingThis ? 'pause' : 'play', size: 11 }),
                              isPlayingThis ? '停止' : '试听',
                            ),
                            h(
                              'button',
                              { className: 'dsh-vw-btn', onClick: () => handleAssignVoice(v), style: { ...goldBtnStyle, padding: '4px 12px', fontSize: '12px' } },
                              '选用',
                            ),
                          ),
                        )
                      }),
                    ),
                  ),
            ),
          )
        : null

      const vendorModal = showVendorModal
        ? h(
            'div',
            { style: modalBackdropStyle, onClick: () => setShowVendorModal(false) },
            h(
              'div',
              {
                style: { ...panelStyle, width: '520px', maxWidth: '95vw', padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' },
                onClick: (ev) => ev.stopPropagation(),
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('h3', { style: { margin: 0, fontSize: '16px', fontWeight: 800 } }, '✨ 外部 .motion / HTML 动效模板隔离导入'),
                h('button', { 'aria-label': '关闭', title: '关闭弹窗', onClick: () => setShowVendorModal(false), style: { background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer' } }, h(Icon, { name: 'x', size: 16 })),
              ),
              h('p', { style: { margin: 0, fontSize: '12px', color: T.textSecondary, lineHeight: 1.55 } }, '为防外部复杂特效代码破坏主工程编译与字体规范，系统将把目录复制到 vendor/ 目录，通过独立无头 Chromium 渲染成纯画面无声 MP4 (-an) 后安全嵌入时间轴。'),
              h('input', {
                value: vendorSourceDir,
                onChange: (ev) => setVendorSourceDir(ev.target.value),
                placeholder: '填写本地 .motion / 外部 HTML 模板文件夹绝对路径 (含 index.html)',
                style: inputStyle,
              }),
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '8px' } },
                h('input', {
                  value: vendorName,
                  onChange: (ev) => setVendorName(ev.target.value),
                  placeholder: '片段名称 (如 logo-reveal)',
                  style: inputStyle,
                }),
                h('input', {
                  type: 'number',
                  min: 1,
                  max: 30,
                  value: vendorDurationSec,
                  onChange: (ev) => setVendorDurationSec(ev.target.value),
                  placeholder: '截取时长 (秒)',
                  style: inputStyle,
                }),
              ),
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' } },
                h('button', { className: 'dsh-vw-btn', onClick: () => setShowVendorModal(false), style: ghostBtnStyle }, '取消'),
                h('button', { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: handleImportVendorMotion, style: goldBtnStyle }, '🎬 无头 Chromium 隔离渲染导入'),
              ),
            ),
          )
        : null

      // -----------------------------------------------------------------------
      // STEP 5: REAL-TIME AI AGENT TASK CENTER
      // -----------------------------------------------------------------------
      const filteredTaskRuns = taskRuns.filter((r) => {
        if (taskFilter === 'active') return r.status === 'running' || r.status === 'paused' || r.status === 'queued'
        if (taskFilter === 'done') return r.status === 'completed'
        if (taskFilter === 'stopped') return r.status === 'stopped' || r.status === 'failed'
        return true
      })

      const taskCenterView = h(
        'div',
        { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '22px 28px' } },
        h(
          'div',
          { style: { maxWidth: '1180px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' } },
          // Top Global Controls Header
          h(
            'div',
            { style: { ...panelStyle, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' } },
            h(
              'div',
              null,
              h(
                'h2',
                { style: { fontSize: '19px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' } },
                h(Icon, { name: 'activity', size: 18, color: T.accentBlue }),
                'AI Agent 实时任务中心 (Task Center)',
              ),
              h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: T.textSecondary } }, '监控素材剪辑、文案导演、IndexTTS-2.5 配音修音、透明通道数字人与 MP4 渲染子进程，随时暂停、急停或单步重试。'),
            ),
            h(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              h(
                'button',
                { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: () => handleStartOneClickPipeline(), style: goldBtnStyle },
                h(Icon, { name: 'zap', size: 14 }),
                '新建一键出片任务',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', disabled: !hasLiveTask, onClick: () => handleTaskControl('pause-all'), style: { ...ghostBtnStyle, color: T.accentGold, borderColor: T.accentGoldBorder } },
                '⏸ 全局暂停',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', disabled: !hasLiveTask, onClick: () => handleTaskControl('stop-all'), style: { ...ghostBtnStyle, color: T.accentRed, borderColor: 'rgba(244,63,94,0.45)' } },
                '■ 全局急停 (强杀子进程)',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => fetchTaskRuns(), style: ghostBtnStyle },
                h(Icon, { name: 'refresh', size: 13 }),
                '刷新',
              ),
            ),
          ),

          // Filter Strip
          h(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            [
              { id: 'all', label: `全部流水线 (${taskRuns.length})` },
              { id: 'active', label: `运行/暂停中 (${taskRuns.filter((r) => ['running', 'paused', 'queued'].includes(r.status)).length})` },
              { id: 'done', label: `已交付 (${taskRuns.filter((r) => r.status === 'completed').length})` },
              { id: 'stopped', label: `已停止/异常 (${taskRuns.filter((r) => ['stopped', 'failed'].includes(r.status)).length})` },
            ].map((tb) => {
              const on = taskFilter === tb.id
              return h(
                'button',
                {
                  key: tb.id,
                  className: 'dsh-vw-btn',
                  onClick: () => setTaskFilter(tb.id),
                  style: {
                    ...ghostBtnStyle,
                    background: on ? T.accentBlueBg : T.bgPanel,
                    borderColor: on ? T.accentBlueBorder : T.borderSubtle,
                    color: on ? T.accentBlue : T.textSecondary,
                  },
                },
                tb.label,
              )
            }),
          ),

          // Main Split View: Run History List + Active Subtask Console
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: '16px', alignItems: 'start' } },
            // Left: Run List
            h(
              'div',
              { className: 'dsh-vw-scroll', style: { ...panelStyle, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '640px', overflowY: 'auto' } },
              filteredTaskRuns.length === 0
                ? h('div', { style: { padding: '24px 12px', textAlign: 'center', fontSize: '12px', color: T.textMuted } }, '暂无匹配的流水线任务记录。点击右上角「新建一键出片任务」即可触发 4 大 AI Agent 协同执行。')
                : filteredTaskRuns.map((run) => {
                    const isSel = currentTaskRun?.id === run.id
                    const st = taskStatusStyle(run.status)
                    return h(
                      'div',
                      {
                        key: run.id,
                        onClick: () => setSelectedRunId(run.id),
                        style: {
                          padding: '10px 12px',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          background: isSel ? T.accentBlueBg : T.bgElevated,
                          border: `1px solid ${isSel ? T.accentBlueBorder : T.borderSubtle}`,
                        },
                      },
                      h(
                        'div',
                        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' } },
                        h('span', { style: { fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, run.title || run.id),
                        h('span', { style: { fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: st.bg, color: st.color, fontWeight: 700, flexShrink: 0 } }, st.label),
                      ),
                      h(
                        'div',
                        { style: { marginTop: '6px', height: '4px', borderRadius: '99px', background: 'rgba(128,128,128,0.2)', overflow: 'hidden' } },
                        h('div', { style: { width: `${Math.round(Number(run.progress || 0))}%`, height: '100%', background: st.color } }),
                      ),
                      h(
                        'div',
                        { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: T.textMuted, marginTop: '5px', fontFamily: 'Consolas, monospace' } },
                        h('span', null, `${Math.round(Number(run.progress || 0))}% · ${Math.round(Number(run.elapsedMs || 0) / 1000)}s`),
                        h('span', null, run.createdAt ? new Date(run.createdAt).toLocaleTimeString('zh-CN', { hour12: false }) : ''),
                      ),
                    )
                  }),
            ),

            // Right: Selected Run Control Detail
            currentTaskRun
              ? h(
                  'div',
                  { style: { ...panelStyle, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' } },
                  // Single Run Header + Control Buttons
                  h(
                    'div',
                    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingBottom: '12px', borderBottom: `1px solid ${T.borderSubtle}` } },
                    h(
                      'div',
                      null,
                      h('div', { style: { fontSize: '15px', fontWeight: 800 } }, currentTaskRun.title || currentTaskRun.id),
                      h(
                        'div',
                        { style: { fontSize: '11.5px', color: T.textMuted, marginTop: '3px', fontFamily: 'Consolas, monospace' } },
                        `ID: ${currentTaskRun.id} · 进度 ${Math.round(Number(currentTaskRun.progress || 0))}% · 已耗时 ${Math.round(Number(currentTaskRun.elapsedMs || 0) / 1000)}s · 模式 ${currentTaskRun.mode || 'ai-coded'}`,
                      ),
                    ),
                    h(
                      'div',
                      { style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
                      currentTaskRun.status === 'paused' || currentTaskRun.status === 'queued'
                        ? h('button', { className: 'dsh-vw-btn', onClick: () => handleTaskControl('resume', currentTaskRun.id), style: blueBtnStyle }, '▶ 开始 / 恢复')
                        : null,
                      currentTaskRun.status === 'running'
                        ? h('button', { className: 'dsh-vw-btn', onClick: () => handleTaskControl('pause', currentTaskRun.id), style: { ...ghostBtnStyle, color: T.accentGold, borderColor: T.accentGoldBorder } }, '⏸ 暂停')
                        : null,
                      currentTaskRun.status === 'running' || currentTaskRun.status === 'paused'
                        ? h('button', { className: 'dsh-vw-btn', onClick: () => handleTaskControl('stop', currentTaskRun.id), style: { ...ghostBtnStyle, color: T.accentRed, borderColor: 'rgba(244,63,94,0.45)' } }, '■ 停止子进程')
                        : null,
                      ['stopped', 'failed', 'completed'].includes(currentTaskRun.status)
                        ? h('button', { className: 'dsh-vw-btn', onClick: () => handleTaskControl('retry', currentTaskRun.id), style: { ...goldBtnStyle, padding: '7px 14px', fontSize: '12px' } }, '↻ 重新/继续执行')
                        : null,
                      currentTaskRun.status === 'completed'
                        ? h('button', { className: 'dsh-vw-btn', onClick: () => setActiveStep(3), style: ghostBtnStyle }, '去监视与精修 →')
                        : null,
                    ),
                  ),
                  currentTaskRun.error
                    ? h(
                        'div',
                        { style: { padding: '9px 12px', borderRadius: '8px', background: T.accentRedBg, color: T.accentRed, fontSize: '12px' } },
                        `⚠ ${currentTaskRun.error}`,
                      )
                    : null,

                  // 4-Agent Team Status Mini Cards
                  h(
                    'div',
                    { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' } },
                    (currentTaskRun.agents || []).map((ag) => {
                      const st = taskStatusStyle(ag.status)
                      return h(
                        'div',
                        { key: ag.id, style: { padding: '10px', borderRadius: '10px', background: T.bgElevated, border: `1px solid ${ag.status === 'running' ? T.accentBlueBorder : T.borderSubtle}` } },
                        h(
                          'div',
                          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', fontWeight: 800 } },
                          h('span', null, ag.name),
                          h('span', { style: { fontSize: '10px', color: st.color } }, st.label),
                        ),
                        h('div', { style: { fontSize: '10.5px', color: T.textMuted, marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, ag.message || ag.subtitle),
                      )
                    }),
                  ),

                  // Subtask Rows Table
                  h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '7px' } },
                    h('div', { style: { fontSize: '12px', fontWeight: 800, color: T.textSecondary } }, '子任务实时清单'),
                    (currentTaskRun.tasks || []).map((t) => {
                      const st = taskStatusStyle(t.status)
                      return h(
                        'div',
                        {
                          key: t.id,
                          style: {
                            padding: '10px 12px',
                            borderRadius: '10px',
                            background: T.bgElevated,
                            border: `1px solid ${t.status === 'running' ? T.accentBlueBorder : T.borderSubtle}`,
                            display: 'grid',
                            gridTemplateColumns: 'minmax(160px, 1.2fr) 130px 70px minmax(0, 1.4fr) auto',
                            gap: '10px',
                            alignItems: 'center',
                          },
                        },
                        h(
                          'div',
                          null,
                          h('div', { style: { fontSize: '12.5px', fontWeight: 700 } }, t.name),
                          h('div', { style: { fontSize: '10.5px', color: T.textMuted, fontFamily: 'Consolas, monospace' } }, `${t.stage} · ${t.kind}`),
                        ),
                        h(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                          h(
                            'div',
                            { style: { flex: 1, height: '5px', borderRadius: '99px', background: 'rgba(128,128,128,0.22)', overflow: 'hidden' } },
                            h('div', { style: { width: `${Math.round(Number(t.progress || 0))}%`, height: '100%', background: st.color } }),
                          ),
                          h('span', { style: { fontSize: '10.5px', fontFamily: 'Consolas, monospace', width: '32px', textAlign: 'right' } }, `${Math.round(Number(t.progress || 0))}%`),
                        ),
                        h('span', { style: { fontSize: '11px', fontFamily: 'Consolas, monospace', color: T.textMuted } }, `${Math.round(Number(t.elapsedMs || 0) / 1000)}s`),
                        h(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 } },
                          h('span', { style: { fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: st.bg, color: st.color, fontWeight: 700, flexShrink: 0 } }, st.label),
                          h('span', { style: { fontSize: '11px', color: T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t.error || t.message),
                        ),
                        h(
                          'button',
                          {
                            className: 'dsh-vw-btn',
                            disabled: currentTaskRun.status === 'running',
                            onClick: () => handleTaskControl('retry', currentTaskRun.id, t.id),
                            style: { ...ghostBtnStyle, padding: '4px 9px', fontSize: '10.5px' },
                          },
                          '从此重试',
                        ),
                      )
                    }),
                  ),

                  // Live Log Console
                  h(
                    'div',
                    null,
                    h('div', { style: { fontSize: '12px', fontWeight: 800, color: T.textSecondary, marginBottom: '6px' } }, '协同实时日志流'),
                    h(
                      'div',
                      {
                        className: 'dsh-vw-scroll',
                        style: {
                          maxHeight: '190px',
                          overflowY: 'auto',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          background: '#05070B',
                          border: '1px solid rgba(255,255,255,0.1)',
                          fontFamily: 'Consolas, monospace',
                          fontSize: '11px',
                          lineHeight: 1.6,
                          color: '#CBD5E1',
                        },
                      },
                      (currentTaskRun.logs || []).slice(-45).map((lg, idx) =>
                        h(
                          'div',
                          {
                            key: idx,
                            style: {
                              color: lg.level === 'error' ? '#FB7185' : lg.level === 'warn' ? '#FBBF24' : '#CBD5E1',
                            },
                          },
                          `[${lg.ts ? new Date(lg.ts).toLocaleTimeString('zh-CN', { hour12: false }) : '--:--:--'}] [${lg.stage || 'sys'}] ${lg.message}`,
                        ),
                      ),
                    ),
                  ),
                )
              : h(
                  'div',
                  { style: { ...panelStyle, padding: '40px', textAlign: 'center', color: T.textMuted, fontSize: '13px' } },
                  '尚未选定或启动流水线任务。请前往「01 素材与拍摄」或点击右上角「新建一键出片任务」启动 4 大 AI Agent 协同生产。',
                ),
          ),
        ),
      )

      // -----------------------------------------------------------------------
      // MODAL: BACKGROUND SKINS & FROSTED GLASS TUNER
      // -----------------------------------------------------------------------
      const activeSkinPreset = SKIN_PRESETS.find((s) => s.id === skinConfig.id) || SKIN_PRESETS[0]

      const skinModal = showSkinModal
        ? h(
            'div',
            {
              onClick: () => setShowSkinModal(false),
              style: {
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.68)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2500,
                padding: '20px',
              },
            },
            h(
              'div',
              {
                onClick: (ev) => ev.stopPropagation(),
                style: { ...panelStyle, width: '580px', maxWidth: '100%', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' },
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('h3', { style: { margin: 0, fontSize: '16px', fontWeight: 800 } }, '🎨 AI 作战大屏背景皮肤与磨砂质感设置'),
                h('button', { onClick: () => setShowSkinModal(false), style: { background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer' } }, h(Icon, { name: 'x', size: 16 })),
              ),
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' } },
                SKIN_PRESETS.map((sk) => {
                  const on = skinConfig.id === sk.id
                  return h(
                    'div',
                    {
                      key: sk.id,
                      onClick: () => setSkinConfig((prev) => ({ ...prev, id: sk.id })),
                      style: {
                        borderRadius: '10px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: `2px solid ${on ? T.accentBlue : T.borderSubtle}`,
                        background: T.bgElevated,
                      },
                    },
                    h('div', { style: { height: '64px', background: resolvedDark ? sk.css : sk.lightCss } }),
                    h(
                      'div',
                      { style: { padding: '7px 9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                      h('span', { style: { fontSize: '11.5px', fontWeight: 700 } }, sk.name),
                      h('span', { style: { fontSize: '9.5px', color: on ? T.accentBlue : T.textMuted } }, on ? '✓ 当前' : sk.badge),
                    ),
                  )
                }),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '10px 12px', borderRadius: '10px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}` } },
                h('span', { style: { fontSize: '12px', fontWeight: 700 } }, skinConfig.customUrl ? '已使用自定义壁纸背景图片' : '自定义导入个人背景壁纸图 (.jpg/.png/.webp)'),
                h(
                  'div',
                  { style: { display: 'flex', gap: '7px' } },
                  h(
                    'button',
                    { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: () => skinFileInputRef.current?.click(), style: blueBtnStyle },
                    h(Icon, { name: 'upload', size: 13 }),
                    '上传自定义图片皮肤',
                  ),
                  skinConfig.customUrl
                    ? h(
                        'button',
                        { className: 'dsh-vw-btn', onClick: () => setSkinConfig((prev) => ({ ...prev, id: 'obsidian-nebula', customUrl: '' })), style: ghostBtnStyle },
                        '恢复预设',
                      )
                    : null,
                ),
              ),
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' } },
                h(
                  'label',
                  { style: { fontSize: '12px', fontWeight: 600 } },
                  `背景虚化模糊度: ${skinConfig.blurPx}px`,
                  h('input', {
                    type: 'range',
                    min: 0,
                    max: 36,
                    step: 1,
                    value: skinConfig.blurPx,
                    onChange: (ev) => setSkinConfig((prev) => ({ ...prev, blurPx: Number(ev.target.value) })),
                    style: { width: '100%', marginTop: '6px' },
                  }),
                ),
                h(
                  'label',
                  { style: { fontSize: '12px', fontWeight: 600 } },
                  `背景图显色强度: ${Math.round(skinConfig.opacity * 100)}%`,
                  h('input', {
                    type: 'range',
                    min: 0.25,
                    max: 1.0,
                    step: 0.05,
                    value: skinConfig.opacity,
                    onChange: (ev) => setSkinConfig((prev) => ({ ...prev, opacity: Number(ev.target.value) })),
                    style: { width: '100%', marginTop: '6px' },
                  }),
                ),
              ),
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'flex-end' } },
                h('button', { className: 'dsh-vw-btn', onClick: () => setShowSkinModal(false), style: goldBtnStyle }, '完成应用'),
              ),
            ),
          )
        : null

      return h(
        'div',
        {
          className: 'dsh-vw-root',
          'data-dsh-main-workbench': 'true',
          'data-theme-mode': resolvedDark ? 'dark' : 'light',
          style: {
            position: isMainSlot ? 'relative' : 'fixed',
            inset: isMainSlot ? undefined : 0,
            width: '100%',
            height: isMainSlot ? '100%' : '100vh',
            zIndex: isMainSlot ? 1 : 2100,
            display: 'flex',
            background: T.bgApp,
            color: T.textPrimary,
            fontFamily: 'Microsoft YaHei, PingFang SC, Segoe UI, sans-serif',
            overflow: 'hidden',
          },
        },
        // Fixed Switchable Wallpaper Skin Layer behind frosted glass panels + Live Animated Telemetry Canvas
        h('div', {
          'aria-hidden': 'true',
          style: {
            position: 'absolute',
            inset: '-20px',
            zIndex: 0,
            pointerEvents: 'none',
            background:
              skinConfig.id === 'custom-image' && skinConfig.customUrl
                ? `url("${skinConfig.customUrl}") center / cover no-repeat`
                : resolvedDark
                  ? activeSkinPreset.css
                  : activeSkinPreset.lightCss,
            opacity: skinConfig.opacity,
            filter: skinConfig.blurPx > 0 ? `blur(${skinConfig.blurPx}px)` : 'none',
          },
        }),
        h(WarRoomCanvasBackdrop, { active: hasLiveTask || Boolean(busyLabel), dark: resolvedDark }),
        hiddenInputs,
        h(
          'div',
          { style: { position: 'relative', zIndex: 1, display: 'flex', width: '100%', height: '100%', overflow: 'hidden' } },
          showProjectDrawer
            ? h(
                'div',
                {
                  onClick: () => setShowProjectDrawer(false),
                  style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 60,
                    background: 'rgba(3, 6, 12, 0.55)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                  },
                },
                h(
                  'div',
                  {
                    onClick: (ev) => ev.stopPropagation(),
                    style: { height: '100%', boxShadow: '18px 0 48px rgba(0, 0, 0, 0.55)' },
                  },
                  sidebar,
                ),
              )
            : null,
          h(
            'div',
            { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } },
            topBar,
            statusBanner,
            activeStep === 0
              ? warRoomView
              : activeStep === 1
                ? step1View
                : activeStep === 2
                  ? step2View
                  : activeStep === 3
                    ? step3View
                    : activeStep === 4
                      ? step4View
                      : taskCenterView,
          ),
        ),
        newProjectModal,
        llmModal,
        codeDrawer,
        voiceModal,
        vendorModal,
        skinModal,
      )
    }

    return {
      name: 'dsh-web-video-workbench-client',
      inject: ['slots', 'connection'],
      apply(ctx) {
        ctx.slots.register('shell.overlay', {
          id: 'video-workbench-topbar-capsule',
          order: 80,
          render: () => h(PanelBoundary, null, h(VideoWorkbenchApp, { ctx, isMainSlot: false })),
        })

        ctx.slots.register('sidebar.panellist', {
          key: 'video-workbench',
          label: '电影视频工坊',
          order: 35,
          render: () => h(SidebarVideoIcon),
        })

        ctx.slots.register('main', {
          key: 'video-workbench',
          render: () => h(PanelBoundary, null, h(VideoWorkbenchApp, { ctx, isMainSlot: true })),
        })

        ctx.slots.register('tool.call.toolview', {
          id: 'video-workbench-toolview',
          order: 25,
          render: (props) => h(PanelBoundary, null, h(VideoToolCallCard, props)),
        })
      },
    }
  },
})
