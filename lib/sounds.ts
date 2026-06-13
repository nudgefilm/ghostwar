export const SoundEngine = {
  ctx: null as AudioContext | null,
  _buffers: {} as Record<string, AudioBuffer>,

  init() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this._preload(['launch', 'impact'])
    }
  },

  async _preload(names: string[]) {
    for (const name of names) {
      this._loadBuffer(name)
    }
  },

  async _loadBuffer(name: string): Promise<AudioBuffer | null> {
    if (this._buffers[name]) return this._buffers[name]
    const ctx = this.ctx!
    try {
      const res = await fetch(`/sounds/${name}.wav`)
      const ab = await res.arrayBuffer()
      const buf = await ctx.decodeAudioData(ab)
      this._buffers[name] = buf
      return buf
    } catch {
      return null
    }
  },

  _playBuffer(name: string, volume = 1.0, playbackRate = 1.0) {
    const buf = this._buffers[name]
    if (!buf || !this.ctx) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = playbackRate
    const gain = ctx.createGain()
    gain.gain.value = volume
    src.connect(gain)
    gain.connect(ctx.destination)
    src.start()
  },

  playLaunch() {
    const ctx = this.ctx!
    if (this._buffers['launch']) {
      this._playBuffer('launch', 1.0)
      return
    }
    // Fallback: synthesized
    const t = ctx.currentTime
    const crackSize = Math.floor(ctx.sampleRate * 0.08)
    const crackBuf = ctx.createBuffer(1, crackSize, ctx.sampleRate)
    const crackData = crackBuf.getChannelData(0)
    for (let i = 0; i < crackSize; i++) {
      crackData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackSize, 0.4)
    }
    const crackSrc = ctx.createBufferSource()
    crackSrc.buffer = crackBuf
    const crackGain = ctx.createGain()
    crackGain.gain.setValueAtTime(1.8, t)
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
    crackSrc.connect(crackGain); crackGain.connect(ctx.destination)
    crackSrc.start(t)
    const roarSize = ctx.sampleRate * 2
    const roarBuf = ctx.createBuffer(1, roarSize, ctx.sampleRate)
    const roarData = roarBuf.getChannelData(0)
    for (let i = 0; i < roarSize; i++) roarData[i] = Math.random() * 2 - 1
    const roarSrc = ctx.createBufferSource()
    roarSrc.buffer = roarBuf
    const roarFilter = ctx.createBiquadFilter()
    roarFilter.type = 'bandpass'
    roarFilter.frequency.setValueAtTime(120, t)
    roarFilter.frequency.exponentialRampToValueAtTime(2200, t + 2.0)
    roarFilter.Q.value = 1.2
    const roarGain = ctx.createGain()
    roarGain.gain.setValueAtTime(0, t)
    roarGain.gain.linearRampToValueAtTime(1.3, t + 0.18)
    roarGain.gain.setValueAtTime(1.3, t + 1.6)
    roarGain.gain.exponentialRampToValueAtTime(0.001, t + 2.0)
    roarSrc.connect(roarFilter); roarFilter.connect(roarGain); roarGain.connect(ctx.destination)
    roarSrc.start(t)
    const rumble = ctx.createOscillator()
    const rumbleGain = ctx.createGain()
    rumble.type = 'sine'
    rumble.frequency.setValueAtTime(55, t)
    rumble.frequency.exponentialRampToValueAtTime(28, t + 2.0)
    rumbleGain.gain.setValueAtTime(0.55, t + 0.15)
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 2.0)
    rumble.connect(rumbleGain); rumbleGain.connect(ctx.destination)
    rumble.start(t); rumble.stop(t + 2.0)
  },

  playImpact() {
    const ctx = this.ctx
    if (!ctx) return
    if (this._buffers['impact']) {
      this._playBuffer('impact', 1.0)
      return
    }
    // Fallback: synthesized
    const t = ctx.currentTime
    const crackSize = Math.floor(ctx.sampleRate * 0.05)
    const crackBuf = ctx.createBuffer(1, crackSize, ctx.sampleRate)
    const crackData = crackBuf.getChannelData(0)
    for (let i = 0; i < crackSize; i++) {
      crackData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackSize, 0.5)
    }
    const crackSrc = ctx.createBufferSource()
    crackSrc.buffer = crackBuf
    const crackGain = ctx.createGain()
    crackGain.gain.setValueAtTime(2.2, t)
    crackSrc.connect(crackGain); crackGain.connect(ctx.destination)
    crackSrc.start(t)
    const boom = ctx.createOscillator()
    const boomGain = ctx.createGain()
    boom.type = 'sine'
    boom.frequency.setValueAtTime(85, t)
    boom.frequency.exponentialRampToValueAtTime(18, t + 2.5)
    boomGain.gain.setValueAtTime(1.6, t)
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5)
    boom.connect(boomGain); boomGain.connect(ctx.destination)
    boom.start(t); boom.stop(t + 2.5)
    const rumbleSize = ctx.sampleRate * 3
    const rumbleBuf = ctx.createBuffer(1, rumbleSize, ctx.sampleRate)
    const rumbleData = rumbleBuf.getChannelData(0)
    for (let i = 0; i < rumbleSize; i++) rumbleData[i] = Math.random() * 2 - 1
    const rumbleSrc = ctx.createBufferSource()
    rumbleSrc.buffer = rumbleBuf
    const rumbleFilter = ctx.createBiquadFilter()
    rumbleFilter.type = 'lowpass'
    rumbleFilter.frequency.value = 220
    const rumbleGain = ctx.createGain()
    rumbleGain.gain.setValueAtTime(0.9, t)
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 3.0)
    rumbleSrc.connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(ctx.destination)
    rumbleSrc.start(t)
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
    if (this._buffers['launch']) {
      // Nuke: same file, slightly slower pitch for heavier feel
      this._playBuffer('launch', 1.2, 0.85)
      return
    }
    // Fallback: synthesized
    const t = ctx.currentTime
    const crackSize = Math.floor(ctx.sampleRate * 0.15)
    const crackBuf = ctx.createBuffer(1, crackSize, ctx.sampleRate)
    const crackData = crackBuf.getChannelData(0)
    for (let i = 0; i < crackSize; i++) {
      crackData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackSize, 0.3)
    }
    const crackSrc = ctx.createBufferSource()
    crackSrc.buffer = crackBuf
    const crackGain = ctx.createGain()
    crackGain.gain.setValueAtTime(2.5, t)
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
    crackSrc.connect(crackGain); crackGain.connect(ctx.destination)
    crackSrc.start(t)
    const roarSize = ctx.sampleRate * 3
    const roarBuf = ctx.createBuffer(1, roarSize, ctx.sampleRate)
    const roarData = roarBuf.getChannelData(0)
    for (let i = 0; i < roarSize; i++) roarData[i] = Math.random() * 2 - 1
    const roarSrc = ctx.createBufferSource()
    roarSrc.buffer = roarBuf
    const roarFilter = ctx.createBiquadFilter()
    roarFilter.type = 'bandpass'
    roarFilter.frequency.setValueAtTime(80, t)
    roarFilter.frequency.exponentialRampToValueAtTime(3000, t + 3.0)
    roarFilter.Q.value = 0.8
    const roarGain = ctx.createGain()
    roarGain.gain.setValueAtTime(0, t)
    roarGain.gain.linearRampToValueAtTime(1.8, t + 0.2)
    roarGain.gain.setValueAtTime(1.8, t + 2.2)
    roarGain.gain.exponentialRampToValueAtTime(0.001, t + 3.0)
    roarSrc.connect(roarFilter); roarFilter.connect(roarGain); roarGain.connect(ctx.destination)
    roarSrc.start(t)
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(45, t)
    osc.frequency.exponentialRampToValueAtTime(20, t + 3.0)
    oscGain.gain.setValueAtTime(0.8, t + 0.2)
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 3.0)
    osc.connect(oscGain); oscGain.connect(ctx.destination)
    osc.start(t); osc.stop(t + 3.0)
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
