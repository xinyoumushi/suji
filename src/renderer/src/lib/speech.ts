/**
 * 语音转文字：封装浏览器 SpeechRecognition（Edge / Chrome 内置）。
 * 识别由浏览器的语音服务完成，需要联网；不联网时会返回 network 错误。
 */

type AnyRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
}

type SpeechCtor = new () => AnyRecognition

function getCtor(): SpeechCtor | null {
  const scope = window as unknown as {
    SpeechRecognition?: SpeechCtor
    webkitSpeechRecognition?: SpeechCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

export function isSpeechSupported(): boolean {
  return !!getCtor()
}

export interface SpeechSession {
  stop: () => void
}

export interface SpeechHandlers {
  onFinal: (text: string) => void
  onInterim: (text: string) => void
  onListening: (listening: boolean) => void
  onError: (message: string) => void
}

let activeStop: (() => void) | null = null

export function stopActiveSpeech(): void {
  activeStop?.()
  activeStop = null
}

export function startSpeech(handlers: SpeechHandlers): SpeechSession | null {
  const Ctor = getCtor()
  if (!Ctor) {
    handlers.onError('当前环境不支持语音识别')
    return null
  }

  // 同一时间只允许一个麦克风在录音
  stopActiveSpeech()

  const recognition = new Ctor()
  recognition.lang = 'zh-CN'
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  let stopped = false
  let restarts = 0
  let lastFinal = ''
  let lastFinalAt = 0

  const finish = (): void => {
    stopped = true
    if (activeStop === stop) activeStop = null
    handlers.onListening(false)
    handlers.onInterim('')
  }

  const stop = (): void => {
    finish()
    try {
      recognition.stop()
    } catch {
      /* 已经停了 */
    }
  }

  recognition.onstart = () => {
    handlers.onListening(true)
  }

  recognition.onresult = (event: any) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      const text = String(result?.[0]?.transcript ?? '')
      if (result.isFinal) {
        const clean = text.trim()
        if (!clean) continue
        // 某些版本会把同一句 final 结果重复推送，这里做一次去重
        const now = Date.now()
        if (clean === lastFinal && now - lastFinalAt < 1200) continue
        lastFinal = clean
        lastFinalAt = now
        handlers.onFinal(clean)
      } else {
        interim += text
      }
    }
    handlers.onInterim(interim.trim())
  }

  recognition.onerror = (event: any) => {
    const code = String(event?.error ?? 'unknown')
    if (code === 'no-speech' || code === 'aborted') return
    handlers.onError(messageFor(code))
    if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
      finish()
    }
  }

  recognition.onend = () => {
    if (stopped) {
      handlers.onListening(false)
      return
    }
    // 浏览器会在停顿后自动结束，这里续上，实现「连续听写」
    restarts += 1
    if (restarts > 300) {
      stop()
      return
    }
    try {
      recognition.start()
    } catch {
      finish()
    }
  }

  try {
    recognition.start()
  } catch {
    handlers.onError('无法启动语音识别，请稍后重试')
    return null
  }

  activeStop = stop
  return { stop }
}

function messageFor(code: string): string {
  switch (code) {
    case 'not-allowed':
      return '麦克风权限被拒绝，请在浏览器地址栏的权限设置里允许使用麦克风'
    case 'service-not-allowed':
      return '系统禁止了语音识别服务'
    case 'audio-capture':
      return '没有检测到麦克风'
    case 'network':
      return '语音识别服务连不上，需要联网；也可以试试按 Win+H 用系统听写'
    case 'language-not-supported':
      return '当前识别服务不支持中文'
    default:
      return `语音识别出错（${code}）`
  }
}

/** 把新识别出的文字接到已有内容后面，中英文混排时按需补空格 */
export function appendTranscript(previous: string, text: string): string {
  const clean = text.trim()
  if (!clean) return previous
  if (!previous) return clean
  const last = previous.slice(-1)
  if (/\s/.test(last)) return previous + clean
  if (/[A-Za-z0-9,.!?;:)'"\]}]/.test(last)) return `${previous} ${clean}`
  return previous + clean
}
