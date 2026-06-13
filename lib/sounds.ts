export const SoundEngine = {
  ctx: null as AudioContext | null,

  init() {
    if (!this.ctx) this.ctx = new AudioContext()
  },

  playLaunch() {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(80, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  },

  playImpact() {
    const ctx = this.ctx
    if (!ctx) return
    // Low-frequency thud
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.4)
    gain.gain.setValueAtTime(0.8, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
    // High crack
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.type = 'sawtooth'
    osc2.frequency.setValueAtTime(300, ctx.currentTime)
    osc2.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2)
    gain2.gain.setValueAtTime(0.4, ctx.currentTime)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc2.start()
    osc2.stop(ctx.currentTime + 0.2)
  },

  playAlert() {
    const ctx = this.ctx
    if (!ctx) return
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 880
      const start = ctx.currentTime + i * 0.4
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.3, start + 0.05)
      gain.gain.linearRampToValueAtTime(0, start + 0.3)
      osc.start(start)
      osc.stop(start + 0.3)
    }
  },

  playNukeLaunch() {
    const ctx = this.ctx
    if (!ctx) return
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()
    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)
    osc1.type = 'sine'
    osc2.type = 'sawtooth'
    osc1.frequency.setValueAtTime(60, ctx.currentTime)
    osc1.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 1.0)
    osc2.frequency.setValueAtTime(120, ctx.currentTime)
    osc2.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 1.0)
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0)
    osc1.start(); osc1.stop(ctx.currentTime + 1.0)
    osc2.start(); osc2.stop(ctx.currentTime + 1.0)
  },

  playIntercept() {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'square'
    osc.frequency.setValueAtTime(600, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1)
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(); osc.stop(ctx.currentTime + 0.3)
  },

  playAlliance() {
    const ctx = this.ctx
    if (!ctx) return
    const freqs = [523, 659, 784]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.12
      gain.gain.setValueAtTime(0.2, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3)
      osc.start(start); osc.stop(start + 0.3)
    })
  },
}
