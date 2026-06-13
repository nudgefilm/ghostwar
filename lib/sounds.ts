export const SoundEngine = {
  ctx: null as AudioContext | null,

  init() {
    if (!this.ctx) this.ctx = new AudioContext()
  },

  playLaunch() {
    const ctx = this.ctx!
    const t = ctx.currentTime

    // Ignition crack: short broadband burst
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

    // Rising roar: noise through sweeping bandpass
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

    // Sub-bass rumble
    const rumble = ctx.createOscillator()
    const rumbleGain = ctx.createGain()
    rumble.type = 'sine'
    rumble.frequency.setValueAtTime(55, t)
    rumble.frequency.exponentialRampToValueAtTime(28, t + 2.0)
    rumbleGain.gain.setValueAtTime(0, t)
    rumbleGain.gain.linearRampToValueAtTime(0.55, t + 0.15)
    rumbleGain.gain.setValueAtTime(0.55, t + 1.6)
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 2.0)
    rumble.connect(rumbleGain); rumbleGain.connect(ctx.destination)
    rumble.start(t); rumble.stop(t + 2.0)
  },

  playFlight(flightMs: number) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const dur = Math.max(1.5, flightMs / 1000)

    // Looping rocket whoosh — 4s buffer looped for full flight duration
    const bufSize = ctx.sampleRate * 4
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 620
    filter.Q.value = 1.8

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.28, t + 0.5)
    gain.gain.setValueAtTime(0.28, t + dur - 0.8)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)

    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
    src.start(t)
    src.stop(t + dur)
  },

  playImpact() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime

    // Initial crack: ultra-short broadband burst
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

    // Deep boom: sub-bass sine sweep
    const boom = ctx.createOscillator()
    const boomGain = ctx.createGain()
    boom.type = 'sine'
    boom.frequency.setValueAtTime(85, t)
    boom.frequency.exponentialRampToValueAtTime(18, t + 2.5)
    boomGain.gain.setValueAtTime(1.6, t)
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5)
    boom.connect(boomGain); boomGain.connect(ctx.destination)
    boom.start(t); boom.stop(t + 2.5)

    // Long rumble tail: lowpass noise
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

    // Mid-range debris crackle
    const midSize = Math.floor(ctx.sampleRate * 0.35)
    const midBuf = ctx.createBuffer(1, midSize, ctx.sampleRate)
    const midData = midBuf.getChannelData(0)
    for (let i = 0; i < midSize; i++) {
      midData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / midSize, 1.2)
    }
    const midSrc = ctx.createBufferSource()
    midSrc.buffer = midBuf
    const midFilter = ctx.createBiquadFilter()
    midFilter.type = 'bandpass'
    midFilter.frequency.value = 850
    midFilter.Q.value = 0.7
    const midGain = ctx.createGain()
    midGain.gain.setValueAtTime(1.1, t)
    midGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    midSrc.connect(midFilter); midFilter.connect(midGain); midGain.connect(ctx.destination)
    midSrc.start(t)
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
    const t = ctx.currentTime

    // Heavy ignition: longer, louder crack
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

    // Massive rising roar
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

    // Deep sub-bass
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(45, t)
    osc.frequency.exponentialRampToValueAtTime(20, t + 3.0)
    oscGain.gain.setValueAtTime(0, t)
    oscGain.gain.linearRampToValueAtTime(0.8, t + 0.2)
    oscGain.gain.setValueAtTime(0.8, t + 2.2)
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
