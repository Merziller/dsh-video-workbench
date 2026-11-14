/**
 * DSH Video Workbench — Minimalist 4-Step Guided Video Studio (`dsh-web-video-workbench`)
 * Plain ES Module (React.createElement, no JSX compilation needed).
 * Compatible with both standalone preview (`dsh-runner.mjs`) and DSH Desktop slots.
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
      'video_lint',
      'video_snapshot',
      'video_render',
    ])

    const STYLE_OPTIONS = [
      { id: 'tech', label: '科技现代', desc: '深蓝利落 · 数据动效', swatch: '#3B82F6' },
      { id: 'cinematic', label: '电影大片', desc: '黑金质感 · 宽幅转场', swatch: '#F59E0B' },
      { id: 'documentary', label: '人文纪录', desc: '平静克制 · 旁白叙事', swatch: '#10B981' },
      { id: 'energetic', label: '潮流活泼', desc: '动感节奏 · 视觉撞色', swatch: '#EC4899' },
      { id: 'warm', label: '温暖故事', desc: '柔和暖调 · 细腻情感', swatch: '#F97316' },
    ]

    const TOPIC_PRESETS = [
      {
        label: '产品亮点短片',
        topic: '介绍一款高效率智能工作台：先指出日常繁琐痛点，再展示核心亮点功能与实际效果，最后号召立即体验。',
      },
      {
        label: '知识科普讲解',
        topic: '用通俗易懂的三段式结构科普一个专业概念：提出有趣问题、结合画面原理拆解、总结核心结论。',
      },
      {
        label: '旅行 / 生活记录',
        topic: '围绕导入的风景照片与视频片段，以温暖松弛的口吻串联起沿途见闻、高光瞬间与心情总结。',
      },
    ]

    const MOTION_OPTIONS = [
      { value: 'zoom-in', label: '缓缓放大推进 (Zoom In)' },
      { value: 'zoom-out', label: '缓缓缩小拉远 (Zoom Out)' },
      { value: 'pan-left', label: '镜头向左平移 (Pan Left)' },
      { value: 'pan-right', label: '镜头向右平移 (Pan Right)' },
    ]

    const TRANSITION_OPTIONS = [
      { value: 'crossfade', label: '柔和淡入淡出 (Crossfade)' },
      { value: 'wipe-left', label: '横向划像切换 (Wipe Left)' },
      { value: 'slide-up', label: '向上推动切换 (Slide Up)' },
      { value: 'zoom-cut', label: '动感缩放切镜 (Zoom Cut)' },
    ]

    const SFX_OPTIONS = [
      { value: 'none', label: '无额外音效' },
      { value: 'whoosh', label: '快速风声 (Whoosh)' },
      { value: 'impact', label: '低音重击 (Impact)' },
      { value: 'pop', label: '轻快气泡 (Pop)' },
      { value: 'chime', label: '清脆提示 (Chime)' },
      { value: 'riser', label: '情绪推升 (Riser)' },
    ]

    const GLOBAL_STYLES = `
      .dsh-vw-root * { box-sizing: border-box; }
      .dsh-vw-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
      .dsh-vw-scroll::-webkit-scrollbar-track { background: transparent; }
      .dsh-vw-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 99px; }
      .dsh-vw-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.24); }
      .dsh-vw-btn { transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease, transform 0.1s ease; }
      .dsh-vw-btn:hover:not(:disabled) { filter: brightness(1.08); }
      .dsh-vw-btn:active:not(:disabled) { transform: scale(0.985); }
      .dsh-vw-btn:disabled { opacity: 0.48; cursor: not-allowed; }
      .dsh-vw-input:focus, .dsh-vw-select:focus, .dsh-vw-textarea:focus {
        outline: none;
        border-color: #3B82F6 !important;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
      }
      .dsh-vw-proj-row:hover { background: #1E222B !important; }
      .dsh-vw-proj-row .dsh-vw-hover-btn { opacity: 0; transition: opacity 0.15s ease; }
      .dsh-vw-proj-row:hover .dsh-vw-hover-btn { opacity: 1; }
      .dsh-vw-asset-card:hover { border-color: rgba(255,255,255,0.22) !important; }
      .dsh-vw-asset-card .dsh-vw-hover-btn { opacity: 0; transition: opacity 0.15s ease; }
      .dsh-vw-asset-card:hover .dsh-vw-hover-btn { opacity: 1; }
      @keyframes dshVwSpin { to { transform: rotate(360deg); } }
      .dsh-vw-spinner {
        width: 15px; height: 15px; border-radius: 50%;
        border: 2px solid rgba(59,130,246,0.25); border-top-color: #3B82F6;
        animation: dshVwSpin 0.75s linear infinite; display: inline-block; flex-shrink: 0;
      }
    `

    function formatClock(seconds) {
      const s = Math.max(0, Number(seconds) || 0)
      const mins = Math.floor(s / 60)
      const rem = (s % 60).toFixed(1).padStart(4, '0')
      return `${String(mins).padStart(2, '0')}:${rem}`
    }

    function Icon({ name, size = 16, color = 'currentColor', style = {} }) {
      const base = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style },
      }
      switch (name) {
        case 'film':
          return h(
            'svg',
            base,
            h('rect', { x: 2, y: 4, width: 20, height: 16, rx: 3 }),
            h('line', { x1: 7, y1: 4, x2: 7, y2: 20 }),
            h('line', { x1: 17, y1: 4, x2: 17, y2: 20 }),
            h('line', { x1: 2, y1: 12, x2: 22, y2: 12 }),
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
        case 'music':
          return h(
            'svg',
            base,
            h('path', { d: 'M9 18V5l12-2v13' }),
            h('circle', { cx: 6, cy: 18, r: 3 }),
            h('circle', { cx: 18, cy: 16, r: 3 }),
          )
        case 'image':
          return h(
            'svg',
            base,
            h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
            h('circle', { cx: 8.5, cy: 8.5, r: 1.5 }),
            h('polyline', { points: '21 15 16 10 5 21' }),
          )
        case 'fileText':
          return h(
            'svg',
            base,
            h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
            h('polyline', { points: '14 2 14 8 20 8' }),
            h('line', { x1: 16, y1: 13, x2: 8, y2: 13 }),
            h('line', { x1: 16, y1: 17, x2: 8, y2: 17 }),
          )
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
        case 'chevronLeft':
          return h('svg', base, h('polyline', { points: '15 18 9 12 15 6' }))
        case 'chevronRight':
          return h('svg', base, h('polyline', { points: '9 18 15 12 9 6' }))
        case 'volume':
          return h(
            'svg',
            base,
            h('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }),
            h('path', { d: 'M15.5 8.5a5 5 0 0 1 0 7' }),
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
                padding: '20px',
                margin: '20px',
                borderRadius: '10px',
                background: '#1E222B',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#FECACA',
                fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
              },
            },
            h('strong', null, '画面加载遇到了一点小问题'),
            h(
              'pre',
              { style: { marginTop: '8px', fontSize: '12px', whiteSpace: 'pre-wrap', color: '#9CA3AF' } },
              String(this.state.error?.message || this.state.error),
            ),
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

    /**
     * Compact Agent Tool Card inside DSH Chat (`tool.call.toolview`)
     */
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
            background: '#161920',
            border: '1px solid rgba(255,255,255,0.09)',
            color: '#F3F4F6',
            fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
            fontSize: '12px',
          },
        },
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('span', { style: { fontWeight: 600, color: '#60A5FA' } }, item.toolName),
          h('span', { style: { color: '#9CA3AF', fontSize: '11px' } }, item.status || '完成'),
        ),
        out.durationSec
          ? h('div', { style: { color: '#10B981', marginTop: '4px' } }, `实测时长 ${out.durationSec}s`)
          : null,
        out.outputPath || out.render?.outputPath
          ? h('div', { style: { color: '#F3F4F6', marginTop: '4px' } }, `MP4 成品: ${out.outputPath || out.render?.outputPath}`)
          : null,
      )
    }

    function SidebarVideoIcon() {
      return h(
        'span',
        {
          title: '视频创作工作台',
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

    /**
     * Main Minimalist 4-Step Studio
     */
    function VideoWorkbenchApp({ ctx, isMainSlot = false }) {
      const connFetch = useConnectionFetch(ctx)
      const isStandalone = typeof window !== 'undefined' && Boolean(window.__DSH_STANDALONE__)
      const [mode, setMode] = useState(isMainSlot ? 'video' : 'dsh')
      const [mainSlotActive, setMainSlotActive] = useState(() =>
        typeof document !== 'undefined' ? Boolean(document.querySelector('[data-dsh-main-workbench="true"]')) : false,
      )

      // 4-Step Guided Flow: 1 = 素材, 2 = 设置, 3 = 预览微调, 4 = 导出
      const [activeStep, setActiveStep] = useState(3)
      const initialLoadedRef = useRef(false)

      // Server State
      const [projects, setProjects] = useState([])
      const [activeProjectDir, setActiveProjectDir] = useState('')
      const [script, setScript] = useState(null)
      const [voiceCatalog, setVoiceCatalog] = useState([])
      const [availableEmotions, setAvailableEmotions] = useState(['平静', '高兴', '激昂', '温柔', '深沉', '悲伤'])
      const [projectAssets, setProjectAssets] = useState([])
      const [assetNotes, setAssetNotes] = useState([])
      const [assetSummary, setAssetSummary] = useState({ image: 0, video: 0, music: 0, sfx: 0, notes: 0 })
      const [hasMp4, setHasMp4] = useState(false)
      const [hasSnapshot, setHasSnapshot] = useState(false)
      const [hasMasterAudio, setHasMasterAudio] = useState(false)
      const [ttsStatus, setTtsStatus] = useState({ reachable: false, ready: false })
      const [assetVersion, setAssetVersion] = useState(1)

      // UI & Feedback State
      const [busyLabel, setBusyLabel] = useState('')
      const [toast, setToast] = useState(null) // { type: 'info' | 'success' | 'error', text }
      const [confirmDeleteDir, setConfirmDeleteDir] = useState('')
      const [isDraggingOver, setIsDraggingOver] = useState(false)
      const [showPathImport, setShowPathImport] = useState(false)
      const [assetDirInput, setAssetDirInput] = useState('')
      const [assetFilter, setAssetFilter] = useState('all')

      // Step 2: Creation Form
      const [directorForm, setDirectorForm] = useState({
        topic: '',
        style: 'tech',
        engine: 'html',
        voiceId: 'auto',
      })

      // Step 3: Preview & Single-Scene Editor
      const [selectedSceneIdx, setSelectedSceneIdx] = useState(0)
      const [scriptDirty, setScriptDirty] = useState(false)
      const [currentFrame, setCurrentFrame] = useState(8)
      const [isPlaying, setIsPlaying] = useState(false)
      const iframeRef = useRef(null)
      const stageAudioRef = useRef(null)

      // Step 4: Export Resolution & Advanced Tools
      const [exportPreset, setExportPreset] = useState('1080p') // '1080p' | '720p'
      const [lintReport, setLintReport] = useState(null)

      // Modals
      const [showNewModal, setShowNewModal] = useState(false)
      const [newProjectForm, setNewProjectForm] = useState({
        title: '',
        style: 'tech',
        engine: 'html',
      })
      const [showVoiceModal, setShowVoiceModal] = useState(false)
      const [voicePickTarget, setVoicePickTarget] = useState('global') // 'global' | sceneIndex
      const [voiceCategoryFilter, setVoiceCategoryFilter] = useState('all')
      const [voiceSearchQuery, setVoiceSearchQuery] = useState('')
      const [playingVoiceId, setPlayingVoiceId] = useState('')
      const [showVoiceUpload, setShowVoiceUpload] = useState(false)
      const [voiceUploadForm, setVoiceUploadForm] = useState({
        name: '',
        gender: 'female',
        sourcePath: '',
        fileName: '',
        dataBase64: '',
      })
      const previewAudioRef = useRef(null)
      const fileUploadInputRef = useRef(null)
      const folderUploadInputRef = useRef(null)
      const voiceFileInputRef = useRef(null)

      const notify = useCallback((text, type = 'info') => {
        setToast({ text, type })
      }, [])

      // Inject clean scoped CSS once
      useEffect(() => {
        if (typeof document === 'undefined') return
        if (!document.getElementById('dsh-vw-style')) {
          const el = document.createElement('style')
          el.id = 'dsh-vw-style'
          el.textContent = GLOBAL_STYLES
          document.head.appendChild(el)
        }
      }, [])

      // Deduplicate `main` and `shell.overlay`
      useEffect(() => {
        if (isMainSlot) {
          window.dispatchEvent(new CustomEvent('dsh-video:main-mounted', { detail: { mounted: true } }))
          return () => window.dispatchEvent(new CustomEvent('dsh-video:main-mounted', { detail: { mounted: false } }))
        }
        const onMain = (ev) => setMainSlotActive(Boolean(ev.detail?.mounted))
        window.addEventListener('dsh-video:main-mounted', onMain)
        return () => window.removeEventListener('dsh-video:main-mounted', onMain)
      }, [isMainSlot])

      // Esc closes modals
      useEffect(() => {
        const onKey = (ev) => {
          if (ev.key === 'Escape') {
            setShowNewModal(false)
            setShowVoiceModal(false)
            setConfirmDeleteDir('')
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])

      // Auto-dismiss success/info toast after 6s
      useEffect(() => {
        if (!toast || toast.type === 'error') return
        const id = setTimeout(() => setToast(null), 6000)
        return () => clearTimeout(id)
      }, [toast])

      const refreshState = useCallback(
        async (targetDir = activeProjectDir, opts = {}) => {
          try {
            const q = targetDir ? `?projectDir=${encodeURIComponent(targetDir)}` : ''
            const res = await connFetch(`/api/video-workbench/state${q}`)
            const data = await res.json()
            if (!data.ok) {
              notify(data.error || '加载项目状态失败', 'error')
              return null
            }
            setProjects(data.projects || [])
            setVoiceCatalog(data.voiceCatalog || [])
            if (Array.isArray(data.availableEmotions) && data.availableEmotions.length > 0) {
              setAvailableEmotions(data.availableEmotions)
            }
            setTtsStatus(data.ttsStatus || { reachable: false, ready: false })
            if (data.activeProject) {
              const ap = data.activeProject
              setActiveProjectDir(ap.projectDir)
              setScript(ap.script)
              setProjectAssets(ap.assets || [])
              setAssetNotes(ap.notes || [])
              setAssetSummary(ap.assetSummary || { image: 0, video: 0, music: 0, sfx: 0, notes: 0 })
              setHasMp4(Boolean(ap.hasMp4))
              setHasSnapshot(Boolean(ap.hasSnapshot))
              setHasMasterAudio(Boolean(ap.hasMasterAudio))
              setScriptDirty(false)
              setDirectorForm((prev) => ({
                topic: ap.script?.topic || prev.topic || '',
                style: ap.script?.style || prev.style || 'tech',
                engine: ap.script?.engine || prev.engine || 'html',
                voiceId: ap.script?.defaultVoiceId || prev.voiceId || 'auto',
              }))
              if (!initialLoadedRef.current || opts.autoStep) {
                initialLoadedRef.current = true
                const sceneCount = ap.script?.scenes?.length || 0
                if (opts.preferredStep) {
                  setActiveStep(opts.preferredStep)
                } else if (sceneCount > 0) {
                  setActiveStep(3)
                } else {
                  setActiveStep(1)
                }
              }
            }
            return data
          } catch (err) {
            notify(`连接本地服务失败: ${err.message}`, 'error')
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

      // Sync Playhead Frame <-> Stage Iframe + Master Audio
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
              if (typeof win.__seekToFrame === 'function') {
                win.__seekToFrame(clamped)
              } else {
                win.postMessage({ type: 'dsh-video:seek', frame: clamped }, '*')
              }
            } catch {
              win.postMessage({ type: 'dsh-video:seek', frame: clamped }, '*')
            }
          }
        },
        [script],
      )

      // Playback Loop in Step 3
      useEffect(() => {
        if (!isPlaying || activeStep !== 3) {
          if (stageAudioRef.current) {
            try {
              stageAudioRef.current.pause()
            } catch {}
          }
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

      // Keep selectedSceneIdx in bounds & detect active scene during playback
      const scenes = useMemo(() => script?.scenes || [], [script])
      useEffect(() => {
        if (scenes.length === 0) setSelectedSceneIdx(0)
        else if (selectedSceneIdx >= scenes.length) setSelectedSceneIdx(scenes.length - 1)
      }, [scenes, selectedSceneIdx])

      const activePlayingSceneIdx = useMemo(() => {
        const idx = scenes.findIndex((s) => currentFrame >= (s.startFrame || 0) && currentFrame < (s.endFrame || 0))
        return idx >= 0 ? idx : 0
      }, [scenes, currentFrame])

      const selectedScene = scenes[selectedSceneIdx] || null

      // Derived Asset Counts
      const totalAssetCount =
        (assetSummary.image || 0) +
        (assetSummary.video || 0) +
        (assetSummary.music || 0) +
        (assetSummary.sfx || 0) +
        (assetSummary.notes || 0)

      const filteredAssets = useMemo(() => {
        if (assetFilter === 'all') return projectAssets
        if (assetFilter === 'audio') return projectAssets.filter((a) => a.type === 'audio')
        return projectAssets.filter((a) => a.type === assetFilter)
      }, [projectAssets, assetFilter])

      const visualAssets = useMemo(
        () => projectAssets.filter((a) => a.type === 'image' || a.type === 'video'),
        [projectAssets],
      )

      // Voice Library Filters & Preview
      const voiceCategories = useMemo(() => {
        const map = new Map()
        for (const v of voiceCatalog) {
          const cat = v.category || '其他声音'
          map.set(cat, (map.get(cat) || 0) + 1)
        }
        return Array.from(map.entries()).map(([name, count]) => ({ name, count }))
      }, [voiceCatalog])

      const filteredVoices = useMemo(() => {
        const kw = voiceSearchQuery.trim().toLowerCase()
        return voiceCatalog.filter((v) => {
          if (voiceCategoryFilter !== 'all' && v.category !== voiceCategoryFilter) return false
          if (!kw) return true
          return (
            v.name.toLowerCase().includes(kw) ||
            String(v.category || '').toLowerCase().includes(kw) ||
            (v.tags || []).some((t) => String(t).toLowerCase().includes(kw))
          )
        })
      }, [voiceCatalog, voiceCategoryFilter, voiceSearchQuery])

      const voiceNameById = useCallback(
        (id) => {
          if (!id || id === 'auto') return 'AI 自动匹配最佳声音'
          const found = voiceCatalog.find((v) => v.id === id)
          return found ? found.name : id
        },
        [voiceCatalog],
      )

      const handlePreviewVoice = useCallback(
        (voice) => {
          if (!voice) return
          if (String(voice.refPath || '').endsWith('.pt')) {
            notify(`「${voice.name}」为模型特征文件，可在分镜中点击「生成配音」试听`, 'info')
            return
          }
          if (previewAudioRef.current) {
            previewAudioRef.current.pause()
          }
          if (playingVoiceId === voice.id) {
            setPlayingVoiceId('')
            return
          }
          const audio = new Audio(`/api/video-workbench/voices/preview?id=${encodeURIComponent(voice.id)}`)
          previewAudioRef.current = audio
          setPlayingVoiceId(voice.id)
          audio.onended = () => setPlayingVoiceId('')
          audio.onerror = () => {
            setPlayingVoiceId('')
            notify(`无法试听「${voice.name}」，请确认原声文件存在`, 'error')
          }
          audio.play().catch(() => setPlayingVoiceId(''))
        },
        [playingVoiceId, notify],
      )

      // Handlers: Select / Create / Delete Project
      const handleSelectProject = async (dir) => {
        if (!dir || dir === activeProjectDir) return
        setIsPlaying(false)
        setLintReport(null)
        setSelectedSceneIdx(0)
        await refreshState(dir, { autoStep: true })
      }

      const handleCreateProject = async () => {
        const title = newProjectForm.title.trim() || `新视频项目 ${projects.length + 1}`
        setBusyLabel('正在创建新视频项目...')
        try {
          const res = await connFetch('/api/video-workbench/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              style: newProjectForm.style,
              engine: newProjectForm.engine,
              voiceMode: 'auto',
              defaultVoiceId: 'auto',
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(data.error || '创建失败', 'error')
            return
          }
          setShowNewModal(false)
          setNewProjectForm({ title: '', style: 'tech', engine: 'html' })
          await refreshState(data.projectDir, { autoStep: true, preferredStep: 1 })
          notify(`已创建项目「${title}」，现在可以上传素材或直接开始设置主题`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleDeleteProject = async (proj) => {
        if (confirmDeleteDir !== proj.projectDir) {
          setConfirmDeleteDir(proj.projectDir)
          return
        }
        setConfirmDeleteDir('')
        setBusyLabel(`正在删除「${proj.name}」...`)
        try {
          const res = await connFetch('/api/video-workbench/projects/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: proj.projectDir }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(data.error || '删除失败', 'error')
            return
          }
          const nextDir = activeProjectDir === proj.projectDir ? '' : activeProjectDir
          await refreshState(nextDir, { autoStep: activeProjectDir === proj.projectDir })
          notify(`已删除项目「${proj.name}」`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      // Handlers: Assets Upload & Import & Delete
      const handleUploadFilesList = async (fileList) => {
        if (!activeProjectDir || !fileList || fileList.length === 0) return
        const files = Array.from(fileList)
        setBusyLabel(`正在上传并分析 ${files.length} 个素材文件...`)
        try {
          const payload = []
          for (const f of files) {
            const base64 = await readFileAsBase64(f)
            payload.push({ name: f.name, dataBase64: base64 })
          }
          const res = await connFetch('/api/video-workbench/assets/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: activeProjectDir, files: payload }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`素材上传失败: ${data.error}`, 'error')
            return
          }
          await refreshState(activeProjectDir)
          setAssetVersion((v) => v + 1)
          notify(`成功导入 ${payload.length} 个素材文件`, 'success')
        } catch (err) {
          notify(`上传失败: ${err.message}`, 'error')
        } finally {
          setBusyLabel('')
        }
      }

      const handleImportByPath = async () => {
        const src = assetDirInput.trim()
        if (!src || !activeProjectDir) return
        setBusyLabel(`正在扫描本地目录 ${src} ...`)
        try {
          const res = await connFetch('/api/video-workbench/assets/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: activeProjectDir, sources: [src] }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`目录导入失败: ${data.error}`, 'error')
            return
          }
          setAssetDirInput('')
          await refreshState(activeProjectDir)
          setAssetVersion((v) => v + 1)
          notify(`已从本地目录成功导入素材（新增 ${data.addedCount || 0} 项）`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleDeleteAsset = async (assetId) => {
        if (!activeProjectDir) return
        const res = await connFetch('/api/video-workbench/assets/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectDir: activeProjectDir, assetId }),
        })
        const data = await res.json()
        if (data.ok) {
          setProjectAssets(data.manifest?.items || [])
          setAssetNotes(data.manifest?.notes || [])
          setAssetSummary(data.summary || { image: 0, video: 0, music: 0, sfx: 0, notes: 0 })
          notify('已移除该素材', 'info')
        }
      }

      // Handlers: Step 2 Plan & One-Click Produce
      const handlePlanVideo = async () => {
        if (!activeProjectDir) return
        setBusyLabel('AI 正在结合素材与主题，为你编写分镜文案、配乐音效与画面动效...')
        try {
          const res = await connFetch('/api/video-workbench/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              sources: assetDirInput.trim() || undefined,
              topic: directorForm.topic.trim() || script?.title || '',
              style: directorForm.style,
              engine: directorForm.engine,
              voiceId: directorForm.voiceId,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`生成分镜失败: ${data.error}`, 'error')
            return
          }
          setAssetVersion((v) => v + 1)
          setSelectedSceneIdx(0)
          await refreshState(activeProjectDir, { autoStep: true, preferredStep: 3 })
          notify(`已生成 ${data.sceneCount} 幕视频脚本，可在下方点击每一幕试听配音或修改文字`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleProduceVideo = async () => {
        if (!activeProjectDir) return
        setBusyLabel('正在全自动制作视频：编排分镜 -> 生成配音 -> 混音配乐 -> 渲染 MP4（首次唤醒配音模型约 30~90 秒）...')
        try {
          const res = await connFetch('/api/video-workbench/produce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              sources: assetDirInput.trim() || undefined,
              topic: directorForm.topic.trim() || script?.title || '',
              style: directorForm.style,
              engine: directorForm.engine,
              voiceId: directorForm.voiceId,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`一键制作失败: ${data.error}`, 'error')
            return
          }
          setAssetVersion((v) => v + 1)
          await refreshState(activeProjectDir, { autoStep: true, preferredStep: 4 })
          notify(`完整视频导出成功！总时长 ${data.script?.totalDurationSec || ''}s`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      // Handlers: Step 3 Script Editing & Scene Audio & Step 4 Export Actions
      const updateSelectedScene = (patch) => {
        if (!script || !selectedScene) return
        const nextScenes = script.scenes.map((sc, idx) => (idx === selectedSceneIdx ? { ...sc, ...patch } : sc))
        setScript({ ...script, scenes: nextScenes })
        setScriptDirty(true)
      }

      const handleSaveScriptEdits = async (overrideScript = script) => {
        if (!activeProjectDir || !overrideScript) return false
        setBusyLabel('正在保存修改并刷新视频画面...')
        try {
          const res = await connFetch('/api/video-workbench/script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: activeProjectDir, script: overrideScript, regenerateCode: true }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`保存失败: ${data.error}`, 'error')
            return false
          }
          setScript(data.script)
          setScriptDirty(false)
          setAssetVersion((v) => v + 1)
          notify('画面代码已按你的最新修改更新', 'success')
          return true
        } finally {
          setBusyLabel('')
        }
      }

      const runWorkbenchAction = async (action, extra = {}) => {
        if (!activeProjectDir) return null
        if (scriptDirty && ['tts-scene', 'tts-all', 'render'].includes(action)) {
          await handleSaveScriptEdits(script)
        }
        const labelMap = {
          'tts-scene': '正在为当前分镜生成真实配音并校准时长...',
          'tts-all': '正在为全部镜头批量生成配音并混音（首次唤醒模型约需半分钟）...',
          mix: '正在自动平衡人声、音效与背景音乐音量...',
          render: `正在高清逐帧渲染 MP4（${exportPreset === '720p' ? '1280×720 快速' : '1920×1080 超清'}）...`,
          snapshot: '正在生成 3×3 关键帧概览图...',
          lint: '正在检查字幕对比度与排版规范...',
        }
        setBusyLabel(labelMap[action] || '正在处理中...')
        try {
          const res = await connFetch('/api/video-workbench/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: activeProjectDir, action, ...extra }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`操作失败: ${data.error}`, 'error')
            return null
          }
          setAssetVersion((v) => v + 1)
          if (action === 'lint') {
            setLintReport(data)
            notify(data.passed === false ? '画面体检发现可优化项，请查看下方详情' : '画面规范体检全部通过', data.passed === false ? 'info' : 'success')
          } else if (action === 'render') {
            await refreshState(activeProjectDir, { autoStep: true, preferredStep: 4 })
            notify('视频已导出为 MP4，点击即可播放或下载', 'success')
          } else {
            await refreshState(activeProjectDir)
            if (action === 'tts-scene') notify('当前镜头配音已更新并完成时长同步', 'success')
            if (action === 'tts-all') notify('全片配音与背景音乐混音已完成', 'success')
            if (action === 'mix') notify('音轨混音完成', 'success')
            if (action === 'snapshot') notify('3×3 关键帧检查图已生成', 'success')
          }
          return data
        } finally {
          setBusyLabel('')
        }
      }

      const handleImportVoice = async () => {
        if (!voiceUploadForm.sourcePath && !voiceUploadForm.dataBase64) {
          notify('请先选择一个 .wav/.mp3 声音文件或填写本地路径', 'error')
          return
        }
        setBusyLabel('正在导入并注册你的专属声音...')
        try {
          const res = await connFetch('/api/video-workbench/voices/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourcePath: voiceUploadForm.sourcePath.trim() || undefined,
              fileName: voiceUploadForm.fileName || undefined,
              dataBase64: voiceUploadForm.dataBase64 || undefined,
              name: voiceUploadForm.name.trim() || undefined,
              gender: voiceUploadForm.gender,
              engine: 'indextts2',
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            notify(`导入声音失败: ${data.error}`, 'error')
            return
          }
          setVoiceCatalog(data.voiceCatalog || [])
          setShowVoiceUpload(false)
          setVoiceUploadForm({ name: '', gender: 'female', sourcePath: '', fileName: '', dataBase64: '' })
          notify(`声音「${data.voice?.name || '自定义声音'}」已加入声音库`, 'success')
        } finally {
          setBusyLabel('')
        }
      }

      const handleAssignVoiceFromModal = (voice) => {
        if (voicePickTarget === 'global') {
          setDirectorForm((prev) => ({ ...prev, voiceId: voice.id }))
          setShowVoiceModal(false)
          notify(`已选定主配音声音：「${voice.name}」`, 'success')
        } else if (typeof voicePickTarget === 'number' && selectedScene) {
          updateSelectedScene({ voiceId: voice.id })
          setShowVoiceModal(false)
          notify(`已为第 ${voicePickTarget + 1} 幕指派声音「${voice.name}」，点击「重新生成本幕配音」即可生效`, 'info')
        }
      }

      // Slot deduplication guard
      if (!isMainSlot && (isStandalone || (mainSlotActive && mode === 'video'))) {
        if (!isStandalone && mode === 'dsh') {
          return h(
            'div',
            {
              style: {
                position: 'fixed',
                top: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 2200,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px',
                borderRadius: '999px',
                background: '#161920',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
              },
            },
            h(
              'button',
              {
                className: 'dsh-vw-btn',
                onClick: () => switchWorkbenchMode('dsh'),
                style: {
                  border: 'none',
                  cursor: 'pointer',
                  padding: '5px 14px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: '#3B82F6',
                  color: '#fff',
                },
              },
              '对话助手',
            ),
            h(
              'button',
              {
                className: 'dsh-vw-btn',
                onClick: () => switchWorkbenchMode('video'),
                style: {
                  border: 'none',
                  cursor: 'pointer',
                  padding: '5px 14px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'transparent',
                  color: '#9CA3AF',
                },
              },
              '视频工坊',
            ),
          )
        }
        return null
      }

      // Computed Media URLs
      const fps = Number(script?.fps) || 30
      const totalFrames = Math.max(1, Number(script?.totalDurationInFrames) || 300)
      const stagePreviewUrl = activeProjectDir
        ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=index.html&preview=1&v=${assetVersion}`
        : ''
      const masterAudioUrl = activeProjectDir
        ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=output/master-audio.wav&v=${assetVersion}`
        : ''
      const finalMp4Url = activeProjectDir
        ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=output/final.mp4&v=${assetVersion}`
        : ''
      const snapshotUrl = activeProjectDir
        ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=output/snapshot-3x3.png&v=${assetVersion}`
        : ''

      // Shared Minimal Style Tokens
      const cardStyle = {
        background: '#161920',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
      }
      const inputStyle = {
        width: '100%',
        padding: '9px 12px',
        borderRadius: '8px',
        background: '#0F1115',
        border: '1px solid rgba(255,255,255,0.12)',
        color: '#F3F4F6',
        fontSize: '13px',
        fontFamily: 'inherit',
      }
      const primaryBtnStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '9px 16px',
        borderRadius: '8px',
        border: 'none',
        background: '#3B82F6',
        color: '#FFFFFF',
        fontWeight: 600,
        fontSize: '13px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }
      const secondaryBtnStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.12)',
        background: '#1E222B',
        color: '#F3F4F6',
        fontWeight: 500,
        fontSize: '13px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }

      // Hidden File Inputs
      const hiddenInputs = h(
        'div',
        { style: { display: 'none' } },
        h('input', {
          ref: fileUploadInputRef,
          type: 'file',
          multiple: true,
          accept: 'image/*,video/*,audio/*,.txt,.md,.json',
          onChange: (e) => {
            handleUploadFilesList(e.target.files)
            e.target.value = ''
          },
        }),
        h('input', {
          ref: folderUploadInputRef,
          type: 'file',
          webkitdirectory: '',
          directory: '',
          multiple: true,
          onChange: (e) => {
            handleUploadFilesList(e.target.files)
            e.target.value = ''
          },
        }),
        h('input', {
          ref: voiceFileInputRef,
          type: 'file',
          accept: '.wav,.mp3,.m4a,.flac,.ogg',
          onChange: async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const b64 = await readFileAsBase64(f)
            setVoiceUploadForm((prev) => ({
              ...prev,
              fileName: f.name,
              dataBase64: b64,
              name: prev.name || f.name.replace(/\.[^.]+$/, ''),
              sourcePath: '',
            }))
            e.target.value = ''
          },
        }),
      )

      // -----------------------------------------------------------------------
      // LEFT SIDEBAR (232px) — Projects + New Video + Voice Library Trigger
      // -----------------------------------------------------------------------
      const sidebar = h(
        'aside',
        {
          style: {
            width: '232px',
            flexShrink: 0,
            background: '#14171E',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          },
        },
        // Brand Header + New Project CTA
        h(
          'div',
          { style: { padding: '16px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
            h(
              'span',
              {
                style: {
                  width: '26px',
                  height: '26px',
                  borderRadius: '7px',
                  background: '#3B82F6',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                },
              },
              h(Icon, { name: 'film', size: 15 }),
            ),
            h('span', { style: { fontSize: '14px', fontWeight: 700, color: '#F3F4F6', letterSpacing: '-0.01em' } }, 'DSH 视频工坊'),
          ),
          h(
            'button',
            {
              className: 'dsh-vw-btn',
              'data-testid': 'new-project-btn',
              onClick: () => setShowNewModal(true),
              style: { ...primaryBtnStyle, width: '100%', padding: '9px 12px' },
            },
            h(Icon, { name: 'plus', size: 15 }),
            '新建视频项目',
          ),
        ),

        // Project List
        h(
          'div',
          { style: { padding: '12px 14px 6px', fontSize: '11px', fontWeight: 600, color: '#6B7280', letterSpacing: '0.04em' } },
          `我的项目 (${projects.length})`,
        ),
        h(
          'div',
          { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '0 8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' } },
          projects.map((p) => {
            const active = p.projectDir === activeProjectDir
            const isDemo = p.folderName === 'demo-html-project' || p.folderName === 'demo-remotion-project'
            const isConfirming = confirmDeleteDir === p.projectDir
            return h(
              'div',
              {
                key: p.projectDir,
                className: 'dsh-vw-proj-row',
                onClick: () => handleSelectProject(p.projectDir),
                style: {
                  padding: '9px 10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: active ? '#1E222B' : 'transparent',
                  border: active ? '1px solid rgba(59,130,246,0.45)' : '1px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                  transition: 'background 0.15s ease',
                },
              },
              h(
                'div',
                { style: { minWidth: 0, flex: 1 } },
                h(
                  'div',
                  {
                    style: {
                      fontSize: '13px',
                      fontWeight: active ? 600 : 500,
                      color: active ? '#FFFFFF' : '#D1D5DB',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  },
                  p.name,
                ),
                h(
                  'div',
                  { style: { fontSize: '11px', color: '#6B7280', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' } },
                  h('span', null, p.engine === 'remotion' ? 'Remotion' : 'HTML5'),
                  h('span', null, '·'),
                  h('span', null, p.sceneCount > 0 ? `${p.sceneCount}幕 · ${p.totalDurationSec || 0}s` : '空白草稿'),
                  p.hasMp4 ? h('span', { title: '已导出 MP4', style: { width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' } }) : null,
                ),
              ),
              !isDemo
                ? h(
                    'button',
                    {
                      className: isConfirming ? '' : 'dsh-vw-hover-btn',
                      title: isConfirming ? '再次点击确认删除' : '删除项目',
                      onClick: (ev) => {
                        ev.stopPropagation()
                        handleDeleteProject(p)
                      },
                      style: {
                        border: 'none',
                        borderRadius: '6px',
                        padding: isConfirming ? '3px 7px' : '4px',
                        background: isConfirming ? '#EF4444' : 'transparent',
                        color: isConfirming ? '#fff' : '#9CA3AF',
                        fontSize: '11px',
                        cursor: 'pointer',
                        flexShrink: 0,
                      },
                    },
                    isConfirming ? '确认删除' : h(Icon, { name: 'trash', size: 13 }),
                  )
                : null,
            )
          }),
        ),

        // Bottom Voice Library & TTS Status
        h(
          'div',
          { style: { padding: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '8px' } },
          h(
            'button',
            {
              className: 'dsh-vw-btn',
              'data-testid': 'open-voice-lib-btn',
              onClick: () => {
                setVoicePickTarget('global')
                setShowVoiceModal(true)
              },
              style: { ...secondaryBtnStyle, width: '100%', justifyContent: 'space-between', padding: '8px 10px' },
            },
            h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, h(Icon, { name: 'mic', size: 14, color: '#60A5FA' }), '配音声音库'),
            h('span', { style: { fontSize: '11px', color: '#9CA3AF' } }, `${voiceCatalog.length} 款`),
          ),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6B7280', paddingLeft: '4px' } },
            h('span', {
              style: {
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: ttsStatus.ready ? '#10B981' : '#F59E0B',
              },
            }),
            ttsStatus.ready ? '本地配音引擎就绪' : '配音引擎按需自动拉起',
          ),
        ),
      )

      // -----------------------------------------------------------------------
      // TOP HEADER BAR (56px, Single Clean Line, Centered 4-Step Nav)
      // -----------------------------------------------------------------------
      const steps = [
        { num: 1, label: '上传素材', badge: totalAssetCount > 0 ? String(totalAssetCount) : '' },
        { num: 2, label: '创作设置', badge: '' },
        { num: 3, label: '预览微调', badge: scenes.length > 0 ? `${scenes.length}幕` : '' },
        { num: 4, label: '导出 MP4', dot: hasMp4 },
      ]

      const headerAction = (() => {
        if (activeStep === 1) {
          return h(
            'button',
            {
              className: 'dsh-vw-btn',
              onClick: () => setActiveStep(2),
              style: primaryBtnStyle,
            },
            totalAssetCount > 0 ? '下一步：创作设置' : '跳过素材，下一步',
            h(Icon, { name: 'chevronRight', size: 15 }),
          )
        }
        if (activeStep === 2) {
          return h(
            'button',
            {
              className: 'dsh-vw-btn',
              disabled: Boolean(busyLabel),
              onClick: handleProduceVideo,
              style: primaryBtnStyle,
            },
            h(Icon, { name: 'sparkles', size: 15 }),
            '一键生成完整视频',
          )
        }
        if (activeStep === 3) {
          return h(
            'button',
            {
              className: 'dsh-vw-btn',
              disabled: Boolean(busyLabel) || scenes.length === 0,
              onClick: () => runWorkbenchAction('render', exportPreset === '720p' ? { renderWidth: 1280, renderHeight: 720 } : {}),
              style: primaryBtnStyle,
            },
            h(Icon, { name: 'download', size: 15 }),
            '导出 MP4',
          )
        }
        return h(
          'button',
          {
            className: 'dsh-vw-btn',
            onClick: () => setActiveStep(3),
            style: secondaryBtnStyle,
          },
          h(Icon, { name: 'chevronLeft', size: 15 }),
          '返回微调分镜',
        )
      })()

      const topBar = h(
        'header',
        {
          style: {
            height: '58px',
            flexShrink: 0,
            padding: '0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: '#14171E',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          },
        },
        // Left: Project Title
        h(
          'div',
          { style: { minWidth: '140px', maxWidth: '240px', display: 'flex', alignItems: 'center', gap: '8px' } },
          h(
            'span',
            {
              title: script?.title || '',
              style: {
                fontSize: '14px',
                fontWeight: 600,
                color: '#F3F4F6',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            },
            script?.title || '未命名项目',
          ),
          h(
            'span',
            {
              style: {
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '5px',
                background: 'rgba(255,255,255,0.06)',
                color: '#9CA3AF',
                flexShrink: 0,
              },
            },
            script?.engine === 'remotion' ? 'Remotion' : 'HTML5',
          ),
        ),

        // Center: 4-Step Segmented Navigation
        h(
          'nav',
          {
            'aria-label': '视频创作步骤',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px',
              borderRadius: '10px',
              background: '#0F1115',
              border: '1px solid rgba(255,255,255,0.07)',
              flexShrink: 0,
            },
          },
          steps.map((st) => {
            const isActive = activeStep === st.num
            return h(
              'button',
              {
                key: st.num,
                className: 'dsh-vw-btn',
                'data-step-tab': String(st.num),
                onClick: () => {
                  setIsPlaying(false)
                  setActiveStep(st.num)
                },
                style: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '6px 13px',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? '#3B82F6' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#9CA3AF',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: 'nowrap',
                },
              },
              h(
                'span',
                {
                  style: {
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    fontSize: '11px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isActive ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                    color: isActive ? '#FFFFFF' : '#9CA3AF',
                  },
                },
                st.num,
              ),
              st.label,
              st.badge
                ? h(
                    'span',
                    {
                      style: {
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '99px',
                        background: isActive ? 'rgba(15,17,21,0.28)' : 'rgba(255,255,255,0.07)',
                        color: isActive ? '#fff' : '#9CA3AF',
                      },
                    },
                    st.badge,
                  )
                : null,
              st.dot && !isActive
                ? h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' } })
                : null,
            )
          }),
        ),

        // Right: Primary Action + Optional DSH Return
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 } },
          !isStandalone
            ? h(
                'button',
                {
                  className: 'dsh-vw-btn',
                  onClick: () => switchWorkbenchMode('dsh'),
                  style: secondaryBtnStyle,
                },
                '返回对话',
              )
            : null,
          headerAction,
        ),
      )

      // -----------------------------------------------------------------------
      // STATUS / BUSY SLIM BANNER
      // -----------------------------------------------------------------------
      const statusBanner =
        busyLabel || toast
          ? h(
              'div',
              {
                style: {
                  flexShrink: 0,
                  padding: '8px 20px',
                  background: busyLabel
                    ? 'rgba(59, 130, 246, 0.12)'
                    : toast?.type === 'error'
                      ? 'rgba(239, 68, 68, 0.14)'
                      : toast?.type === 'success'
                        ? 'rgba(16, 185, 129, 0.12)'
                        : '#1A1E27',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontSize: '12.5px',
                  color: toast?.type === 'error' ? '#FCA5A5' : '#E5E7EB',
                },
              },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 } },
                busyLabel ? h('span', { className: 'dsh-vw-spinner' }) : null,
                h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, busyLabel || toast?.text),
              ),
              !busyLabel && toast
                ? h(
                    'button',
                    {
                      onClick: () => setToast(null),
                      style: { background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '2px' },
                    },
                    h(Icon, { name: 'x', size: 14 }),
                  )
                : null,
            )
          : null

      // -----------------------------------------------------------------------
      // STEP 1: 上传素材 (Drag & Drop + Folder + Clean Gallery Grid)
      // -----------------------------------------------------------------------
      const step1View = h(
        'div',
        { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '28px 32px' } },
        h(
          'div',
          { style: { maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' } },
          // Intro Header
          h(
            'div',
            null,
            h('h2', { style: { margin: 0, fontSize: '20px', fontWeight: 700, color: '#F3F4F6' } }, '第一步：导入视频素材（可选）'),
            h(
              'p',
              { style: { margin: '6px 0 0', fontSize: '13px', color: '#9CA3AF', lineHeight: 1.6 } },
              '拖入或选择图片、视频片段、背景音乐或说明文稿。没有现成素材也可以直接点击右上角「跳过素材，下一步」，由 AI 为你自动生成动态图文画面。',
            ),
          ),

          // Hero Drag & Drop Box
          h(
            'div',
            {
              'data-testid': 'asset-dropzone',
              onDragEnter: (e) => {
                e.preventDefault()
                setIsDraggingOver(true)
              },
              onDragOver: (e) => {
                e.preventDefault()
                setIsDraggingOver(true)
              },
              onDragLeave: (e) => {
                e.preventDefault()
                setIsDraggingOver(false)
              },
              onDrop: (e) => {
                e.preventDefault()
                setIsDraggingOver(false)
                if (e.dataTransfer?.files?.length) {
                  handleUploadFilesList(e.dataTransfer.files)
                }
              },
              style: {
                padding: '30px 24px',
                borderRadius: '14px',
                border: isDraggingOver ? '2px dashed #3B82F6' : '2px dashed rgba(255,255,255,0.14)',
                background: isDraggingOver ? 'rgba(59, 130, 246, 0.08)' : '#161920',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '12px',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              },
            },
            h(
              'div',
              {
                style: {
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: '#1E222B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60A5FA',
                },
              },
              h(Icon, { name: 'upload', size: 20 }),
            ),
            h(
              'div',
              null,
              h('div', { style: { fontSize: '14px', fontWeight: 600, color: '#F3F4F6' } }, isDraggingOver ? '松开鼠标立即导入素材' : '把图片、视频或音乐直接拖到这里'),
              h('div', { style: { fontSize: '12px', color: '#6B7280', marginTop: '4px' } }, '支持 JPG / PNG / MP4 / MOV / MP3 / WAV / TXT / MD'),
            ),
            h(
              'div',
              { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', marginTop: '4px' } },
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => fileUploadInputRef.current?.click(), style: primaryBtnStyle },
                h(Icon, { name: 'plus', size: 15 }),
                '选择文件',
              ),
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => folderUploadInputRef.current?.click(), style: secondaryBtnStyle },
                h(Icon, { name: 'folder', size: 15 }),
                '选择整个文件夹',
              ),
              h(
                'button',
                {
                  className: 'dsh-vw-btn',
                  onClick: () => setShowPathImport((v) => !v),
                  style: { ...secondaryBtnStyle, background: 'transparent', color: '#9CA3AF' },
                },
                showPathImport ? '收起本地路径输入' : '通过本机文件夹路径导入',
              ),
            ),

            showPathImport
              ? h(
                  'div',
                  {
                    style: {
                      marginTop: '8px',
                      width: '100%',
                      maxWidth: '580px',
                      display: 'flex',
                      gap: '8px',
                    },
                  },
                  h('input', {
                    className: 'dsh-vw-input',
                    value: assetDirInput,
                    onChange: (e) => setAssetDirInput(e.target.value),
                    onKeyDown: (e) => e.key === 'Enter' && handleImportByPath(),
                    placeholder: '输入电脑本地文件夹路径，例如 D:\\我的素材\\产品图',
                    style: { ...inputStyle, flex: 1 },
                  }),
                  h(
                    'button',
                    { className: 'dsh-vw-btn', onClick: handleImportByPath, style: secondaryBtnStyle },
                    '扫描导入',
                  ),
                )
              : null,
          ),

          // Uploaded Assets Gallery
          projectAssets.length > 0 || assetNotes.length > 0
            ? h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
                // Category Filter Bar
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' } },
                  h(
                    'div',
                    { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                    [
                      { id: 'all', label: `全部素材 (${projectAssets.length})` },
                      { id: 'image', label: `图片 (${assetSummary.image || 0})` },
                      { id: 'video', label: `视频 (${assetSummary.video || 0})` },
                      { id: 'audio', label: `音乐/音效 (${(assetSummary.music || 0) + (assetSummary.sfx || 0)})` },
                    ].map((tab) =>
                      h(
                        'button',
                        {
                          key: tab.id,
                          className: 'dsh-vw-btn',
                          onClick: () => setAssetFilter(tab.id),
                          style: {
                            padding: '5px 12px',
                            borderRadius: '99px',
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: assetFilter === tab.id ? '#3B82F6' : '#161920',
                            color: assetFilter === tab.id ? '#fff' : '#9CA3AF',
                            fontSize: '12px',
                            cursor: 'pointer',
                          },
                        },
                        tab.label,
                      ),
                    ),
                  ),
                  h(
                    'span',
                    { style: { fontSize: '12px', color: '#6B7280' } },
                    '下一步将自动把这些画面与声音编排到视频分镜中',
                  ),
                ),

                // Grid
                h(
                  'div',
                  {
                    style: {
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                      gap: '12px',
                    },
                  },
                  filteredAssets.map((a) => {
                    const thumbUrl =
                      a.thumb || (a.type === 'image' ? a.path : '')
                        ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=${encodeURIComponent(a.thumb || a.path)}&v=${assetVersion}`
                        : ''
                    const rawUrl = `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=${encodeURIComponent(a.path)}&v=${assetVersion}`
                    return h(
                      'div',
                      {
                        key: a.id,
                        className: 'dsh-vw-asset-card',
                        style: {
                          ...cardStyle,
                          overflow: 'hidden',
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                        },
                      },
                      // Thumbnail / Icon box
                      h(
                        'div',
                        {
                          style: {
                            aspectRatio: '16 / 9',
                            background: '#0F1115',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            overflow: 'hidden',
                          },
                        },
                        thumbUrl
                          ? h('img', {
                              src: thumbUrl,
                              alt: a.originalName || a.name,
                              style: { width: '100%', height: '100%', objectFit: 'cover' },
                            })
                          : h(Icon, { name: a.type === 'audio' ? 'music' : 'image', size: 28, color: '#4B5563' }),
                        // Kind / Duration Tag
                        h(
                          'span',
                          {
                            style: {
                              position: 'absolute',
                              left: '8px',
                              bottom: '8px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(15, 17, 21, 0.78)',
                              color: '#E5E7EB',
                              fontSize: '10px',
                              fontFamily: 'Consolas, monospace',
                            },
                          },
                          a.type === 'video' || a.type === 'audio'
                            ? `${a.role === 'music' ? '配乐' : a.role === 'sfx' ? '音效' : '视频'} ${formatClock(a.durationSec)}`
                            : `${a.width || '?'}×${a.height || '?'}`,
                        ),
                        // Delete button on hover
                        h(
                          'button',
                          {
                            className: 'dsh-vw-hover-btn',
                            title: '删除素材',
                            onClick: () => handleDeleteAsset(a.id),
                            style: {
                              position: 'absolute',
                              top: '6px',
                              right: '6px',
                              width: '24px',
                              height: '24px',
                              borderRadius: '6px',
                              border: 'none',
                              background: 'rgba(15, 17, 21, 0.85)',
                              color: '#F87171',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            },
                          },
                          h(Icon, { name: 'x', size: 13 }),
                        ),
                      ),
                      // Info footer
                      h(
                        'div',
                        { style: { padding: '8px 10px' } },
                        h(
                          'div',
                          {
                            title: a.originalName || a.name,
                            style: {
                              fontSize: '12px',
                              fontWeight: 500,
                              color: '#E5E7EB',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            },
                          },
                          a.originalName || a.name,
                        ),
                        a.type === 'audio'
                          ? h('audio', {
                              controls: true,
                              src: rawUrl,
                              style: { width: '100%', height: '26px', marginTop: '6px' },
                            })
                          : null,
                      ),
                    )
                  }),
                ),

                // Text notes summary if uploaded
                assetNotes.length > 0
                  ? h(
                      'div',
                      { style: { ...cardStyle, padding: '12px 14px' } },
                      h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#9CA3AF', marginBottom: '6px' } },
                        h(Icon, { name: 'fileText', size: 14 }),
                        `已导入文稿参考 (${assetNotes.length} 份)`,
                      ),
                      assetNotes.map((n) =>
                        h(
                          'div',
                          { key: n.id, style: { fontSize: '12px', color: '#D1D5DB', marginTop: '4px', lineHeight: 1.5 } },
                          h('strong', { style: { color: '#60A5FA' } }, `${n.name}：`),
                          String(n.text || '').slice(0, 120) + (String(n.text || '').length > 120 ? '...' : ''),
                        ),
                      ),
                    )
                  : null,
              )
            : null,
        ),
      )

      // -----------------------------------------------------------------------
      // STEP 2: 创作设置 (Calm Centered Creation Form)
      // -----------------------------------------------------------------------
      const step2View = h(
        'div',
        { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '28px 32px' } },
        h(
          'div',
          { style: { maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' } },
          h(
            'div',
            null,
            h('h2', { style: { margin: 0, fontSize: '20px', fontWeight: 700, color: '#F3F4F6' } }, '第二步：设置视频主题与风格'),
            h(
              'p',
              { style: { margin: '6px 0 0', fontSize: '13px', color: '#9CA3AF' } },
              totalAssetCount > 0
                ? `已准备 ${totalAssetCount} 个素材，AI 将结合素材为你规划文案、转场动效、音效配乐与字幕。`
                : '用一两句话描述你想做的视频，AI 会自动撰写口播文案、配乐并设计动态画面。',
            ),
          ),

          // Card 1: Topic
          h(
            'div',
            { style: { ...cardStyle, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' } },
            h('label', { style: { fontSize: '13px', fontWeight: 600, color: '#F3F4F6' } }, '你想制作什么内容？'),
            h('textarea', {
              className: 'dsh-vw-textarea',
              rows: 3,
              value: directorForm.topic,
              onChange: (e) => setDirectorForm((prev) => ({ ...prev, topic: e.target.value })),
              placeholder: '例如：制作一段 30 秒新品宣传视频，突出高效省心，结尾邀请点击预约体验...',
              style: { ...inputStyle, resize: 'vertical', lineHeight: 1.6 },
            }),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } },
              h('span', { style: { fontSize: '12px', color: '#6B7280' } }, '试试模板：'),
              TOPIC_PRESETS.map((preset) =>
                h(
                  'button',
                  {
                    key: preset.label,
                    className: 'dsh-vw-btn',
                    onClick: () => setDirectorForm((prev) => ({ ...prev, topic: preset.topic })),
                    style: {
                      padding: '4px 10px',
                      borderRadius: '99px',
                      background: '#1E222B',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#D1D5DB',
                      fontSize: '12px',
                      cursor: 'pointer',
                    },
                  },
                  preset.label,
                ),
              ),
            ),
          ),

          // Card 2: 5 Style Cards
          h(
            'div',
            { style: { ...cardStyle, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' } },
            h('div', { style: { fontSize: '13px', fontWeight: 600, color: '#F3F4F6' } }, '选择画面氛围风格'),
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: '10px' } },
              STYLE_OPTIONS.map((st) => {
                const selected = directorForm.style === st.id
                return h(
                  'button',
                  {
                    key: st.id,
                    className: 'dsh-vw-btn',
                    onClick: () => setDirectorForm((prev) => ({ ...prev, style: st.id })),
                    style: {
                      textAlign: 'left',
                      padding: '12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      background: selected ? 'rgba(59, 130, 246, 0.12)' : '#0F1115',
                      border: selected ? '1px solid #3B82F6' : '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    },
                  },
                  h('span', { style: { width: '22px', height: '4px', borderRadius: '99px', background: st.swatch } }),
                  h('span', { style: { fontSize: '13px', fontWeight: 600, color: '#F3F4F6' } }, st.label),
                  h('span', { style: { fontSize: '11px', color: '#9CA3AF' } }, st.desc),
                )
              }),
            ),
          ),

          // Card 3: Engine & Voice
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' } },
            // Engine Card
            h(
              'div',
              { style: { ...cardStyle, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' } },
              h('div', { style: { fontSize: '13px', fontWeight: 600, color: '#F3F4F6' } }, '视频生成方式'),
              [
                { id: 'html', title: 'HTML5 极速动效（推荐）', desc: '图文排版灵活、文字与镜头动效细腻流畅' },
                { id: 'remotion', title: 'Remotion 电影精修', desc: 'React 视频组件合成，适合规律化大片节奏' },
              ].map((eng) => {
                const selected = directorForm.engine === eng.id
                return h(
                  'button',
                  {
                    key: eng.id,
                    className: 'dsh-vw-btn',
                    onClick: () => setDirectorForm((prev) => ({ ...prev, engine: eng.id })),
                    style: {
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: selected ? 'rgba(59, 130, 246, 0.12)' : '#0F1115',
                      border: selected ? '1px solid #3B82F6' : '1px solid rgba(255,255,255,0.08)',
                    },
                  },
                  h('div', { style: { fontSize: '12.5px', fontWeight: 600, color: '#F3F4F6' } }, eng.title),
                  h('div', { style: { fontSize: '11px', color: '#9CA3AF', marginTop: '3px' } }, eng.desc),
                )
              }),
            ),

            // Voice Card
            h(
              'div',
              { style: { ...cardStyle, padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' } },
              h(
                'div',
                null,
                h('div', { style: { fontSize: '13px', fontWeight: 600, color: '#F3F4F6' } }, '配音人声设置'),
                h(
                  'div',
                  {
                    style: {
                      marginTop: '10px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: '#0F1115',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    },
                  },
                  h(
                    'div',
                    { style: { minWidth: 0 } },
                    h('div', { style: { fontSize: '12.5px', fontWeight: 600, color: '#E5E7EB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, voiceNameById(directorForm.voiceId)),
                    h('div', { style: { fontSize: '11px', color: '#6B7280', marginTop: '2px' } }, directorForm.voiceId === 'auto' ? '根据每幕情绪自动匹配男女与年龄音色' : '已固定使用该主配音音色'),
                  ),
                  directorForm.voiceId !== 'auto'
                    ? h(
                        'button',
                        {
                          className: 'dsh-vw-btn',
                          onClick: () => {
                            const v = voiceCatalog.find((x) => x.id === directorForm.voiceId)
                            if (v) handlePreviewVoice(v)
                          },
                          style: { ...secondaryBtnStyle, padding: '5px 9px', fontSize: '12px' },
                        },
                        h(Icon, { name: playingVoiceId === directorForm.voiceId ? 'pause' : 'play', size: 12 }),
                        '试听',
                      )
                    : null,
                ),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: '8px' } },
                h(
                  'button',
                  {
                    className: 'dsh-vw-btn',
                    onClick: () => {
                      setVoicePickTarget('global')
                      setShowVoiceModal(true)
                    },
                    style: { ...secondaryBtnStyle, flex: 1 },
                  },
                  h(Icon, { name: 'mic', size: 14, color: '#60A5FA' }),
                  `挑选音色 (${voiceCatalog.length})`,
                ),
                directorForm.voiceId !== 'auto'
                  ? h(
                      'button',
                      {
                        className: 'dsh-vw-btn',
                        onClick: () => setDirectorForm((prev) => ({ ...prev, voiceId: 'auto' })),
                        style: secondaryBtnStyle,
                      },
                      '改回自动',
                    )
                  : null,
              ),
            ),
          ),

          // Primary Footer Actions
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '4px' } },
            h(
              'button',
              {
                className: 'dsh-vw-btn',
                onClick: () => setActiveStep(1),
                style: { ...secondaryBtnStyle, background: 'transparent', color: '#9CA3AF' },
              },
              h(Icon, { name: 'chevronLeft', size: 15 }),
              '返回查看素材',
            ),
            h(
              'div',
              { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
              h(
                'button',
                {
                  className: 'dsh-vw-btn',
                  disabled: Boolean(busyLabel),
                  onClick: handlePlanVideo,
                  style: secondaryBtnStyle,
                },
                '先生成分镜剧本与预览',
              ),
              h(
                'button',
                {
                  className: 'dsh-vw-btn',
                  disabled: Boolean(busyLabel),
                  onClick: handleProduceVideo,
                  style: { ...primaryBtnStyle, padding: '10px 20px' },
                },
                h(Icon, { name: 'sparkles', size: 15 }),
                '一键生成完整视频',
              ),
            ),
          ),
        ),
      )

      // -----------------------------------------------------------------------
      // STEP 3: 预览微调 (16:9 Stage + Clickable Scene Strip + Selected Scene Inspector)
      // -----------------------------------------------------------------------
      const sceneAudioUrl =
        selectedScene?.audioPath && activeProjectDir
          ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=${encodeURIComponent(selectedScene.audioPath)}&v=${assetVersion}`
          : ''

      const selectedAssetRel = selectedScene?.media?.[0]?.path || ''

      const step3View =
        scenes.length === 0
          ? h(
              'div',
              { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '32px' } },
              h(Icon, { name: 'film', size: 42, color: '#4B5563' }),
              h('div', { style: { fontSize: '16px', fontWeight: 600, color: '#E5E7EB' } }, '当前项目还没有分镜剧本'),
              h('div', { style: { fontSize: '13px', color: '#9CA3AF' } }, '请先去第 2 步填写主题，让 AI 为你自动生成分镜、动效与口播文案。'),
              h(
                'button',
                { className: 'dsh-vw-btn', onClick: () => setActiveStep(2), style: primaryBtnStyle },
                '前往创作设置',
                h(Icon, { name: 'chevronRight', size: 15 }),
              ),
            )
          : h(
              'div',
              { style: { flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' } },
              // Left Stage + Controls + Scene Filmstrip
              h(
                'div',
                {
                  style: {
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px 20px',
                    gap: '12px',
                    overflow: 'hidden',
                  },
                },
                // 16:9 Stage Box
                h(
                  'div',
                  {
                    style: {
                      flex: 1,
                      minHeight: '220px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#0A0C10',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      padding: '8px',
                      overflow: 'hidden',
                      position: 'relative',
                    },
                  },
                  h('iframe', {
                    ref: iframeRef,
                    src: stagePreviewUrl,
                    title: '视频实时预览画布',
                    onLoad: () => seekToFrame(currentFrame, false),
                    style: {
                      width: 'min(100%, calc((100vh - 300px) * 16 / 9))',
                      height: 'auto',
                      maxHeight: '100%',
                      aspectRatio: '16 / 9',
                      border: 'none',
                      borderRadius: '8px',
                      background: '#000',
                    },
                  }),
                  hasMasterAudio
                    ? h('audio', { ref: stageAudioRef, src: masterAudioUrl, preload: 'auto', style: { display: 'none' } })
                    : null,
                ),

                // Playback Control Bar
                h(
                  'div',
                  {
                    style: {
                      ...cardStyle,
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      flexShrink: 0,
                    },
                  },
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      onClick: () => setIsPlaying((p) => !p),
                      style: { ...primaryBtnStyle, padding: '6px 14px', fontSize: '12.5px' },
                    },
                    h(Icon, { name: isPlaying ? 'pause' : 'play', size: 13 }),
                    isPlaying ? '暂停' : '播放预览',
                  ),
                  h('input', {
                    type: 'range',
                    min: 0,
                    max: Math.max(0, totalFrames - 1),
                    value: currentFrame,
                    onChange: (e) => {
                      setIsPlaying(false)
                      seekToFrame(Number(e.target.value), true)
                    },
                    style: { flex: 1, accentColor: '#3B82F6', cursor: 'pointer' },
                  }),
                  h(
                    'span',
                    { style: { fontSize: '12px', fontFamily: 'Consolas, monospace', color: '#9CA3AF', flexShrink: 0 } },
                    `${formatClock(currentFrame / fps)} / ${formatClock(totalFrames / fps)}`,
                  ),
                ),

                // Horizontal Clickable Scene Strip (replaces confusing multi-track waveform matrix!)
                h(
                  'div',
                  {
                    className: 'dsh-vw-scroll',
                    style: {
                      display: 'flex',
                      gap: '10px',
                      overflowX: 'auto',
                      paddingBottom: '4px',
                      flexShrink: 0,
                    },
                  },
                  scenes.map((sc, idx) => {
                    const isSelected = idx === selectedSceneIdx
                    const isCursorHere = idx === activePlayingSceneIdx && isPlaying
                    const dur = sc.durationSec || (sc.durationInFrames ? (sc.durationInFrames / fps).toFixed(1) : '4.0')
                    return h(
                      'button',
                      {
                        key: sc.id || idx,
                        className: 'dsh-vw-btn',
                        'data-scene-card': String(idx),
                        onClick: () => {
                          setIsPlaying(false)
                          setSelectedSceneIdx(idx)
                          seekToFrame((sc.startFrame || 0) + 4, true)
                        },
                        style: {
                          minWidth: '175px',
                          maxWidth: '215px',
                          flex: '1 0 175px',
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(59, 130, 246, 0.14)' : '#161920',
                          border: isSelected
                            ? '1.5px solid #3B82F6'
                            : isCursorHere
                              ? '1px solid rgba(255,255,255,0.28)'
                              : '1px solid rgba(255,255,255,0.08)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          gap: '5px',
                        },
                      },
                      h(
                        'div',
                        { style: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' } },
                        h('span', { style: { fontWeight: 700, color: isSelected ? '#60A5FA' : '#9CA3AF' } }, `第 ${idx + 1} 幕`),
                        h('span', { style: { color: '#6B7280', fontFamily: 'Consolas, monospace' } }, `${dur}s`),
                      ),
                      h(
                        'div',
                        {
                          style: {
                            fontSize: '12.5px',
                            fontWeight: 600,
                            color: '#F3F4F6',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                        },
                        sc.title || `分镜 ${idx + 1}`,
                      ),
                      h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: sc.audioPath ? '#10B981' : '#F59E0B' } },
                        h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: sc.audioPath ? '#10B981' : '#F59E0B' } }),
                        sc.audioPath ? '配音已就绪' : '待生成配音',
                      ),
                    )
                  }),
                ),
              ),

              // Right Inspector (326px, Edits ONLY Selected Scene)
              h(
                'aside',
                {
                  style: {
                    width: '326px',
                    flexShrink: 0,
                    background: '#14171E',
                    borderLeft: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                  },
                },
                // Inspector Header
                h(
                  'div',
                  {
                    style: {
                      padding: '14px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    },
                  },
                  h('span', { style: { fontSize: '14px', fontWeight: 700, color: '#F3F4F6' } }, `编辑第 ${selectedSceneIdx + 1} 幕`),
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      disabled: Boolean(busyLabel),
                      onClick: () => runWorkbenchAction('tts-all'),
                      style: { ...secondaryBtnStyle, padding: '5px 10px', fontSize: '12px' },
                    },
                    '全片重新配音',
                  ),
                ),

                // Scrollable Inspector Body
                selectedScene
                  ? h(
                      'div',
                      { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' } },
                      // Title
                      h(
                        'div',
                        null,
                        h('label', { style: { display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '6px' } }, '画面标题'),
                        h('input', {
                          className: 'dsh-vw-input',
                          value: selectedScene.title || '',
                          onChange: (e) => updateSelectedScene({ title: e.target.value }),
                          style: inputStyle,
                        }),
                      ),

                      // Narration
                      h(
                        'div',
                        null,
                        h(
                          'div',
                          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } },
                          h('label', { style: { fontSize: '12px', color: '#9CA3AF' } }, '旁白口播文案'),
                          selectedScene.durationSec
                            ? h('span', { style: { fontSize: '11px', color: '#10B981' } }, `实测 ${selectedScene.durationSec}s`)
                            : null,
                        ),
                        h('textarea', {
                          className: 'dsh-vw-textarea',
                          rows: 3,
                          value: selectedScene.narration || '',
                          onChange: (e) => updateSelectedScene({ narration: e.target.value }),
                          style: { ...inputStyle, resize: 'vertical', lineHeight: 1.55 },
                        }),
                      ),

                      scriptDirty
                        ? h(
                            'button',
                            {
                              className: 'dsh-vw-btn',
                              disabled: Boolean(busyLabel),
                              onClick: () => handleSaveScriptEdits(script),
                              style: { ...primaryBtnStyle, width: '100%' },
                            },
                            h(Icon, { name: 'check', size: 14 }),
                            '保存文字修改并刷新预览',
                          )
                        : null,

                      // Voice & Per-Scene Audio Controls
                      h(
                        'div',
                        { style: { ...cardStyle, padding: '12px', background: '#1A1E27', display: 'flex', flexDirection: 'column', gap: '10px' } },
                        h('div', { style: { fontSize: '12px', fontWeight: 600, color: '#E5E7EB' } }, '本幕配音音色与朗读'),
                        h(
                          'div',
                          { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                          h(
                            'div',
                            {
                              style: {
                                flex: 1,
                                padding: '7px 10px',
                                borderRadius: '7px',
                                background: '#0F1115',
                                border: '1px solid rgba(255,255,255,0.08)',
                                fontSize: '12px',
                                color: '#E5E7EB',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              },
                            },
                            voiceNameById(selectedScene.voiceId),
                          ),
                          h(
                            'button',
                            {
                              className: 'dsh-vw-btn',
                              onClick: () => {
                                setVoicePickTarget(selectedSceneIdx)
                                setShowVoiceModal(true)
                              },
                              style: { ...secondaryBtnStyle, padding: '6px 10px', fontSize: '12px' },
                            },
                            '更换',
                          ),
                        ),
                        h(
                          'div',
                          { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
                          h('span', { style: { fontSize: '12px', color: '#9CA3AF', flexShrink: 0 } }, '朗读情绪'),
                          h(
                            'select',
                            {
                              className: 'dsh-vw-select',
                              value: selectedScene.emotion || '平静',
                              onChange: (e) => updateSelectedScene({ emotion: e.target.value }),
                              style: { ...inputStyle, padding: '6px 8px', fontSize: '12px' },
                            },
                            availableEmotions.map((em) => h('option', { key: em, value: em }, em)),
                          ),
                        ),
                        h(
                          'button',
                          {
                            className: 'dsh-vw-btn',
                            disabled: Boolean(busyLabel),
                            onClick: () =>
                              runWorkbenchAction('tts-scene', {
                                sceneId: selectedScene.id,
                                text: selectedScene.narration,
                                emotion: selectedScene.emotion || '平静',
                                voiceId: selectedScene.voiceId || 'auto',
                              }),
                            style: { ...secondaryBtnStyle, width: '100%' },
                          },
                          h(Icon, { name: 'volume', size: 14, color: '#60A5FA' }),
                          '生成本幕配音并对齐时长',
                        ),
                        sceneAudioUrl
                          ? h('audio', { controls: true, src: sceneAudioUrl, style: { width: '100%', height: '30px' } })
                          : null,
                      ),

                      // Visual Asset Binding
                      h(
                        'div',
                        null,
                        h('label', { style: { display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '6px' } }, '关联视觉素材'),
                        h(
                          'select',
                          {
                            className: 'dsh-vw-select',
                            value: selectedAssetRel,
                            onChange: (e) => {
                              const rel = e.target.value
                              const found = visualAssets.find((v) => v.path === rel)
                              const nextMedia = found
                                ? [
                                    {
                                      assetId: found.id,
                                      path: found.path,
                                      webPath: found.webPath || '',
                                      type: found.type,
                                      motion: selectedScene.kenBurns || 'zoom-in',
                                      trimStartSec: 0,
                                    },
                                  ]
                                : []
                              const nextScenes = script.scenes.map((sc, idx) =>
                                idx === selectedSceneIdx ? { ...sc, media: nextMedia } : sc,
                              )
                              const nextScript = { ...script, scenes: nextScenes }
                              setScript(nextScript)
                              handleSaveScriptEdits(nextScript)
                            },
                            style: inputStyle,
                          },
                          h('option', { value: '' }, '使用动态视觉卡片（不绑定素材）'),
                          visualAssets.map((a) => h('option', { key: a.id, value: a.path }, `${a.type === 'video' ? '[视频] ' : '[图片] '}${a.originalName || a.name}`)),
                        ),
                      ),

                      // Collapsible Motion / Transition / Subtitle / SFX
                      h(
                        'details',
                        { style: { ...cardStyle, padding: '10px 12px', background: '#1A1E27' } },
                        h(
                          'summary',
                          { style: { cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#D1D5DB', userSelect: 'none' } },
                          '镜头动效、转场与音效（高级）',
                        ),
                        h(
                          'div',
                          { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' } },
                          h(
                            'div',
                            null,
                            h('label', { style: { display: 'block', fontSize: '11px', color: '#9CA3AF', marginBottom: '4px' } }, '底部辅助字幕条'),
                            h('input', {
                              className: 'dsh-vw-input',
                              value: selectedScene.subtitleLine || '',
                              onChange: (e) => updateSelectedScene({ subtitleLine: e.target.value }),
                              style: { ...inputStyle, fontSize: '12px', padding: '7px 9px' },
                            }),
                          ),
                          h(
                            'div',
                            null,
                            h('label', { style: { display: 'block', fontSize: '11px', color: '#9CA3AF', marginBottom: '4px' } }, '镜头运镜动效'),
                            h(
                              'select',
                              {
                                className: 'dsh-vw-select',
                                value: selectedScene.kenBurns || 'zoom-in',
                                onChange: (e) => updateSelectedScene({ kenBurns: e.target.value }),
                                style: { ...inputStyle, fontSize: '12px', padding: '7px 9px' },
                              },
                              MOTION_OPTIONS.map((m) => h('option', { key: m.value, value: m.value }, m.label)),
                            ),
                          ),
                          h(
                            'div',
                            null,
                            h('label', { style: { display: 'block', fontSize: '11px', color: '#9CA3AF', marginBottom: '4px' } }, '切镜转场方式'),
                            h(
                              'select',
                              {
                                className: 'dsh-vw-select',
                                value: selectedScene.transition || 'crossfade',
                                onChange: (e) => updateSelectedScene({ transition: e.target.value }),
                                style: { ...inputStyle, fontSize: '12px', padding: '7px 9px' },
                              },
                              TRANSITION_OPTIONS.map((t) => h('option', { key: t.value, value: t.value }, t.label)),
                            ),
                          ),
                          h(
                            'div',
                            null,
                            h('label', { style: { display: 'block', fontSize: '11px', color: '#9CA3AF', marginBottom: '4px' } }, '本幕开头音效'),
                            h(
                              'select',
                              {
                                className: 'dsh-vw-select',
                                value: selectedScene.sfxCues?.[0]?.type || 'none',
                                onChange: (e) => {
                                  const kind = e.target.value
                                  const cues = kind === 'none' ? [] : [{ type: kind, path: `audio/sfx/${kind}.wav`, offsetSec: 0, volume: 0.45 }]
                                  updateSelectedScene({ sfxCues: cues })
                                },
                                style: { ...inputStyle, fontSize: '12px', padding: '7px 9px' },
                              },
                              SFX_OPTIONS.map((s) => h('option', { key: s.value, value: s.value }, s.label)),
                            ),
                          ),
                          h(
                            'button',
                            {
                              className: 'dsh-vw-btn',
                              disabled: Boolean(busyLabel),
                              onClick: () => handleSaveScriptEdits(script),
                              style: { ...secondaryBtnStyle, width: '100%', fontSize: '12px' },
                            },
                            '应用以上高级调整',
                          ),
                        ),
                      ),
                    )
                  : null,
              ),
            )

      // -----------------------------------------------------------------------
      // STEP 4: 导出 MP4 (Clean Finished Player + Download + Collapsed Power Tools)
      // -----------------------------------------------------------------------
      const step4View = h(
        'div',
        { className: 'dsh-vw-scroll', style: { flex: 1, overflowY: 'auto', padding: '28px 32px' } },
        h(
          'div',
          { style: { maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' } },
          hasMp4
            ? h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
                h(
                  'div',
                  {
                    style: {
                      ...cardStyle,
                      padding: '10px',
                      background: '#0A0C10',
                    },
                  },
                  h('video', {
                    key: `mp4-${assetVersion}-${activeProjectDir}`,
                    controls: true,
                    src: finalMp4Url,
                    style: { width: '100%', aspectRatio: '16 / 9', borderRadius: '8px', background: '#000', display: 'block' },
                  }),
                ),
                h(
                  'div',
                  {
                    style: {
                      ...cardStyle,
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    },
                  },
                  h(
                    'div',
                    null,
                    h('div', { style: { fontSize: '15px', fontWeight: 700, color: '#F3F4F6' } }, `${script?.title || '成片视频'} 已就绪`),
                    h(
                      'div',
                      { style: { fontSize: '12px', color: '#9CA3AF', marginTop: '4px' } },
                      `共 ${scenes.length} 幕 · 总时长 ${script?.totalDurationSec || 0} 秒 · ${fps}fps H.264 成品 MP4`,
                    ),
                  ),
                  h(
                    'div',
                    { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
                    h(
                      'select',
                      {
                        className: 'dsh-vw-select',
                        value: exportPreset,
                        onChange: (e) => setExportPreset(e.target.value),
                        style: { ...inputStyle, width: 'auto', padding: '8px 10px' },
                      },
                      h('option', { value: '1080p' }, '1080p 高清 (1920×1080)'),
                      h('option', { value: '720p' }, '720p 快速 (1280×720)'),
                    ),
                    h(
                      'button',
                      {
                        className: 'dsh-vw-btn',
                        disabled: Boolean(busyLabel),
                        onClick: () => runWorkbenchAction('render', exportPreset === '720p' ? { renderWidth: 1280, renderHeight: 720 } : {}),
                        style: secondaryBtnStyle,
                      },
                      '重新导出 MP4',
                    ),
                    h(
                      'a',
                      {
                        href: finalMp4Url,
                        download: `${script?.title || 'dsh-video'}.mp4`,
                        className: 'dsh-vw-btn',
                        style: { ...primaryBtnStyle, textDecoration: 'none' },
                      },
                      h(Icon, { name: 'download', size: 15 }),
                      '下载视频 MP4',
                    ),
                  ),
                ),
              )
            : h(
                'div',
                {
                  style: {
                    ...cardStyle,
                    padding: '44px 28px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '14px',
                  },
                },
                h(
                  'div',
                  {
                    style: {
                      width: '52px',
                      height: '52px',
                      borderRadius: '12px',
                      background: '#1E222B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#60A5FA',
                    },
                  },
                  h(Icon, { name: 'film', size: 24 }),
                ),
                h('h2', { style: { margin: 0, fontSize: '18px', fontWeight: 700, color: '#F3F4F6' } }, '还没有导出过 MP4 成片'),
                h(
                  'p',
                  { style: { margin: 0, fontSize: '13px', color: '#9CA3AF', maxWidth: '460px', lineHeight: 1.6 } },
                  '点击下方按钮后，工作台会自动完成所有画面逐帧合成与配音配乐混音，导出可直接分享的 MP4 视频文件。',
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap', justifyContent: 'center' } },
                  h(
                    'select',
                    {
                      className: 'dsh-vw-select',
                      value: exportPreset,
                      onChange: (e) => setExportPreset(e.target.value),
                      style: { ...inputStyle, width: 'auto' },
                    },
                    h('option', { value: '1080p' }, '1080p 全高清 (推荐)'),
                    h('option', { value: '720p' }, '720p 快速渲染'),
                  ),
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      disabled: Boolean(busyLabel) || scenes.length === 0,
                      onClick: () => runWorkbenchAction('render', exportPreset === '720p' ? { renderWidth: 1280, renderHeight: 720 } : {}),
                      style: primaryBtnStyle,
                    },
                    h(Icon, { name: 'download', size: 15 }),
                    '开始渲染导出 MP4',
                  ),
                ),
              ),

          // Collapsed Power-User Verification Tools
          h(
            'details',
            { style: { ...cardStyle, padding: '14px 18px' } },
            h(
              'summary',
              { style: { cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#9CA3AF', userSelect: 'none' } },
              '高级检查工具（九宫格关键帧预览 / 规范检查 / 重新混音）',
            ),
            h(
              'div',
              { style: { marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' } },
              h(
                'div',
                { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
                h(
                  'button',
                  { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: () => runWorkbenchAction('snapshot'), style: secondaryBtnStyle },
                  '生成 3×3 九宫格预览图',
                ),
                h(
                  'button',
                  { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: () => runWorkbenchAction('lint'), style: secondaryBtnStyle },
                  '画面规范体检',
                ),
                h(
                  'button',
                  { className: 'dsh-vw-btn', disabled: Boolean(busyLabel), onClick: () => runWorkbenchAction('mix'), style: secondaryBtnStyle },
                  '仅重新混音人声与配乐',
                ),
              ),
              hasSnapshot
                ? h(
                    'div',
                    null,
                    h('div', { style: { fontSize: '12px', color: '#9CA3AF', marginBottom: '8px' } }, '关键帧九宫格抽检预览：'),
                    h('img', {
                      src: snapshotUrl,
                      alt: '3x3 关键帧预览图',
                      style: { width: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' },
                    }),
                  )
                : null,
              lintReport
                ? h(
                    'div',
                    { style: { padding: '12px', borderRadius: '8px', background: '#0F1115', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' } },
                    (lintReport.checks || []).map((c, idx) =>
                      h(
                        'div',
                        { key: idx, style: { color: c.passed ? '#10B981' : '#F87171' } },
                        `${c.passed ? '通过' : '需注意'} · ${c.name}: ${c.value}`,
                      ),
                    ),
                  )
                : null,
            ),
          ),
        ),
      )

      // -----------------------------------------------------------------------
      // MODAL 1: 新建视频项目
      // -----------------------------------------------------------------------
      const newProjectModal = showNewModal
        ? h(
            'div',
            {
              onClick: () => setShowNewModal(false),
              style: {
                position: 'fixed',
                inset: 0,
                zIndex: 3000,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
              },
            },
            h(
              'div',
              {
                onClick: (e) => e.stopPropagation(),
                style: { ...cardStyle, width: '100%', maxWidth: '460px', padding: '22px', background: '#161920', display: 'flex', flexDirection: 'column', gap: '16px' },
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('h3', { style: { margin: 0, fontSize: '16px', fontWeight: 700, color: '#F3F4F6' } }, '新建视频项目'),
                h('button', { onClick: () => setShowNewModal(false), style: { background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' } }, h(Icon, { name: 'x', size: 18 })),
              ),
              h(
                'div',
                null,
                h('label', { style: { display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '6px' } }, '项目名称'),
                h('input', {
                  className: 'dsh-vw-input',
                  autoFocus: true,
                  value: newProjectForm.title,
                  onChange: (e) => setNewProjectForm((p) => ({ ...p, title: e.target.value })),
                  onKeyDown: (e) => e.key === 'Enter' && handleCreateProject(),
                  placeholder: '例如：2026 春季新品介绍、云南游记...',
                  style: inputStyle,
                }),
              ),
              h(
                'div',
                null,
                h('label', { style: { display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '6px' } }, '默认引擎'),
                h(
                  'div',
                  { style: { display: 'flex', gap: '8px' } },
                  [
                    { id: 'html', label: 'HTML5 动效（推荐）' },
                    { id: 'remotion', label: 'Remotion 电影精修' },
                  ].map((eng) =>
                    h(
                      'button',
                      {
                        key: eng.id,
                        className: 'dsh-vw-btn',
                        onClick: () => setNewProjectForm((p) => ({ ...p, engine: eng.id })),
                        style: {
                          flex: 1,
                          padding: '9px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          background: newProjectForm.engine === eng.id ? 'rgba(59,130,246,0.16)' : '#0F1115',
                          border: newProjectForm.engine === eng.id ? '1px solid #3B82F6' : '1px solid rgba(255,255,255,0.08)',
                          color: '#F3F4F6',
                        },
                      },
                      eng.label,
                    ),
                  ),
                ),
              ),
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' } },
                h('button', { className: 'dsh-vw-btn', onClick: () => setShowNewModal(false), style: secondaryBtnStyle }, '取消'),
                h('button', { className: 'dsh-vw-btn', onClick: handleCreateProject, style: primaryBtnStyle }, '创建并上传素材'),
              ),
            ),
          )
        : null

      // -----------------------------------------------------------------------
      // MODAL 2: 配音声音库 (205 款 + 试听 + 上传我的声音)
      // -----------------------------------------------------------------------
      const voiceModal = showVoiceModal
        ? h(
            'div',
            {
              onClick: () => setShowVoiceModal(false),
              style: {
                position: 'fixed',
                inset: 0,
                zIndex: 3000,
                background: 'rgba(0,0,0,0.68)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
              },
            },
            h(
              'div',
              {
                onClick: (e) => e.stopPropagation(),
                style: {
                  ...cardStyle,
                  width: '100%',
                  maxWidth: '780px',
                  maxHeight: '84vh',
                  background: '#161920',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                },
              },
              // Modal Header
              h(
                'div',
                {
                  style: {
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  },
                },
                h(
                  'div',
                  null,
                  h(
                    'h3',
                    { style: { margin: 0, fontSize: '16px', fontWeight: 700, color: '#F3F4F6' } },
                    typeof voicePickTarget === 'number'
                      ? `为第 ${voicePickTarget + 1} 幕挑选配音 (${voiceCatalog.length} 款)`
                      : `挑选主配音声音 (${voiceCatalog.length} 款)`,
                  ),
                  h('div', { style: { fontSize: '12px', color: '#9CA3AF', marginTop: '3px' } }, '先点击「试听」感受真实原声，满意后点「选用」'),
                ),
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                  h(
                    'button',
                    {
                      className: 'dsh-vw-btn',
                      onClick: () => setShowVoiceUpload((v) => !v),
                      style: { ...secondaryBtnStyle, padding: '6px 12px', fontSize: '12px' },
                    },
                    h(Icon, { name: 'plus', size: 13 }),
                    showVoiceUpload ? '收起上传' : '上传我的声音',
                  ),
                  h('button', { onClick: () => setShowVoiceModal(false), style: { background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' } }, h(Icon, { name: 'x', size: 18 })),
                ),
              ),

              // Collapsible Custom Voice Upload Area
              showVoiceUpload
                ? h(
                    'div',
                    {
                      style: {
                        padding: '14px 20px',
                        background: '#1A1E27',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '10px',
                        alignItems: 'center',
                      },
                    },
                    h(
                      'button',
                      { className: 'dsh-vw-btn', onClick: () => voiceFileInputRef.current?.click(), style: secondaryBtnStyle },
                      voiceUploadForm.fileName ? `已选: ${voiceUploadForm.fileName}` : '选择录音文件 (.wav / .mp3)',
                    ),
                    h('input', {
                      className: 'dsh-vw-input',
                      value: voiceUploadForm.name,
                      onChange: (e) => setVoiceUploadForm((p) => ({ ...p, name: e.target.value })),
                      placeholder: '声音显示名称（如 温暖旁白）',
                      style: { ...inputStyle, width: '180px' },
                    }),
                    h(
                      'select',
                      {
                        className: 'dsh-vw-select',
                        value: voiceUploadForm.gender,
                        onChange: (e) => setVoiceUploadForm((p) => ({ ...p, gender: e.target.value })),
                        style: { ...inputStyle, width: '90px' },
                      },
                      h('option', { value: 'female' }, '女声'),
                      h('option', { value: 'male' }, '男声'),
                    ),
                    h(
                      'button',
                      { className: 'dsh-vw-btn', onClick: handleImportVoice, style: primaryBtnStyle },
                      '确认导入',
                    ),
                  )
                : null,

              // Search & Category Pills
              h(
                'div',
                { style: { padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '10px' } },
                h('input', {
                  className: 'dsh-vw-input',
                  value: voiceSearchQuery,
                  onChange: (e) => setVoiceSearchQuery(e.target.value),
                  placeholder: '搜索音色名称、风格或人群（如 纪录片、孩童、知性、大叔）...',
                  style: inputStyle,
                }),
                h(
                  'div',
                  { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                  [{ name: 'all', count: voiceCatalog.length, label: `全部 (${voiceCatalog.length})` }, ...voiceCategories.map((c) => ({ ...c, label: `${c.name} (${c.count})` }))].map((cat) =>
                    h(
                      'button',
                      {
                        key: cat.name,
                        className: 'dsh-vw-btn',
                        onClick: () => setVoiceCategoryFilter(cat.name),
                        style: {
                          padding: '4px 11px',
                          borderRadius: '99px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: voiceCategoryFilter === cat.name ? '#3B82F6' : '#0F1115',
                          color: voiceCategoryFilter === cat.name ? '#fff' : '#9CA3AF',
                          fontSize: '12px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        },
                      },
                      cat.label,
                    ),
                  ),
                ),
              ),

              // Voices List
              h(
                'div',
                {
                  className: 'dsh-vw-scroll',
                  style: {
                    flex: 1,
                    overflowY: 'auto',
                    padding: '14px 20px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '10px',
                    alignContent: 'start',
                  },
                },
                filteredVoices.slice(0, 100).map((v) => {
                  const isPlayingThis = playingVoiceId === v.id
                  return h(
                    'div',
                    {
                      key: v.id,
                      style: {
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: '#0F1115',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                      },
                    },
                    h(
                      'div',
                      { style: { minWidth: 0, flex: 1 } },
                      h(
                        'div',
                        { style: { fontSize: '13px', fontWeight: 600, color: '#F3F4F6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                        v.name,
                      ),
                      h(
                        'div',
                        { style: { fontSize: '11px', color: '#9CA3AF', marginTop: '3px' } },
                        `${v.category || '内置'} · ${v.gender === 'male' ? '男声' : '女声'}${v.durationSec ? ` · ${v.durationSec}s` : ''}`,
                      ),
                    ),
                    h(
                      'div',
                      { style: { display: 'flex', gap: '6px', flexShrink: 0 } },
                      h(
                        'button',
                        {
                          className: 'dsh-vw-btn',
                          onClick: () => handlePreviewVoice(v),
                          style: {
                            ...secondaryBtnStyle,
                            padding: '5px 10px',
                            fontSize: '12px',
                            borderColor: isPlayingThis ? '#3B82F6' : 'rgba(255,255,255,0.12)',
                            color: isPlayingThis ? '#60A5FA' : '#E5E7EB',
                          },
                        },
                        h(Icon, { name: isPlayingThis ? 'pause' : 'play', size: 11 }),
                        isPlayingThis ? '停止' : '试听',
                      ),
                      h(
                        'button',
                        {
                          className: 'dsh-vw-btn',
                          onClick: () => handleAssignVoiceFromModal(v),
                          style: { ...primaryBtnStyle, padding: '5px 12px', fontSize: '12px' },
                        },
                        '选用',
                      ),
                    ),
                  )
                }),
              ),
            ),
          )
        : null

      // -----------------------------------------------------------------------
      // ROOT RENDER
      // -----------------------------------------------------------------------
      return h(
        'div',
        {
          className: 'dsh-vw-root',
          'data-dsh-main-workbench': 'true',
          style: {
            position: isMainSlot ? 'relative' : 'fixed',
            inset: isMainSlot ? undefined : 0,
            width: '100%',
            height: isMainSlot ? '100%' : '100vh',
            zIndex: isMainSlot ? 1 : 2100,
            display: 'flex',
            background: '#0F1115',
            color: '#F3F4F6',
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
          label: '视频工作台',
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
