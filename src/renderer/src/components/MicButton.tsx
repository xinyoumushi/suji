import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { appendTranscript, isSpeechSupported, startSpeech, stopActiveSpeech, type SpeechSession } from '../lib/speech'

interface MicButtonProps {
  /** 当前输入框的值，用于把识别结果接在后面 */
  value: string
  /** 拿到拼接后的完整新值 */
  onChange: (next: string) => void
  disabled?: boolean
}

export default function MicButton({ value, onChange, disabled }: MicButtonProps): JSX.Element {
  const { actions } = useStore()
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const sessionRef = useRef<SpeechSession | null>(null)

  // 用 ref 保存最新的值和处理函数，避免长时间听写时用到旧闭包
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const supported = isSpeechSupported()

  useEffect(() => {
    return () => {
      sessionRef.current?.stop()
      sessionRef.current = null
    }
  }, [])

  const stop = (): void => {
    sessionRef.current?.stop()
    sessionRef.current = null
    setListening(false)
    setInterim('')
  }

  const toggle = (): void => {
    if (listening) {
      stop()
      return
    }
    if (!supported) {
      actions.notify('这个浏览器不支持语音输入，可以用 Win + H 调出系统听写', 'error')
      return
    }
    stopActiveSpeech()
    setInterim('')
    const session = startSpeech({
      onFinal: (text) => {
        const next = appendTranscript(valueRef.current, text)
        if (next === valueRef.current) return
        valueRef.current = next
        onChangeRef.current(next)
      },
      onInterim: setInterim,
      onListening: setListening,
      onError: (message) => {
        actions.notify(message, 'error')
        setListening(false)
        setInterim('')
      }
    })
    sessionRef.current = session
    if (!session) setListening(false)
  }

  return (
    <span className="mic-wrap">
      <button
        type="button"
        className={listening ? 'mic-btn on' : 'mic-btn'}
        onClick={toggle}
        disabled={disabled}
        title={
          supported
            ? listening
              ? '点击停止语音输入'
              : '点击开始语音输入（说完停顿片刻会自动上屏，可连续说多句）'
            : '当前环境不支持语音输入，可用 Win + H 系统听写'
        }
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
        </svg>
        {listening && <span className="mic-dot" />}
      </button>
      {listening && <span className="mic-interim">{interim || '聆听中…'}</span>}
    </span>
  )
}
