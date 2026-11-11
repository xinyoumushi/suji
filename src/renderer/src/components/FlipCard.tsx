import RichText from './RichText'

interface FlipCardProps {
  front: string
  back: string
  flipped: boolean
  onFlip: () => void
  size?: 'normal' | 'large'
}

export default function FlipCard({ front, back, flipped, onFlip, size = 'normal' }: FlipCardProps): JSX.Element {
  return (
    <div className={`flip ${size}`} onClick={onFlip} role="button" tabIndex={0} onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onFlip()
      }
    }}>
      <div className={flipped ? 'flip-inner is-flipped' : 'flip-inner'}>
        <div className="flip-face flip-front">
          <span className="face-tag">正面 · 题干</span>
          <div className="face-body">
            {front ? <RichText text={front} /> : '（还没有填写题干）'}
          </div>
          <span className="face-hint">点击或空格翻面</span>
        </div>
        <div className="flip-face flip-back">
          <span className="face-tag">背面 · 答案</span>
          <div className="face-body">
            {back ? <RichText text={back} /> : '（还没有填写答案）'}
          </div>
          <span className="face-hint">点击翻回正面</span>
        </div>
      </div>
    </div>
  )
}
