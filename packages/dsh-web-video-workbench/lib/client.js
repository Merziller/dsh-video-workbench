/**
 * DSH Video Workbench — Cinema-Grade Theme-Adaptive Studio (`dsh-web-video-workbench`)
 * Dual-Track Creation:
 *   Track A: 0-Token Local Draft & IndexTTS-2 Voice Practice
 *   Track B: Model-Agnostic LLM Coding (Remotion TSX / HyperFrames HTML + DSP Audio + 3-Round Auto-Repair + FFmpeg QA)
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
      'ai_create_video',
      'ai_refine_scene',
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

      // Model-Agnostic LLM Config
      const [llmConfig, setLlmConfig] = useState(null)
      const [showLlmModal, setShowLlmModal] = useState(false)
      const [llmForm, setLlmForm] = useState({
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

      // Director Studio Form (Step 2)
      const [directorForm, setDirectorForm] = useState({
        topic: '',
        style: 'cinematic',
        engine: 'remotion',
        aspectRatio: 'auto',
        quality: '1080p',
        customWidth: 1080,
        customHeight: 1920,
        aiBadge: false,
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
          provider: cfg.provider || 'custom',
          format: cfg.format || 'auto',
          baseUrl: cfg.baseUrl || '',
          apiKey: cfg.hasApiKey ? 'KEEP_EXISTING' : '',
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
                aspectRatio: ap.script?.requestedAspectRatio || ap.script?.aspectRatio || prev.aspectRatio || 'auto',
                quality: ap.script?.quality || prev.quality || '1080p',
                customWidth: Number(ap.script?.width) || prev.customWidth || 1080,
                customHeight: Number(ap.script?.height) || prev.customHeight || 1920,
                aiBadge: Boolean(ap.script?.aiBadge),
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
          provider: providerId,
          format: tpl?.defaultFormat || 'auto',
          baseUrl: tpl?.defaultBaseUrl !== undefined && (prev.baseUrl === '' || prev.provider !== providerId) ? tpl.defaultBaseUrl : prev.baseUrl,
          model: prev.provider !== providerId && tpl?.suggestedModels?.[0] ? tpl.suggestedModels[0] : prev.model,
        }))
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
          notify(
            `大模型 AI 编程出片完成！编译与 ${rounds} 轮自检通过，画幅 ${finalData.script?.width}×${finalData.script?.height}`,
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

      const handleUpdateFormatQuick = async (nextRatio, nextQuality) => {
        if (!activeProjectDir) return
        setBusyLabel('正在切换视频比例与画布尺寸...')
        try {
          const res = await connFetch('/api/video-workbench/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              action: 'update-format',
              aspectRatio: nextRatio,
              quality: nextQuality,
            }),
          })
          const data = await res.json()
          if (data.ok) {
            setAssetVersion((v) => v + 1)
            await refreshState(activeProjectDir)
            notify(data.dimensions?.reason || '画幅已更新', 'success')
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

      const handleAiRefine = async () => {
        if (!activeProjectDir || !refinePrompt.trim()) {
          notify('请输入你希望 AI 调整画面/特效/文案的意见', 'error')
          return
        }
        if (!llmConfig?.configured) {
          setShowLlmModal(true)
          notify('请先配置大模型接口后再使用自然语言精修', 'info')
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
              instruction: refinePrompt.trim(),
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
            h('span', null, `本地音色库: ${voiceCatalog.length} 个音色`),
          ),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            h('span', { style: { width: '7px', height: '7px', borderRadius: '50%', background: llmConfig?.configured ? T.accentBlue : T.textMuted } }),
            h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, llmConfig?.configured ? `大模型: ${llmConfig.model}` : '大模型: 待点击右上角配置'),
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
            llmConfig?.configured ? llmConfig.model : '配置大模型',
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
              // Voice Selection Strip
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '10px', background: T.bgElevated, border: `1px solid ${T.borderSubtle}` } },
                h(
                  'div',
                  null,
                  h('div', { style: { fontSize: '11px', color: T.textMuted } }, '本地配音音色库 (IndexTTS-2 零上传隐私配音)'),
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
                'button',
                {
                  className: 'dsh-vw-btn',
                  onClick: () => setShowSafeGuides((v) => !v),
                  style: { ...ghostBtnStyle, padding: '4px 10px', color: showSafeGuides ? T.accentGold : T.textSecondary },
                },
                '安全框参考线',
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
              // Optional Safe-Zone Viewfinder Overlay
              showSafeGuides
                ? h(
                    'div',
                    {
                      style: {
                        position: 'absolute',
                        inset: '8%',
                        border: '1px dashed rgba(229, 169, 60, 0.55)',
                        pointerEvents: 'none',
                      },
                    },
                    h('div', { style: { position: 'absolute', left: '33.33%', top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,0.12)' } }),
                    h('div', { style: { position: 'absolute', left: '66.66%', top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,0.12)' } }),
                    h('div', { style: { position: 'absolute', top: '33.33%', left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.12)' } }),
                    h('div', { style: { position: 'absolute', top: '66.66%', left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.12)' } }),
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
              h('span', { style: { fontSize: '12px', fontWeight: 800, color: T.accentBlue } }, '💬 对 AI 说（自然语言精修）'),
              historyCount > 0
                ? h(
                    'button',
                    { className: 'dsh-vw-btn', onClick: handleRollbackVersion, style: { ...ghostBtnStyle, padding: '3px 8px', fontSize: '11px' } },
                    h(Icon, { name: 'undo', size: 11 }),
                    `撤回 (${historyCount})`,
                  )
                : null,
            ),
            h('textarea', {
              rows: 3,
              value: refinePrompt,
              onChange: (ev) => setRefinePrompt(ev.target.value),
              placeholder: '例如：把这一幕改成震撼的数据数字滚动特效，配色更暖一点，背景节拍更紧凑...',
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
      const llmModal = showLlmModal
        ? h(
            'div',
            { style: modalBackdropStyle, onClick: () => setShowLlmModal(false) },
            h(
              'div',
              {
                className: 'dsh-vw-scroll',
                style: { ...panelStyle, width: '620px', maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' },
                onClick: (ev) => ev.stopPropagation(),
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('h3', { style: { margin: 0, fontSize: '17px', fontWeight: 800 } }, '🤖 接入任意 AI 大模型（模型无关架构）'),
                h('button', { onClick: () => setShowLlmModal(false), style: { background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer' } }, h(Icon, { name: 'x', size: 17 })),
              ),
              h('p', { style: { margin: 0, fontSize: '12px', color: T.textSecondary, lineHeight: 1.55 } }, '支持 Claude Opus/Sonnet、DeepSeek、OpenAI、Gemini、OpenRouter、Ollama 或任意第三方中转接口。AI 大模型负责编写动态视觉源码、分镜脚本与编曲参数；配音则始终调用您本机的 IndexTTS-2 零成本音色库。'),
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
                { style: { display: 'grid', gridTemplateColumns: '1fr 160px', gap: '10px' } },
                h(
                  'div',
                  null,
                  h('label', { style: { fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' } }, 'API 接口地址 (Base URL)'),
                  h('input', {
                    value: llmForm.baseUrl,
                    onChange: (ev) => setLlmForm((p) => ({ ...p, baseUrl: ev.target.value })),
                    placeholder: 'https://api.anthropic.com 或 任意兼容中转 URL',
                    style: inputStyle,
                  }),
                ),
                h(
                  'div',
                  null,
                  h('label', { style: { fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' } }, '接口协议格式'),
                  h(
                    'select',
                    {
                      value: llmForm.format,
                      onChange: (ev) => setLlmForm((p) => ({ ...p, format: ev.target.value })),
                      style: inputStyle,
                    },
                    h('option', { value: 'auto' }, 'Auto 自动识别'),
                    h('option', { value: 'openai' }, 'OpenAI 兼容'),
                    h('option', { value: 'anthropic' }, 'Anthropic Claude'),
                  ),
                ),
              ),
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
                h(
                  'div',
                  null,
                  h('label', { style: { fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' } }, `API Key ${llmConfig?.hasApiKey ? `(已存: ${llmConfig.maskedApiKey})` : ''}`),
                  h('input', {
                    type: 'password',
                    value: llmForm.apiKey,
                    onChange: (ev) => setLlmForm((p) => ({ ...p, apiKey: ev.target.value })),
                    placeholder: llmConfig?.hasApiKey ? '留空即保留原密钥' : 'sk-...',
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
                    placeholder: '例如 claude-opus-5-5 / deepseek-chat',
                    style: inputStyle,
                  }),
                ),
              ),
              // Suggested or fetched model chips
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
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('h3', { style: { margin: 0, fontSize: '16px', fontWeight: 800 } }, `本地人声音色库 (${voiceCatalog.length} 个)`),
                h('button', { onClick: () => setShowVoiceModal(false), style: { background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer' } }, h(Icon, { name: 'x', size: 16 })),
              ),
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
