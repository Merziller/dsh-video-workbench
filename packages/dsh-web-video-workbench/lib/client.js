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
      bgApp: '#090B10',
      bgSidebar: '#0D1017',
      bgPanel: '#121621',
      bgElevated: '#181E2C',
      bgInput: '#0A0D14',
      borderSubtle: 'rgba(255, 255, 255, 0.08)',
      borderStrong: 'rgba(255, 255, 255, 0.16)',
      textPrimary: '#F3F4F8',
      textSecondary: '#9CA3B5',
      textMuted: '#68738A',
      accentGold: '#E5A93C',
      accentGoldBg: 'rgba(229, 169, 60, 0.14)',
      accentGoldBorder: 'rgba(229, 169, 60, 0.42)',
      accentBlue: '#38BDF8',
      accentBlueBg: 'rgba(56, 189, 248, 0.14)',
      accentBlueBorder: 'rgba(56, 189, 248, 0.42)',
      accentGreen: '#22C55E',
      accentGreenBg: 'rgba(34, 197, 94, 0.14)',
      accentRed: '#F43F5E',
      accentRedBg: 'rgba(244, 63, 94, 0.14)',
      monitorShell: '#040508',
      shadowCard: '0 16px 40px rgba(0, 0, 0, 0.45)',
      scrollThumb: 'rgba(255, 255, 255, 0.14)',
    }

    const LIGHT_THEME = {
      mode: 'light',
      bgApp: '#F5F4F0',
      bgSidebar: '#ECEAE3',
      bgPanel: '#FFFFFF',
      bgElevated: '#F9F8F5',
      bgInput: '#F3F2EE',
      borderSubtle: 'rgba(15, 23, 42, 0.09)',
      borderStrong: 'rgba(15, 23, 42, 0.18)',
      textPrimary: '#111827',
      textSecondary: '#4B5563',
      textMuted: '#6B7280',
      accentGold: '#B7791F',
      accentGoldBg: 'rgba(183, 121, 31, 0.11)',
      accentGoldBorder: 'rgba(183, 121, 31, 0.36)',
      accentBlue: '#2563EB',
      accentBlueBg: 'rgba(37, 99, 235, 0.1)',
      accentBlueBorder: 'rgba(37, 99, 235, 0.34)',
      accentGreen: '#16A34A',
      accentGreenBg: 'rgba(22, 163, 74, 0.1)',
      accentRed: '#E11D48',
      accentRedBg: 'rgba(225, 29, 72, 0.1)',
      monitorShell: '#090B10', // Cinema monitors stay reference-black for true color accuracy
      shadowCard: '0 12px 32px rgba(15, 23, 42, 0.06)',
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
      const [activeStep, setActiveStep] = useState(1)
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

      const notify = useCallback((message, type = 'info') => {
        setToast({ message, type, id: Date.now() })
      }, [])

      useEffect(() => {
        if (!toast || toast.type === 'error') return
        const id = setTimeout(() => setToast(null), 6000)
        return () => clearTimeout(id)
      }, [toast])

      // Inject dynamic theme-aware CSS rules
      const themeCss = useMemo(
        () => `
        .dsh-vw-root * { box-sizing: border-box; }
        .dsh-vw-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .dsh-vw-scroll::-webkit-scrollbar-track { background: transparent; }
        .dsh-vw-scroll::-webkit-scrollbar-thumb { background: ${T.scrollThumb}; border-radius: 99px; }
        .dsh-vw-btn { transition: background-color 0.14s ease, border-color 0.14s ease, opacity 0.14s ease, transform 0.1s ease; cursor: pointer; }
        .dsh-vw-btn:hover:not(:disabled) { filter: brightness(1.06); }
        .dsh-vw-btn:active:not(:disabled) { transform: scale(0.985); }
        .dsh-vw-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      `,
        [T.scrollThumb],
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

            if (data.activeProject) {
              const ap = data.activeProject
              setActiveProjectDir(ap.projectDir)
              setScript(ap.script)
              setProjectAssets(ap.assets || [])
              setAssetSummary(ap.assetSummary || { image: 0, video: 0, music: 0, sfx: 0, notes: 0 })
              setHasMp4(Boolean(ap.hasMp4))
              setHasSnapshot(Boolean(ap.hasSnapshot))
              setHasMasterAudio(Boolean(ap.hasMasterAudio))
              setQaReport(ap.qaReport || null)
              setBuildLog(ap.buildLog || null)
              setHistoryCount(Number(ap.historyCount) || 0)
              setScriptDirty(false)

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
                const sceneCount = ap.script?.scenes?.length || 0
                if (opts.preferredStep) setActiveStep(opts.preferredStep)
                else if (ap.hasMp4) setActiveStep(3)
                else if (sceneCount > 0) setActiveStep(3)
                else setActiveStep(1)
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
        setActiveProjectDir(dir)
        await refreshState(dir, { autoStep: true })
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

      const handleUploadFiles = async (fileList) => {
        if (!activeProjectDir || !fileList || fileList.length === 0) return
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
            body: JSON.stringify({ projectDir: activeProjectDir, files: filesPayload }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`上传失败: ${data.error}`, 'error')
            return
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
      // REUSABLE STYLES (Computed cleanly from Adaptive Theme `T`)
      // -----------------------------------------------------------------------
      const panelStyle = {
        background: T.bgPanel,
        border: `1px solid ${T.borderSubtle}`,
        borderRadius: '14px',
        boxShadow: T.shadowCard,
      }

      const inputStyle = {
        width: '100%',
        padding: '9px 12px',
        borderRadius: '9px',
        background: T.bgInput,
        border: `1px solid ${T.borderStrong}`,
        color: T.textPrimary,
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
          ? 'linear-gradient(135deg, #E5A93C, #C88318)'
          : 'linear-gradient(135deg, #111827, #1F2937)',
        border: 'none',
        color: resolvedDark ? '#0B0D12' : '#FFFFFF',
        fontSize: '13px',
        fontWeight: 700,
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
        color: '#FFFFFF',
        fontSize: '13px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }

      const ghostBtnStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '7px 13px',
        borderRadius: '9px',
        background: resolvedDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
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
            h('span', { style: { fontWeight: 800, fontSize: '14px', letterSpacing: '0.02em' } }, 'DSH 电影工坊'),
          ),
          h(
            'button',
            {
              className: 'dsh-vw-btn',
              onClick: () => setShowNewModal(true),
              style: { ...ghostBtnStyle, padding: '4px 9px', fontSize: '12px', color: T.accentGold, borderColor: T.accentGoldBorder },
            },
            h(Icon, { name: 'plus', size: 12 }),
            '新建',
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
      // TOP CINEMA HEADER BAR
      // -----------------------------------------------------------------------
      const topBar = h(
        'header',
        {
          style: {
            height: '58px',
            flexShrink: 0,
            padding: '0 20px',
            background: T.bgSidebar,
            borderBottom: `1px solid ${T.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          },
        },
        // Left: Project badge + format specs
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 } },
          h('span', { style: { fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '185px' } }, script?.title || '未命名影片'),
          script
            ? h(
                'span',
                {
                  style: {
                    fontSize: '11px',
                    fontFamily: 'Consolas, monospace',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: T.accentGoldBg,
                    color: T.accentGold,
                    border: `1px solid ${T.accentGoldBorder}`,
                    whiteSpace: 'nowrap',
                  },
                },
                `${script.aspectRatio || (curW < curH ? '9:16' : '16:9')} · ${curW}×${curH}`,
              )
            : null,
          script?.authoringMode === 'ai-coded'
            ? h(
                'span',
                {
                  style: {
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: T.accentBlueBg,
                    color: T.accentBlue,
                    border: `1px solid ${T.accentBlueBorder}`,
                    whiteSpace: 'nowrap',
                  },
                },
                `AI 编程创作`,
              )
            : null,
        ),
        // Center: Clean 4-Step Film Navigation
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          [
            { id: 1, label: '01 素材' },
            { id: 2, label: '02 导演与模型' },
            { id: 3, label: '03 监视与精修' },
            { id: 4, label: '04 导出与质检' },
          ].map((st) => {
            const active = activeStep === st.id
            return h(
              'button',
              {
                key: st.id,
                className: 'dsh-vw-btn',
                onClick: () => {
                  setIsPlaying(false)
                  setActiveStep(st.id)
                },
                style: {
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: active ? 700 : 500,
                  background: active ? T.accentGoldBg : 'transparent',
                  border: `1px solid ${active ? T.accentGoldBorder : T.borderSubtle}`,
                  color: active ? T.accentGold : T.textSecondary,
                },
              },
              st.label,
            )
          }),
        ),
        // Right: LLM Config Capsule + 3-Way Theme Toggle
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 } },
          h(
            'button',
            {
              className: 'dsh-vw-btn',
              onClick: () => setShowLlmModal(true),
              style: {
                ...ghostBtnStyle,
                borderColor: llmConfig?.configured ? T.accentBlueBorder : T.accentGoldBorder,
                color: llmConfig?.configured ? T.accentBlue : T.accentGold,
              },
            },
            h(Icon, { name: 'cpu', size: 13 }),
            llmConfig?.configured
              ? `${llmConfig.mode === 'follow-dsh' ? 'DSH · ' : ''}${llmConfig.model}`
              : '配置大模型',
          ),
          // 3-Mode Theme Switcher
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
              { id: 'dark', label: '暗夜', title: '电影黑金暗色主题' },
              { id: 'light', label: '浅色', title: '高定画报浅色主题' },
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
                    padding: '4px 8px',
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
                  style: ghostBtnStyle,
                },
                '返回对话',
              )
            : null,
        ),
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
      // STEP 1: ASSETS STUDIO
      // -----------------------------------------------------------------------
      const step1View = h(
        'div',
        { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '26px 32px' } },
        h(
          'div',
          { style: { maxWidth: '1020px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' } },
          h(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px' } },
            h(
              'div',
              null,
              h('h2', { style: { fontSize: '21px', fontWeight: 800, margin: 0 } }, '01 · 导入您的创作素材库'),
              h('p', { style: { margin: '6px 0 0', fontSize: '13px', color: T.textSecondary } }, '支持拖拽或选择图片、实拍视频、背景音乐、音效与文案。AI 将根据这些素材的横纵比与内容自动写码成片。'),
            ),
            h(
              'button',
              { className: 'dsh-vw-btn', onClick: () => setActiveStep(2), style: goldBtnStyle },
              '下一步：设定比例与 AI 导演 →',
            ),
          ),
          // Drag & Drop + Folder Path Import
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
                padding: '28px',
                borderStyle: 'dashed',
                borderWidth: '2px',
                borderColor: isDragging ? T.accentGold : T.borderStrong,
                textAlign: 'center',
              },
            },
            h('div', { style: { fontSize: '15px', fontWeight: 700, marginBottom: '6px' } }, '把图片、视频或音频拖到这里，或点击按钮选取'),
            h('div', { style: { fontSize: '12px', color: T.textMuted, marginBottom: '16px' } }, '自动执行 ffprobe 识别真实宽高与时长，全部素材安全保留在当前工程目录'),
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' } },
              h('button', { className: 'dsh-vw-btn', onClick: () => fileInputRef.current?.click(), style: blueBtnStyle }, h(Icon, { name: 'upload', size: 14 }), ' 选择多文件'),
              h('button', { className: 'dsh-vw-btn', onClick: () => folderInputRef.current?.click(), style: ghostBtnStyle }, h(Icon, { name: 'folder', size: 14 }), ' 选择整个文件夹'),
              h('button', { className: 'dsh-vw-btn', onClick: () => bgmInputRef.current?.click(), style: ghostBtnStyle }, '🎵 上传配乐 BGM'),
              h('button', { className: 'dsh-vw-btn', onClick: () => setShowVendorModal(true), style: ghostBtnStyle }, '✨ 导入 .motion 动效片段'),
            ),
            h(
              'div',
              { style: { maxWidth: '640px', margin: '0 auto', display: 'flex', gap: '8px' } },
              h('input', {
                value: assetDirInput,
                onChange: (ev) => setAssetDirInput(ev.target.value),
                onKeyDown: (ev) => ev.key === 'Enter' && handleImportByPath(),
                placeholder: '也可粘贴本机素材文件夹绝对路径 (如 D:\\Clips\\Product)',
                style: inputStyle,
              }),
              h('button', { className: 'dsh-vw-btn', onClick: handleImportByPath, style: ghostBtnStyle }, '路径导入'),
            ),
          ),
          // Filter Tabs & Grid
          h(
            'div',
            { style: { ...panelStyle, padding: '18px' } },
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' } },
              h(
                'div',
                { style: { display: 'flex', gap: '6px' } },
                [
                  { id: 'all', label: `全部 (${projectAssets.length})` },
                  { id: 'image', label: `图片 (${assetSummary.image || 0})` },
                  { id: 'video', label: `视频 (${assetSummary.video || 0})` },
                  { id: 'audio', label: `音乐/音效 (${(assetSummary.music || 0) + (assetSummary.sfx || 0)})` },
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
              h('span', { style: { fontSize: '12px', color: T.textMuted } }, '提示：没有素材时 AI 也可纯靠代码粒子、3D排版与图表创作'),
            ),
            filteredAssets.length === 0
              ? h('div', { style: { padding: '26px', textAlign: 'center', color: T.textMuted, fontSize: '13px' } }, '暂未导入此类素材，您可以继续下一步让 AI 创意生成，或点击上方按钮上传素材。')
              : h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))', gap: '12px' } },
                  filteredAssets.map((a) =>
                    h(
                      'div',
                      {
                        key: a.id,
                        style: {
                          borderRadius: '10px',
                          overflow: 'hidden',
                          background: T.bgElevated,
                          border: `1px solid ${T.borderSubtle}`,
                        },
                      },
                      h(
                        'div',
                        { style: { height: '108px', background: '#07090F', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
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
                            : h('span', { style: { fontSize: '26px' } }, a.role === 'music' ? '🎵' : '🔊'),
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
                        { style: { padding: '8px 10px' } },
                        h('div', { style: { fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.name),
                        h(
                          'div',
                          { style: { fontSize: '11px', color: T.textMuted, marginTop: '2px', fontFamily: 'Consolas, monospace' } },
                          a.width && a.height ? `${a.width}×${a.height}` : a.durationSec ? `${Number(a.durationSec).toFixed(1)}s` : a.role || a.type,
                        ),
                      ),
                    ),
                  ),
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
                      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
                      h(
                        'span',
                        { style: { fontSize: '11px', color: T.textSecondary } },
                        script?.bgm?.uploadedPath || script?.bgm?.path
                          ? `当前已挂载个人配乐: ${script.bgm.uploadedPath || script.bgm.path}`
                          : `当前工程已导入 ${assetSummary.music || 0} 首个人配乐（上传后将优先用作背景音乐）`,
                      ),
                      h(
                        'button',
                        { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: () => bgmInputRef.current?.click(), style: { ...blueBtnStyle, fontSize: '11px', padding: '5px 11px' } },
                        '🎵 选择本地音频文件上传',
                      ),
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
              // Voice Selection Strip
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '10px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}` } },
                h(
                  'div',
                  null,
                  h('div', { style: { fontSize: '11px', color: T.textMuted } }, '本地配音音色库 (IndexTTS-2.5 零上传隐私配音)'),
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
                  '挑选音色',
                ),
              ),
              // DUAL-TRACK EXECUTION CARDS
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '9px', paddingTop: '4px', borderTop: `1px solid ${T.borderSubtle}` } },
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
          // Clean Compact Scene Timeline Strip
          h(
            'div',
            {
              className: 'dsh-vw-scroll',
              style: {
                padding: '10px 18px',
                background: T.bgPanel,
                borderTop: `1px solid ${T.borderSubtle}`,
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                flexShrink: 0,
              },
            },
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
                    minWidth: '155px',
                    flex: `${Math.max(1, Number(sc.durationSec) || 3)} 1 0`,
                    padding: '8px 11px',
                    borderRadius: '9px',
                    cursor: 'pointer',
                    background: isSel ? T.accentGoldBg : T.bgElevated,
                    border: `1.5px solid ${isSel ? T.accentGoldBorder : isPlayNow ? T.accentBlueBorder : T.borderSubtle}`,
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: isSel ? T.accentGold : T.textMuted, fontFamily: 'Consolas, monospace' } },
                  h('span', null, `S${String(idx + 1).padStart(2, '0')}`),
                  h('span', null, `${Number(sc.durationSec || 0).toFixed(1)}s`),
                ),
                h(
                  'div',
                  { style: { fontSize: '12px', fontWeight: 700, marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  sc.title || `第 ${idx + 1} 幕`,
                ),
              )
            }),
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
        hiddenInputs,
        sidebar,
        h(
          'div',
          { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } },
          topBar,
          statusBanner,
          activeStep === 1 ? step1View : activeStep === 2 ? step2View : activeStep === 3 ? step3View : step4View,
        ),
        newProjectModal,
        llmModal,
        codeDrawer,
        voiceModal,
        vendorModal,
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
