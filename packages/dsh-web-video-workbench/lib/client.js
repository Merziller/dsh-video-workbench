/**
 * DSH Video Workbench - Frontend Client Module (`dsh-web-video-workbench`)
 * Reuses the `window.__ModuleLoader__` + `PanelBoundary` + `shell.overlay` / `main` / `tool.call.toolview`
 * slot architecture from MIT-licensed `dsh-workbench` and `dsh-ppt`.
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
      'generate_speech',
      'list_voices',
      'import_voice_pack',
      'match_scene_voices',
      'video_lint',
      'video_snapshot',
      'video_render',
    ])

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
                padding: '16px',
                margin: '16px',
                borderRadius: '12px',
                background: '#2a1215',
                border: '1px solid #f87171',
                color: '#fecaca',
                fontFamily: 'Microsoft YaHei, Consolas, sans-serif',
              },
            },
            h('strong', null, '视频工作台渲染异常：'),
            h('pre', { style: { marginTop: '8px', whiteSpace: 'pre-wrap' } }, String(this.state.error?.message || this.state.error)),
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
     * Custom Tool Call Card in DSH Agent Conversation Stream (`tool.call.toolview`)
     */
    function VideoToolCallCard({ item }) {
      if (!item || !VIDEO_TOOL_NAMES.has(item.toolName)) return null
      const args = item.args || item.input || {}
      const out = item.result || item.output || {}

      return h(
        'div',
        {
          style: {
            margin: '6px 0',
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.92))',
            border: '1px solid rgba(56,189,248,0.32)',
            color: '#f8fafc',
            fontFamily: 'Microsoft YaHei, Consolas, sans-serif',
            fontSize: '12px',
          },
        },
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
          h('span', { style: { fontWeight: 700, color: '#38bdf8' } }, `🎬 ${item.toolName}`),
          h('span', { style: { color: '#94a3b8', fontFamily: 'Consolas, monospace' } }, item.status || 'done'),
        ),
        args.voiceId
          ? h('div', { style: { color: '#cbd5e1' } }, `🎙️ 音色策略: ${args.voiceId} (${args.emotion || '平静'})`)
          : null,
        out.durationSec
          ? h(
              'div',
              { style: { color: '#34d399', marginTop: '3px', fontFamily: 'Consolas, monospace' } },
              `⏱️ ffprobe 实测时长: ${out.durationSec}s (${out.durationInFrames} frames) · 音色: ${out.voiceName || out.voiceId || ''}`,
            )
          : null,
        out.snapshotPath
          ? h('div', { style: { color: '#a78bfa', marginTop: '3px' } }, `📸 3×3 九宫格快照: ${out.snapshotPath}`)
          : null,
        out.outputPath && item.toolName === 'video_render'
          ? h('div', { style: { color: '#fbbf24', marginTop: '3px' } }, `🎞️ MP4 导出完成: ${out.outputPath}`)
          : null,
      )
    }

    /**
     * Sidebar Icon Item
     */
    function SidebarVideoIcon() {
      return h(
        'span',
        {
          title: 'HTML / Remotion 视频工作台',
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            fontSize: '14px',
          },
        },
        '🎬',
      )
    }

    /**
     * Main Three-Column Video Workbench + Centered Top-Bar Capsule Switcher
     */
    function VideoWorkbenchApp({ ctx, isMainSlot = false }) {
      const connFetch = useConnectionFetch(ctx)
      const [mode, setMode] = useState(isMainSlot ? 'video' : 'dsh') // 'dsh' | 'video'
      const [splitChat, setSplitChat] = useState(true) // When true in video mode, docks right column cleanly
      const [activeView, setActiveView] = useState('preview') // 'script' | 'preview' | 'mp4'

      const [projects, setProjects] = useState([])
      const [activeProjectDir, setActiveProjectDir] = useState('')
      const [script, setScript] = useState(null)
      const [voiceCatalog, setVoiceCatalog] = useState([])
      const [hasMp4, setHasMp4] = useState(false)
      const [hasSnapshot, setHasSnapshot] = useState(false)
      const [assetVersion, setAssetVersion] = useState(1)

      const [busyLabel, setBusyLabel] = useState('')
      const [statusLog, setStatusLog] = useState('就绪：支持 HTML/GSAP 与 Remotion 双引擎 + 音色包智能匹配')
      const [lintReport, setLintReport] = useState(null)

      // Voice Pack Import & Filter Drawer State
      const [showVoiceModal, setShowVoiceModal] = useState(false)
      const [voiceCategoryFilter, setVoiceCategoryFilter] = useState('all')
      const [voiceSearchQuery, setVoiceSearchQuery] = useState('')
      const [playingVoiceId, setPlayingVoiceId] = useState('')
      const previewAudioRef = useRef(null)
      const [importForm, setImportForm] = useState({
        sourcePath: '',
        name: '',
        gender: 'female',
        engine: 'indextts2',
        tags: '纪录片, 清晰, 旁白',
        promptText: '',
      })

      const groupedVoices = useMemo(() => {
        const groups = {}
        for (const v of voiceCatalog) {
          const cat = v.category || '默认分类'
          if (!groups[cat]) groups[cat] = []
          groups[cat].push(v)
        }
        return groups
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

      const handlePreviewVoiceSample = useCallback((voice) => {
        if (!voice || !voice.available || String(voice.refPath || '').endsWith('.pt')) {
          setStatusLog(`ℹ️ 音色「${voice?.name}」为 .pt 特征张量，请点击分镜「🔊 合成此幕配音」试听效果。`)
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
        audio.onerror = () => setPlayingVoiceId('')
        audio.play().catch(() => setPlayingVoiceId(''))
      }, [playingVoiceId])

      // Timeline & Playback State
      const [currentFrame, setCurrentFrame] = useState(8)
      const [isPlaying, setIsPlaying] = useState(false)
      const iframeRef = useRef(null)

      // Shared active session detection from DSH URL / storage
      const [sessionId, setSessionId] = useState(() => {
        try {
          return window.location.hash.replace(/^#\/?/, '') || localStorage.getItem('dsh.activeSessionId') || 'active-session'
        } catch {
          return 'active-session'
        }
      })

      const refreshState = useCallback(
        async (targetDir = activeProjectDir) => {
          try {
            const q = targetDir ? `?projectDir=${encodeURIComponent(targetDir)}` : ''
            const res = await connFetch(`/api/video-workbench/state${q}`)
            const data = await res.json()
            if (data.ok) {
              setProjects(data.projects || [])
              setVoiceCatalog(data.voiceCatalog || [])
              if (data.activeProject) {
                setActiveProjectDir(data.activeProject.projectDir)
                setScript(data.activeProject.script)
                setHasMp4(Boolean(data.activeProject.hasMp4))
                setHasSnapshot(Boolean(data.activeProject.hasSnapshot))
              }
            }
          } catch (err) {
            setStatusLog(`状态同步失败: ${err.message}`)
          }
        },
        [connFetch, activeProjectDir],
      )

      useEffect(() => {
        refreshState('')
      }, [])

      // Listen for global mode switch events so multiple slot instances stay synchronized
      useEffect(() => {
        const handler = (ev) => {
          if (ev.detail && ev.detail.mode) {
            setMode(ev.detail.mode)
          }
        }
        window.addEventListener('dsh-video:switch-mode', handler)
        return () => window.removeEventListener('dsh-video:switch-mode', handler)
      }, [])

      const switchWorkbenchMode = (nextMode) => {
        setMode(nextMode)
        window.dispatchEvent(new CustomEvent('dsh-video:switch-mode', { detail: { mode: nextMode } }))
        if (nextMode === 'video') {
          refreshState(activeProjectDir)
        }
      }

      // Synchronize playhead with HTML/GSAP iframe via postMessage & __seekToFrame
      const seekToFrame = useCallback(
        (frame) => {
          const total = Math.max(1, Number(script?.totalDurationInFrames) || 300)
          const clamped = Math.max(0, Math.min(total - 1, Math.floor(frame)))
          setCurrentFrame(clamped)
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

      useEffect(() => {
        if (!isPlaying || !script) return
        const fps = Number(script.fps) || 30
        const total = Math.max(1, Number(script.totalDurationInFrames) || 300)
        const timer = setInterval(() => {
          setCurrentFrame((prev) => {
            const next = (prev + 1) % total
            const win = iframeRef.current?.contentWindow
            if (win) {
              try {
                win.postMessage({ type: 'dsh-video:seek', frame: next }, '*')
              } catch {}
            }
            return next
          })
        }, 1000 / fps)
        return () => clearInterval(timer)
      }, [isPlaying, script])

      // Actions
      const handleCreateProject = async () => {
        const title = window.prompt('请输入新视频项目名称：', '科技产品发布短片')
        if (!title) return
        const engineChoice = window.prompt('请选择渲染引擎 (html 或 remotion)：', 'html') || 'html'
        setBusyLabel('新建项目中...')
        try {
          const res = await connFetch('/api/video-workbench/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              engine: engineChoice.trim().toLowerCase() === 'remotion' ? 'remotion' : 'html',
              voiceMode: 'auto',
            }),
          })
          const data = await res.json()
          if (data.ok) {
            setStatusLog(`✅ 已创建项目「${title}」（已生成 Windows 11 .npmrc 防沙箱配置并绑定「视频制作模式」）`)
            setAssetVersion((v) => v + 1)
            await refreshState(data.projectDir)
          }
        } finally {
          setBusyLabel('')
        }
      }

      const handleImportVoicePack = async (e) => {
        e.preventDefault()
        if (!importForm.sourcePath.trim()) {
          setStatusLog('⚠️ 请填写本地音频文件 (.wav/.mp3/.pt)、音色包目录或 .zip 路径')
          return
        }
        setBusyLabel('导入音色包...')
        try {
          const res = await connFetch('/api/video-workbench/voices/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourcePath: importForm.sourcePath.trim(),
              name: importForm.name.trim(),
              gender: importForm.gender,
              engine: importForm.engine,
              tags: importForm.tags
                .split(/[,，\s]+/)
                .map((s) => s.trim())
                .filter(Boolean),
              promptText: importForm.promptText.trim(),
            }),
          })
          const data = await res.json()
          if (data.ok) {
            setVoiceCatalog(data.voiceCatalog || [])
            setStatusLog(`🎙️ 成功导入 ${data.importedCount} 个音色至本地音色库！AI 现可自由调用匹配。`)
            setImportForm({ ...importForm, sourcePath: '', name: '' })
          } else {
            setStatusLog(`❌ 导入失败: ${data.error}`)
          }
        } finally {
          setBusyLabel('')
        }
      }

      const handleAutoMatchVoices = async (globalVoiceId = 'auto', forceAuto = true) => {
        if (!activeProjectDir) return
        setBusyLabel('AI 音色匹配中...')
        try {
          const res = await connFetch('/api/video-workbench/voices/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectDir: activeProjectDir,
              voiceId: globalVoiceId,
              forceAuto,
            }),
          })
          const data = await res.json()
          if (data.ok) {
            setScript(data.script)
            setAssetVersion((v) => v + 1)
            setStatusLog(
              globalVoiceId === 'auto'
                ? `🤖 AI 已根据分镜情绪、角色与受众完成 ${data.matches?.length || 0} 幕最佳音色匹配！`
                : `🎯 已将全局音色指定为: ${globalVoiceId}`,
            )
          }
        } finally {
          setBusyLabel('')
        }
      }

      const handleUpdateSceneField = async (sceneId, patch) => {
        if (!script || !activeProjectDir) return
        const nextScript = {
          ...script,
          scenes: (script.scenes || []).map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
        }
        setScript(nextScript)
        const res = await connFetch('/api/video-workbench/script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectDir: activeProjectDir, script: nextScript }),
        })
        const data = await res.json()
        if (data.ok) {
          setScript(data.script)
          setAssetVersion((v) => v + 1)
        }
      }

      const handleRunAction = async (action, extra = {}) => {
        if (!activeProjectDir) return
        const labelMap = {
          'tts-scene': '正在生成本幕配音并测量精确时长...',
          'tts-all': '正在批量生成全部配音并通过 ffprobe 测算帧数...',
          lint: '正在执行双引擎规范与 WCAG AA 对比度自检...',
          snapshot: '正在生成 3×3 九宫格视觉自检图 (PNG)...',
          render: '正在合成音画并编码导出 H.264 MP4...',
        }
        setBusyLabel(labelMap[action] || '执行中...')
        try {
          const res = await connFetch('/api/video-workbench/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              projectDir: activeProjectDir,
              ...extra,
            }),
          })
          const data = await res.json()
          if (!data.ok) {
            setStatusLog(`❌ 执行失败 (${action}): ${data.error}`)
            return
          }
          if (data.script) {
            setScript(data.script)
          }
          if (action === 'lint') {
            setLintReport(data.result)
            setStatusLog(
              data.result.ok
                ? `✅ video_lint 校验通过（对比度 ${data.result.contrastRatio}:1，0 错误）`
                : `⚠️ video_lint 发现 ${data.result.errors?.length || 0} 项问题`,
            )
          } else if (action === 'tts-scene') {
            setAssetVersion((v) => v + 1)
            setStatusLog(
              `🔊 分镜配音完成：实测 ${data.result.durationSec}s (${data.result.durationInFrames} 帧) · 音色: ${data.result.voiceName}`,
            )
          } else if (action === 'tts-all') {
            setAssetVersion((v) => v + 1)
            setStatusLog(`🔊 全部分镜配音与 ffprobe 帧数回填完成！总时长 ${data.script?.totalDurationSec}s`)
          } else if (action === 'snapshot') {
            setHasSnapshot(true)
            setAssetVersion((v) => v + 1)
            setStatusLog(`📸 3×3 九宫格视觉自检图已生成: ${data.result.snapshotPath}`)
          } else if (action === 'render') {
            setHasMp4(true)
            setHasSnapshot(true)
            setAssetVersion((v) => v + 1)
            setActiveView('mp4')
            setStatusLog(`🎬 MP4 渲染成功 (${(data.result.fileSizeBytes / 1024).toFixed(1)} KB): ${data.result.outputPath}`)
          }
        } finally {
          setBusyLabel('')
        }
      }

      // Send prompt into native DSH chat input if present on page
      const sendPromptToNativeAgent = (promptText) => {
        const textarea = document.querySelector('textarea')
        if (textarea) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
          if (nativeSetter) {
            nativeSetter.call(textarea, promptText)
          } else {
            textarea.value = promptText
          }
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
          textarea.focus()
          setStatusLog('💬 已将指令填入右栏 DeepSeek Harness 对话框，可直接回车发送或切换对话详情。')
        } else {
          navigator.clipboard?.writeText(promptText)
          setStatusLog('📋 已复制 Agent 指令到剪贴板。')
        }
      }

      // 1. Centered Top-Bar Capsule Switcher (`[ DeepSeek Harness | HTML 视频 ]`)
      const topBarCapsule = h(
        'div',
        {
          style: {
            position: 'fixed',
            top: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2200,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 6px',
            borderRadius: '999px',
            background: 'rgba(11, 16, 32, 0.92)',
            border: '1px solid rgba(56, 189, 248, 0.38)',
            boxShadow: '0 8px 28px rgba(0, 0, 0, 0.48)',
            backdropFilter: 'blur(12px)',
            fontFamily: 'Microsoft YaHei, Consolas, sans-serif',
            fontSize: '12px',
          },
        },
        h(
          'button',
          {
            onClick: () => switchWorkbenchMode('dsh'),
            style: {
              border: 'none',
              cursor: 'pointer',
              padding: '5px 14px',
              borderRadius: '999px',
              fontWeight: 600,
              fontSize: '12px',
              transition: 'all 0.15s ease',
              background: mode === 'dsh' ? 'linear-gradient(135deg, #0284c7, #2563eb)' : 'transparent',
              color: mode === 'dsh' ? '#ffffff' : '#94a3b8',
            },
          },
          '💬 DeepSeek Harness',
        ),
        h(
          'button',
          {
            onClick: () => switchWorkbenchMode('video'),
            style: {
              border: 'none',
              cursor: 'pointer',
              padding: '5px 14px',
              borderRadius: '999px',
              fontWeight: 600,
              fontSize: '12px',
              transition: 'all 0.15s ease',
              background: mode === 'video' ? 'linear-gradient(135deg, #0ea5e9, #6366f1)' : 'transparent',
              color: mode === 'video' ? '#ffffff' : '#94a3b8',
            },
          },
          '🎬 HTML 视频',
        ),
      )

      if (!isMainSlot && mode === 'dsh') {
        return topBarCapsule
      }

      const fps = Number(script?.fps) || 30
      const totalFrames = Math.max(1, Number(script?.totalDurationInFrames) || 300)
      const totalSec = Number(script?.totalDurationSec || totalFrames / fps).toFixed(2)
      const scenes = script?.scenes || []

      const previewHtmlUrl = activeProjectDir
        ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=index.html&v=${assetVersion}`
        : ''
      const snapshotImgUrl = activeProjectDir
        ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=${encodeURIComponent('output/snapshot-3x3.png')}&v=${assetVersion}`
        : ''
      const mp4VideoUrl = activeProjectDir
        ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=${encodeURIComponent('output/final.mp4')}&v=${assetVersion}`
        : ''

      // Render Three-Column Video Workbench
      return h(
        React.Fragment,
        null,
        !isMainSlot ? topBarCapsule : null,
        h(
          'div',
          {
            style: {
              position: isMainSlot ? 'relative' : 'fixed',
              inset: isMainSlot ? undefined : '46px 0 0 0',
              width: '100%',
              height: isMainSlot ? '100%' : 'calc(100vh - 46px)',
              zIndex: isMainSlot ? 10 : 1900,
              display: 'grid',
              gridTemplateColumns: splitChat ? '270px 1fr 330px' : '270px 1fr',
              background: '#090d18',
              color: '#f8fafc',
              fontFamily: 'Microsoft YaHei, Consolas, sans-serif',
              overflow: 'hidden',
              borderTop: '1px solid rgba(56,189,248,0.22)',
            },
          },

          // ==================== LEFT COLUMN: PROJECTS & VOICE PACK MANAGER ====================
          h(
            'aside',
            {
              style: {
                borderRight: '1px solid rgba(148,163,184,0.16)',
                background: '#0b1020',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                padding: '14px',
                gap: '14px',
              },
            },
            // Header + New Project Button
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('span', { style: { fontWeight: 700, fontSize: '13px', color: '#e2e8f0' } }, '📁 视频工程列表'),
              h(
                'button',
                {
                  onClick: handleCreateProject,
                  style: {
                    border: '1px solid rgba(56,189,248,0.45)',
                    background: 'rgba(14,165,233,0.18)',
                    color: '#38bdf8',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  },
                },
                '+ 新建项目',
              ),
            ),

            // Project List
            h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              projects.map((p) => {
                const active = p.projectDir === activeProjectDir
                return h(
                  'div',
                  {
                    key: p.projectDir,
                    onClick: () => refreshState(p.projectDir),
                    style: {
                      padding: '10px 12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      background: active ? 'rgba(14,165,233,0.16)' : 'rgba(19,28,51,0.65)',
                      border: active ? '1px solid #38bdf8' : '1px solid rgba(148,163,184,0.14)',
                    },
                  },
                  h(
                    'div',
                    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                    h('span', { style: { fontWeight: 600, fontSize: '13px' } }, p.name),
                    h(
                      'span',
                      {
                        style: {
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: p.engine === 'remotion' ? 'rgba(168,85,247,0.22)' : 'rgba(56,189,248,0.2)',
                          color: p.engine === 'remotion' ? '#c084fc' : '#38bdf8',
                          fontFamily: 'Consolas, monospace',
                        },
                      },
                      (p.engine || 'html').toUpperCase(),
                    ),
                  ),
                  h(
                    'div',
                    { style: { fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontFamily: 'Consolas, monospace' } },
                    `${p.sceneCount} 分镜 · ${Number(p.totalDurationSec || 0).toFixed(1)}s · ${p.fps}fps`,
                  ),
                )
              }),
            ),

            // Voice Pack & AI Voice Matching Section
            h(
              'div',
              {
                style: {
                  borderTop: '1px solid rgba(148,163,184,0.16)',
                  paddingTop: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                },
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('span', { style: { fontWeight: 700, fontSize: '13px', color: '#e2e8f0' } }, '🎙️ 音色包与配音策略'),
                h(
                  'button',
                  {
                    onClick: () => setShowVoiceModal((v) => !v),
                    style: {
                      border: '1px solid rgba(167,139,250,0.45)',
                      background: 'rgba(139,92,246,0.18)',
                      color: '#c4b5fd',
                      borderRadius: '8px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    },
                  },
                  showVoiceModal ? '收起导入' : '+ 导入音色包',
                ),
              ),

              // Global Voice Mode Selector (AI Auto Match vs User Specified Voice)
              h(
                'div',
                {
                  style: {
                    background: 'rgba(19,28,51,0.75)',
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.16)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  },
                },
                h('label', { style: { fontSize: '11px', color: '#94a3b8' } }, '全局配音音色模式：'),
                h(
                  'select',
                  {
                    value: script?.voiceMode === 'manual' ? script?.defaultVoiceId || 'auto' : 'auto',
                    onChange: (e) => handleAutoMatchVoices(e.target.value, e.target.value === 'auto'),
                    style: {
                      background: '#090d18',
                      color: '#f8fafc',
                      border: '1px solid rgba(56,189,248,0.35)',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      fontSize: '12px',
                    },
                  },
                  h('option', { value: 'auto' }, '🤖 AI 根据分镜自由匹配最佳音色 (推荐)'),
                  Object.entries(groupedVoices).map(([cat, list]) =>
                    h(
                      'optgroup',
                      { key: cat, label: `${cat} (${list.length})` },
                      list.map((v) =>
                        h(
                          'option',
                          { key: v.id, value: v.id },
                          `🎯 [${cat}] ${v.name} (${v.gender})`,
                        ),
                      ),
                    ),
                  ),
                ),
                h(
                  'button',
                  {
                    onClick: () => handleAutoMatchVoices('auto', true),
                    style: {
                      marginTop: '4px',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      background: 'linear-gradient(135deg, #0284c7, #4f46e5)',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    },
                  },
                  '🤖 重新执行 AI 分镜音色匹配',
                ),
              ),

              // Import Voice Pack Form
              showVoiceModal
                ? h(
                    'form',
                    {
                      onSubmit: handleImportVoicePack,
                      style: {
                        background: 'rgba(30,27,75,0.55)',
                        border: '1px solid rgba(167,139,250,0.4)',
                        borderRadius: '10px',
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '7px',
                        fontSize: '11px',
                      },
                    },
                    h('div', { style: { fontWeight: 700, color: '#ddd6fe' } }, '📥 导入自定义音色包 (.wav/.pt/目录/.zip)'),
                    h('input', {
                      placeholder: '音频或音色包路径 (如 ./my-voice.wav 或 ./pack.zip)',
                      value: importForm.sourcePath,
                      onChange: (e) => setImportForm({ ...importForm, sourcePath: e.target.value }),
                      style: {
                        background: '#090d18',
                        color: '#fff',
                        border: '1px solid rgba(148,163,184,0.3)',
                        borderRadius: '6px',
                        padding: '5px 8px',
                        fontSize: '11px',
                      },
                    }),
                    h('input', {
                      placeholder: '音色显示名称 (如 浑厚纪录片男声)',
                      value: importForm.name,
                      onChange: (e) => setImportForm({ ...importForm, name: e.target.value }),
                      style: {
                        background: '#090d18',
                        color: '#fff',
                        border: '1px solid rgba(148,163,184,0.3)',
                        borderRadius: '6px',
                        padding: '5px 8px',
                        fontSize: '11px',
                      },
                    }),
                    h(
                      'div',
                      { style: { display: 'flex', gap: '6px' } },
                      h(
                        'select',
                        {
                          value: importForm.gender,
                          onChange: (e) => setImportForm({ ...importForm, gender: e.target.value }),
                          style: {
                            flex: 1,
                            background: '#090d18',
                            color: '#fff',
                            border: '1px solid rgba(148,163,184,0.3)',
                            borderRadius: '6px',
                            padding: '4px',
                          },
                        },
                        h('option', { value: 'female' }, '女声 (female)'),
                        h('option', { value: 'male' }, '男声 (male)'),
                        h('option', { value: 'neutral' }, '中性 (neutral)'),
                      ),
                      h(
                        'select',
                        {
                          value: importForm.engine,
                          onChange: (e) => setImportForm({ ...importForm, engine: e.target.value }),
                          style: {
                            flex: 1,
                            background: '#090d18',
                            color: '#fff',
                            border: '1px solid rgba(148,163,184,0.3)',
                            borderRadius: '6px',
                            padding: '4px',
                          },
                        },
                        h('option', { value: 'indextts2' }, 'IndexTTS-2'),
                        h('option', { value: 'gptvoice' }, 'GPTvoice-tts'),
                      ),
                    ),
                    h('input', {
                      placeholder: 'AI 匹配风格标签 (逗号分隔，如: 纪录片, 历史, 深沉)',
                      value: importForm.tags,
                      onChange: (e) => setImportForm({ ...importForm, tags: e.target.value }),
                      style: {
                        background: '#090d18',
                        color: '#fff',
                        border: '1px solid rgba(148,163,184,0.3)',
                        borderRadius: '6px',
                        padding: '5px 8px',
                        fontSize: '11px',
                      },
                    }),
                    h('input', {
                      placeholder: '参考音频对应台词 promptText (可选)',
                      value: importForm.promptText,
                      onChange: (e) => setImportForm({ ...importForm, promptText: e.target.value }),
                      style: {
                        background: '#090d18',
                        color: '#fff',
                        border: '1px solid rgba(148,163,184,0.3)',
                        borderRadius: '6px',
                        padding: '5px 8px',
                        fontSize: '11px',
                      },
                    }),
                    h(
                      'button',
                      {
                        type: 'submit',
                        style: {
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px',
                          background: '#7c3aed',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: 'pointer',
                        },
                      },
                      '确认导入至音色库',
                    ),
                  )
                : null,

              // Category Filter + Search Box + Voice Catalog List
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                h('input', {
                  placeholder: `🔍 搜索 ${voiceCatalog.length} 个音色/标签 (如: 纪录片, 短视频, 温柔, 孩童)...`,
                  value: voiceSearchQuery,
                  onChange: (e) => setVoiceSearchQuery(e.target.value),
                  style: {
                    background: '#090d18',
                    color: '#f8fafc',
                    border: '1px solid rgba(56,189,248,0.28)',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '11px',
                  },
                }),
                h(
                  'div',
                  { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
                  ['all', ...Object.keys(groupedVoices)].map((cat) =>
                    h(
                      'button',
                      {
                        key: cat,
                        onClick: () => setVoiceCategoryFilter(cat),
                        style: {
                          border: 'none',
                          borderRadius: '999px',
                          padding: '2px 7px',
                          fontSize: '10px',
                          cursor: 'pointer',
                          background: voiceCategoryFilter === cat ? '#0ea5e9' : 'rgba(30,41,59,0.8)',
                          color: voiceCategoryFilter === cat ? '#fff' : '#94a3b8',
                        },
                      },
                      cat === 'all' ? `全部 (${voiceCatalog.length})` : `${cat} (${groupedVoices[cat]?.length || 0})`,
                    ),
                  ),
                ),
              ),

              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '260px', overflowY: 'auto' } },
                filteredVoices.slice(0, 60).map((v) =>
                  h(
                    'div',
                    {
                      key: v.id,
                      style: {
                        padding: '7px 9px',
                        borderRadius: '8px',
                        background: 'rgba(15,23,42,0.85)',
                        border: '1px solid rgba(148,163,184,0.12)',
                        fontSize: '11px',
                      },
                    },
                    h(
                      'div',
                      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' } },
                      h('span', { style: { fontWeight: 600, color: '#e2e8f0' } }, `[${v.category}] ${v.name}`),
                      h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                        v.available && !String(v.refPath || '').endsWith('.pt')
                          ? h(
                              'button',
                              {
                                onClick: () => handlePreviewVoiceSample(v),
                                style: {
                                  border: '1px solid rgba(56,189,248,0.4)',
                                  background: playingVoiceId === v.id ? '#0ea5e9' : 'transparent',
                                  color: playingVoiceId === v.id ? '#fff' : '#38bdf8',
                                  borderRadius: '4px',
                                  padding: '1px 5px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                },
                              },
                              playingVoiceId === v.id ? '⏹ 停止' : '▶ 试听',
                            )
                          : null,
                        h(
                          'span',
                          { style: { color: v.available ? '#34d399' : '#94a3b8', fontSize: '10px' } },
                          v.durationSec ? `${v.durationSec}s` : v.available ? '●' : '○',
                        ),
                      ),
                    ),
                    h(
                      'div',
                      { style: { color: '#94a3b8', marginTop: '3px', fontSize: '10px' } },
                      `标签: ${(v.tags || []).slice(0, 5).join(' / ')}`,
                    ),
                  ),
                ),
              ),
            ),
          ),

          // ==================== CENTER COLUMN: MULTI-VIEW WORKBENCH (SCRIPT | PREVIEW | MP4) ====================
          h(
            'main',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: '#090d18',
              },
            },
            // Center Top Toolbar
            h(
              'header',
              {
                style: {
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(148,163,184,0.16)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#0b1020',
                  gap: '10px',
                  flexWrap: 'wrap',
                },
              },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
                h('span', { style: { fontWeight: 700, fontSize: '14px' } }, script?.title || '未选择项目'),
                h(
                  'button',
                  {
                    onClick: () => handleRunAction('tts-all'),
                    style: {
                      border: '1px solid rgba(52,211,153,0.4)',
                      background: 'rgba(16,185,129,0.16)',
                      color: '#34d399',
                      borderRadius: '7px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    },
                  },
                  '🔊 批量配音+ffprobe测长',
                ),
                h(
                  'button',
                  {
                    onClick: () => handleRunAction('lint'),
                    style: {
                      border: '1px solid rgba(56,189,248,0.4)',
                      background: 'rgba(14,165,233,0.15)',
                      color: '#38bdf8',
                      borderRadius: '7px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    },
                  },
                  '🔍 规范自检 (Lint)',
                ),
                h(
                  'button',
                  {
                    onClick: () => handleRunAction('snapshot'),
                    style: {
                      border: '1px solid rgba(167,139,250,0.4)',
                      background: 'rgba(139,92,246,0.16)',
                      color: '#c4b5fd',
                      borderRadius: '7px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    },
                  },
                  '📸 3×3 九宫格自检',
                ),
                h(
                  'button',
                  {
                    onClick: () => handleRunAction('render'),
                    style: {
                      border: '1px solid rgba(251,191,36,0.45)',
                      background: 'rgba(245,158,11,0.2)',
                      color: '#fbbf24',
                      borderRadius: '7px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    },
                  },
                  '🎬 导出 MP4',
                ),
              ),

              // Right-Aligned View Switcher `[ 脚本 | 预览 | MP4 ]`
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    background: '#090d18',
                    padding: '3px',
                    borderRadius: '8px',
                    border: '1px solid rgba(148,163,184,0.22)',
                  },
                },
                [
                  { id: 'script', label: '📝 脚本' },
                  { id: 'preview', label: '🖥️ 预览' },
                  { id: 'mp4', label: '🎞️ MP4' },
                ].map((tab) =>
                  h(
                    'button',
                    {
                      key: tab.id,
                      onClick: () => setActiveView(tab.id),
                      style: {
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: activeView === tab.id ? '#0ea5e9' : 'transparent',
                        color: activeView === tab.id ? '#fff' : '#94a3b8',
                      },
                    },
                    tab.label,
                  ),
                ),
              ),
            ),

            // Status / Busy Banner
            h(
              'div',
              {
                style: {
                  padding: '6px 16px',
                  background: busyLabel ? 'rgba(14,165,233,0.2)' : 'rgba(15,23,42,0.8)',
                  borderBottom: '1px solid rgba(148,163,184,0.12)',
                  fontSize: '11px',
                  color: busyLabel ? '#38bdf8' : '#cbd5e1',
                  display: 'flex',
                  justifyContent: 'space-between',
                },
              },
              h('span', null, busyLabel ? `⏳ ${busyLabel}` : statusLog),
              h(
                'span',
                { style: { fontFamily: 'Consolas, monospace', color: '#94a3b8' } },
                `Preset: 视频制作模式 · Session: ${sessionId.slice(0, 14)}`,
              ),
            ),

            // Center View Content
            h(
              'div',
              { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },

              // ---- VIEW 1: SCRIPT VIEW (`script.json` Cards + Voice Selector per Scene) ----
              activeView === 'script'
                ? h(
                    'div',
                    {
                      style: {
                        flex: 1,
                        overflowY: 'auto',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                      },
                    },
                    // Project Meta Summary Card
                    h(
                      'div',
                      {
                        style: {
                          padding: '14px 16px',
                          borderRadius: '12px',
                          background: '#111827',
                          border: '1px solid rgba(56,189,248,0.25)',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: '12px',
                          fontSize: '12px',
                        },
                      },
                      h('div', null, h('div', { style: { color: '#94a3b8' } }, '渲染引擎'), h('strong', null, (script?.engine || 'html').toUpperCase())),
                      h('div', null, h('div', { style: { color: '#94a3b8' } }, '目标受众'), h('strong', null, script?.audience || '通用')),
                      h('div', null, h('div', { style: { color: '#94a3b8' } }, '音色分配模式'), h('strong', { style: { color: '#38bdf8' } }, script?.voiceMode === 'manual' ? '🎯 用户指定' : '🤖 AI 自由匹配')),
                      h('div', null, h('div', { style: { color: '#94a3b8' } }, '总时长 / 总帧数'), h('strong', { style: { fontFamily: 'Consolas, monospace' } }, `${totalSec}s (${totalFrames}f)`)),
                    ),

                    // Scene Cards
                    scenes.map((scene, idx) =>
                      h(
                        'div',
                        {
                          key: scene.id,
                          style: {
                            padding: '14px 16px',
                            borderRadius: '12px',
                            background: '#0f172a',
                            border: '1px solid rgba(148,163,184,0.2)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                          },
                        },
                        h(
                          'div',
                          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } },
                          h(
                            'div',
                            { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                            h(
                              'span',
                              {
                                style: {
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: 'rgba(56,189,248,0.18)',
                                  color: '#38bdf8',
                                  fontFamily: 'Consolas, monospace',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                },
                              },
                              `SCENE 0${idx + 1}`,
                            ),
                            h('strong', { style: { fontSize: '14px' } }, scene.title),
                            h(
                              'span',
                              { style: { fontSize: '11px', color: '#94a3b8', fontFamily: 'Consolas, monospace' } },
                              `[${scene.durationSec}s · ${scene.durationInFrames}f]`,
                            ),
                          ),

                          // Per-Scene Voice Selector + Single Scene TTS Trigger
                          h(
                            'div',
                            { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                            h(
                              'select',
                              {
                                value: scene.voiceId || 'auto',
                                onChange: (e) =>
                                  handleUpdateSceneField(scene.id, {
                                    voiceId: e.target.value,
                                    voiceLocked: e.target.value !== 'auto',
                                    voiceMatchReason:
                                      e.target.value === 'auto'
                                        ? '待 AI 自动匹配'
                                        : `用户手动指定音色: ${e.target.value}`,
                                  }),
                                style: {
                                  background: '#090d18',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56,189,248,0.4)',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                },
                              },
                              h('option', { value: 'auto' }, '🤖 AI 自动匹配音色'),
                              Object.entries(groupedVoices).map(([cat, list]) =>
                                h(
                                  'optgroup',
                                  { key: cat, label: `${cat} (${list.length})` },
                                  list.map((v) =>
                                    h('option', { key: v.id, value: v.id }, `🎙️ [${cat}] ${v.name} (${v.gender})`),
                                  ),
                                ),
                              ),
                            ),
                            h(
                              'button',
                              {
                                onClick: () =>
                                  handleRunAction('tts-scene', {
                                    sceneId: scene.id,
                                    text: scene.narration,
                                    emotion: scene.emotion,
                                    voiceId: scene.voiceId || 'auto',
                                  }),
                                style: {
                                  border: '1px solid rgba(52,211,153,0.45)',
                                  background: 'rgba(16,185,129,0.18)',
                                  color: '#34d399',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                },
                              },
                              '🔊 合成此幕配音',
                            ),
                          ),
                        ),

                        // AI Voice Match Reason
                        scene.voiceMatchReason
                          ? h(
                              'div',
                              { style: { fontSize: '11px', color: '#a78bfa' } },
                              `✨ ${scene.voiceMatchReason}`,
                            )
                          : null,

                        // Editable Narration
                        h('textarea', {
                          rows: 2,
                          value: scene.narration || '',
                          onChange: (e) => handleUpdateSceneField(scene.id, { narration: e.target.value }),
                          style: {
                            width: '100%',
                            background: '#090d18',
                            color: '#f8fafc',
                            border: '1px solid rgba(148,163,184,0.25)',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontFamily: 'Microsoft YaHei, sans-serif',
                          },
                        }),

                        // Sentence Subtitles + Audio Preview
                        h(
                          'div',
                          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } },
                          h(
                            'div',
                            { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                            (scene.subtitles || []).map((sub) =>
                              h(
                                'span',
                                {
                                  key: sub.index,
                                  style: {
                                    fontSize: '10px',
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    background: 'rgba(255,255,255,0.06)',
                                    color: '#cbd5e1',
                                    fontFamily: 'Consolas, monospace',
                                  },
                                },
                                `${sub.startSec}s-${sub.endSec}s: ${sub.text.slice(0, 18)}`,
                              ),
                            ),
                          ),
                          scene.audioFile
                            ? h('audio', {
                                controls: true,
                                src: `/api/video-workbench/asset?projectDir=${encodeURIComponent(activeProjectDir)}&rel=${encodeURIComponent(scene.audioFile)}&v=${assetVersion}`,
                                style: { height: '26px' },
                              })
                            : null,
                        ),
                      ),
                    ),
                  )
                : null,

              // ---- VIEW 2: PREVIEW VIEW (HTML iframe / Remotion Stage + 3-Track Timeline) ----
              activeView === 'preview'
                ? h(
                    'div',
                    { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
                    // Upper Stage Canvas
                    h(
                      'div',
                      {
                        style: {
                          flex: 1,
                          position: 'relative',
                          background: '#050811',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '12px',
                          overflow: 'hidden',
                        },
                      },
                      previewHtmlUrl
                        ? h('iframe', {
                            ref: iframeRef,
                            src: previewHtmlUrl,
                            title: 'DSH Video Stage Preview',
                            onLoad: () => seekToFrame(currentFrame),
                            style: {
                              width: '100%',
                              height: '100%',
                              border: '1px solid rgba(56,189,248,0.28)',
                              borderRadius: '12px',
                              background: '#0b1020',
                            },
                          })
                        : h('div', null, '加载预览画布中...'),
                    ),

                    // Transport Control Bar
                    h(
                      'div',
                      {
                        style: {
                          padding: '6px 14px',
                          background: '#0b1020',
                          borderTop: '1px solid rgba(148,163,184,0.16)',
                          borderBottom: '1px solid rgba(148,163,184,0.16)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '12px',
                        },
                      },
                      h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                        h(
                          'button',
                          {
                            onClick: () => setIsPlaying((p) => !p),
                            style: {
                              border: 'none',
                              borderRadius: '6px',
                              padding: '4px 12px',
                              background: isPlaying ? '#ef4444' : '#0ea5e9',
                              color: '#fff',
                              fontWeight: 600,
                              cursor: 'pointer',
                            },
                          },
                          isPlaying ? '⏸ 暂停' : '▶ 播放',
                        ),
                        h(
                          'button',
                          {
                            onClick: () => {
                              setIsPlaying(false)
                              seekToFrame(currentFrame - 1)
                            },
                            style: {
                              border: '1px solid rgba(148,163,184,0.3)',
                              background: 'transparent',
                              color: '#cbd5e1',
                              borderRadius: '6px',
                              padding: '3px 8px',
                              cursor: 'pointer',
                            },
                          },
                          '-1 帧',
                        ),
                        h(
                          'button',
                          {
                            onClick: () => {
                              setIsPlaying(false)
                              seekToFrame(currentFrame + 1)
                            },
                            style: {
                              border: '1px solid rgba(148,163,184,0.3)',
                              background: 'transparent',
                              color: '#cbd5e1',
                              borderRadius: '6px',
                              padding: '3px 8px',
                              cursor: 'pointer',
                            },
                          },
                          '+1 帧',
                        ),
                      ),
                      h(
                        'span',
                        { style: { fontFamily: 'Consolas, monospace', color: '#38bdf8' } },
                        `TIME ${(currentFrame / fps).toFixed(2)}s / ${totalSec}s · FRAME ${currentFrame} / ${totalFrames}`,
                      ),
                    ),

                    // Bottom 3-Track Synchronized Timeline (字幕轨 / 分镜轨 / 音频波形轨)
                    h(
                      'div',
                      {
                        style: {
                          height: '148px',
                          background: '#080c17',
                          padding: '8px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          position: 'relative',
                          userSelect: 'none',
                        },
                        onClick: (e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - 70) / Math.max(1, rect.width - 84)))
                          seekToFrame(Math.floor(ratio * totalFrames))
                        },
                      },
                      // Playhead vertical line
                      h('div', {
                        style: {
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `calc(70px + (100% - 84px) * ${(currentFrame / totalFrames).toFixed(4)})`,
                          width: '2px',
                          background: '#f43f5e',
                          zIndex: 10,
                          pointerEvents: 'none',
                        },
                      }),

                      // Track 1: 字幕轨 (Subtitle Track)
                      h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', height: '34px', gap: '8px' } },
                        h('span', { style: { width: '62px', fontSize: '11px', color: '#94a3b8', flexShrink: 0 } }, '💬 字幕轨'),
                        h(
                          'div',
                          {
                            style: {
                              flex: 1,
                              height: '100%',
                              background: 'rgba(15,23,42,0.9)',
                              borderRadius: '6px',
                              display: 'flex',
                              overflow: 'hidden',
                              border: '1px solid rgba(148,163,184,0.14)',
                            },
                          },
                          scenes.map((s) =>
                            (s.subtitles || []).map((sub, sIdx) => {
                              const subFrames = Math.max(1, (sub.endFrame || 30) - (sub.startFrame || 0))
                              return h(
                                'div',
                                {
                                  key: `${s.id}-sub-${sIdx}`,
                                  title: sub.text,
                                  style: {
                                    flexGrow: subFrames,
                                    flexBasis: 0,
                                    padding: '4px 6px',
                                    fontSize: '10px',
                                    color: '#e2e8f0',
                                    borderRight: '1px solid rgba(56,189,248,0.2)',
                                    background: 'rgba(14,165,233,0.12)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  },
                                },
                                sub.text,
                              )
                            }),
                          ),
                        ),
                      ),

                      // Track 2: 分镜轨 (Scene Track)
                      h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', height: '38px', gap: '8px' } },
                        h('span', { style: { width: '62px', fontSize: '11px', color: '#94a3b8', flexShrink: 0 } }, '🎬 分镜轨'),
                        h(
                          'div',
                          {
                            style: {
                              flex: 1,
                              height: '100%',
                              background: 'rgba(15,23,42,0.9)',
                              borderRadius: '6px',
                              display: 'flex',
                              overflow: 'hidden',
                              border: '1px solid rgba(148,163,184,0.14)',
                            },
                          },
                          scenes.map((s, idx) =>
                            h(
                              'div',
                              {
                                key: s.id,
                                style: {
                                  flexGrow: Math.max(1, s.durationInFrames || 90),
                                  flexBasis: 0,
                                  padding: '5px 8px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: '#f8fafc',
                                  background:
                                    idx % 2 === 0
                                      ? 'linear-gradient(90deg, rgba(37,99,235,0.35), rgba(79,70,229,0.35))'
                                      : 'linear-gradient(90deg, rgba(14,165,233,0.35), rgba(6,182,212,0.35))',
                                  borderRight: '1px solid rgba(255,255,255,0.15)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                },
                              },
                              `${s.id}: ${s.title} (${s.durationInFrames}f)`,
                            ),
                          ),
                        ),
                      ),

                      // Track 3: 音频波形轨 (Audio Waveform & Voice Track)
                      h(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', height: '38px', gap: '8px' } },
                        h('span', { style: { width: '62px', fontSize: '11px', color: '#94a3b8', flexShrink: 0 } }, '🔊 波形轨'),
                        h(
                          'div',
                          {
                            style: {
                              flex: 1,
                              height: '100%',
                              background: 'rgba(15,23,42,0.9)',
                              borderRadius: '6px',
                              display: 'flex',
                              overflow: 'hidden',
                              border: '1px solid rgba(148,163,184,0.14)',
                            },
                          },
                          scenes.map((s) =>
                            h(
                              'div',
                              {
                                key: `${s.id}-wave`,
                                style: {
                                  flexGrow: Math.max(1, s.durationInFrames || 90),
                                  flexBasis: 0,
                                  padding: '4px 8px',
                                  fontSize: '10px',
                                  color: s.audioFile ? '#34d399' : '#94a3b8',
                                  background: s.audioFile
                                    ? 'repeating-linear-gradient(90deg, rgba(16,185,129,0.22) 0px, rgba(16,185,129,0.22) 3px, rgba(15,23,42,0.4) 3px, rgba(15,23,42,0.4) 6px)'
                                    : 'rgba(30,41,59,0.5)',
                                  borderRight: '1px solid rgba(52,211,153,0.25)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                },
                              },
                              h('span', null, `🎙️ ${s.voiceName || s.voiceId || 'AI Auto'}`),
                              h('span', { style: { fontFamily: 'Consolas, monospace' } }, `${s.durationSec}s`),
                            ),
                          ),
                        ),
                      ),
                    ),
                  )
                : null,

              // ---- VIEW 3: MP4 & 3x3 CONTACT SHEET VIEW ----
              activeView === 'mp4'
                ? h(
                    'div',
                    {
                      style: {
                        flex: 1,
                        overflowY: 'auto',
                        padding: '16px',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '16px',
                      },
                    },
                    // Left Card: Rendered MP4 Player
                    h(
                      'div',
                      {
                        style: {
                          padding: '14px',
                          borderRadius: '12px',
                          background: '#0f172a',
                          border: '1px solid rgba(148,163,184,0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        },
                      },
                      h('strong', { style: { fontSize: '13px', color: '#fbbf24' } }, '🎞️ 成品视频播放器 (output/final.mp4)'),
                      hasMp4
                        ? h('video', {
                            controls: true,
                            src: mp4VideoUrl,
                            style: { width: '100%', borderRadius: '8px', background: '#000' },
                          })
                        : h(
                            'div',
                            { style: { padding: '40px 20px', textAlign: 'center', color: '#94a3b8' } },
                            '尚未生成 MP4，请点击上方「🎬 导出 MP4」按钮或在右栏指令 AI 渲染。',
                          ),
                    ),

                    // Right Card: 3x3 Contact Sheet QA Image
                    h(
                      'div',
                      {
                        style: {
                          padding: '14px',
                          borderRadius: '12px',
                          background: '#0f172a',
                          border: '1px solid rgba(148,163,184,0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        },
                      },
                      h('strong', { style: { fontSize: '13px', color: '#c4b5fd' } }, '📸 3×3 九宫格多模态视觉自检图 (snapshot-3x3.png)'),
                      hasSnapshot
                        ? h('img', {
                            src: snapshotImgUrl,
                            alt: '3x3 Contact Sheet QA',
                            style: { width: '100%', borderRadius: '8px', border: '1px solid rgba(167,139,250,0.3)' },
                          })
                        : h(
                            'div',
                            { style: { padding: '40px 20px', textAlign: 'center', color: '#94a3b8' } },
                            '尚未生成九宫格自检图，请点击上方「📸 3×3 九宫格自检」按钮。',
                          ),
                    ),
                  )
                : null,
            ),
          ),

          // ==================== RIGHT COLUMN: NATIVE AGENT STREAM & WORKFLOW CO-PILOT ====================
          splitChat
            ? h(
                'aside',
                {
                  style: {
                    borderLeft: '1px solid rgba(148,163,184,0.16)',
                    background: '#0b1020',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '14px',
                    gap: '12px',
                    overflowY: 'auto',
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  h('span', { style: { fontWeight: 700, fontSize: '13px', color: '#38bdf8' } }, '🤖 视频制作模式 Agent 协同栏'),
                  h(
                    'button',
                    {
                      onClick: () => switchWorkbenchMode('dsh'),
                      style: {
                        border: '1px solid rgba(56,189,248,0.35)',
                        background: 'transparent',
                        color: '#38bdf8',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      },
                    },
                    '展开全屏对话',
                  ),
                ),

                h(
                  'div',
                  {
                    style: {
                      padding: '10px',
                      borderRadius: '10px',
                      background: 'rgba(15,23,42,0.9)',
                      border: '1px solid rgba(56,189,248,0.22)',
                      fontSize: '11px',
                      lineHeight: 1.5,
                      color: '#cbd5e1',
                    },
                  },
                  h('div', { style: { fontWeight: 700, color: '#f8fafc', marginBottom: '4px' } }, '🔗 实时会话流已绑定'),
                  h('div', null, `当前项目: ${script?.title || ''}`),
                  h('div', null, `绑定 Preset: 视频制作模式 (video-maker)`),
                  h('div', null, `已加载音色数: ${voiceCatalog.length} 个`),
                ),

                // Three-Stage Quick Prompt Buttons
                h('div', { style: { fontWeight: 700, fontSize: '12px', color: '#e2e8f0' } }, '⚡ 三阶段确认流快捷指令：'),
                [
                  {
                    title: '阶段 1：编写分镜脚本 + AI 匹配音色',
                    prompt: `请读取项目 ${activeProjectDir} 的 script.json，优化分镜台词，并调用 match_scene_voices 自动为各分镜匹配最合适的音色后向我汇报。`,
                  },
                  {
                    title: '阶段 2：配音测算帧数 + 3×3 九宫格自检',
                    prompt: `请对项目 ${activeProjectDir} 逐幕调用 generate_speech 合成配音并回填 ffprobe 精确帧数，再调用 video_lint、video_snapshot 与 read_image 完成 3×3 九宫格多模态视觉自检。`,
                  },
                  {
                    title: '阶段 3：混音编码导出成品 MP4',
                    prompt: `请调用 video_render 将项目 ${activeProjectDir} 渲染导出为高清 H.264 MP4 视频。`,
                  },
                ].map((item, idx) =>
                  h(
                    'button',
                    {
                      key: idx,
                      onClick: () => {
                        sendPromptToNativeAgent(item.prompt)
                        switchWorkbenchMode('dsh')
                      },
                      style: {
                        textAlign: 'left',
                        padding: '9px 11px',
                        borderRadius: '8px',
                        background: 'rgba(30,41,59,0.75)',
                        border: '1px solid rgba(148,163,184,0.2)',
                        color: '#f8fafc',
                        fontSize: '11px',
                        cursor: 'pointer',
                      },
                    },
                    h('div', { style: { fontWeight: 600, color: '#38bdf8' } }, item.title),
                    h('div', { style: { color: '#94a3b8', marginTop: '3px', fontSize: '10px' } }, '点击填入 Agent 对话框并执行 →'),
                  ),
                ),

                // Lint Report Summary if available
                lintReport
                  ? h(
                      'div',
                      {
                        style: {
                          padding: '10px',
                          borderRadius: '10px',
                          background: lintReport.ok ? 'rgba(6,78,59,0.35)' : 'rgba(127,29,29,0.35)',
                          border: `1px solid ${lintReport.ok ? '#34d399' : '#f87171'}`,
                          fontSize: '11px',
                        },
                      },
                      h('strong', null, `🔍 video_lint 报告 (${lintReport.ok ? '通过' : '需修复'})`),
                      (lintReport.checks || []).map((c, i) =>
                        h(
                          'div',
                          { key: i, style: { marginTop: '4px', color: c.passed ? '#a7f3d0' : '#fecaca' } },
                          `${c.passed ? '✓' : '✗'} ${c.name}: ${c.value}`,
                        ),
                      ),
                    )
                  : null,
              )
            : null,
        ),
      )
    }

    return {
      name: 'dsh-web-video-workbench-client',
      inject: ['slots', 'connection'],
      apply(ctx) {
        // 1. Top-Bar Capsule Switcher & Overlay Workbench (`shell.overlay`)
        ctx.slots.register('shell.overlay', {
          id: 'video-workbench-topbar-capsule',
          order: 80,
          render: () => h(PanelBoundary, null, h(VideoWorkbenchApp, { ctx, isMainSlot: false })),
        })

        // 2. Sidebar Entry (`sidebar.panellist`) & Main View (`main`)
        ctx.slots.register('sidebar.panellist', {
          key: 'video-workbench',
          label: 'HTML 视频工作台',
          order: 35,
          render: () => h(SidebarVideoIcon),
        })

        ctx.slots.register('main', {
          key: 'video-workbench',
          render: () => h(PanelBoundary, null, h(VideoWorkbenchApp, { ctx, isMainSlot: true })),
        })

        // 3. Native Agent Conversation Tool Call View (`tool.call.toolview`)
        ctx.slots.register('tool.call.toolview', {
          id: 'video-workbench-toolview',
          order: 25,
          render: (props) => h(PanelBoundary, null, h(VideoToolCallCard, props)),
        })
      },
    }
  },
})
