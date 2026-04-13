import * as THREE from "three";

export type AudioProfile = {
  ambient: {
    traffic: number;
    nature: number;
    urban: number;
    transit: number;
  };
  point_sources: Array<{
    type: string;
    position: [number, number, number];
    radius_m: number;
  }>;
};

export class AudioManager {
  private listener: THREE.AudioListener;
  private ambientSounds: Map<string, THREE.Audio> = new Map();
  private positionalSounds: THREE.PositionalAudio[] = [];
  private isPlaying = false;
  private masterVolume = 0.5;
  private scene: THREE.Scene;

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.scene = scene;
  }

  setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.ambientSounds.forEach((sound) => {
      sound.setVolume(this._computeVolume(sound.userData.baseVolume));
    });
    this.positionalSounds.forEach((sound) => {
      sound.setVolume(this._computeVolume(sound.userData.baseVolume));
    });
  }

  private _computeVolume(base: number): number {
    return base * this.masterVolume;
  }

  applyProfile(profile: AudioProfile) {
    this.stop();
    this._clearAmbient();
    this._clearPositional();

    const ctx = this.listener.context;

    // Traffic: filtered pink noise (low rumble)
    if (profile.ambient.traffic > 0) {
      const traffic = this._createAmbientSound(ctx, "traffic", profile.ambient.traffic);
      if (traffic) {
        traffic.setFilter(this._createLowpass(ctx, 800));
      }
    }

    // Nature: modulated sine waves (birds/wind)
    if (profile.ambient.nature > 0) {
      this._createAmbientSound(ctx, "nature", profile.ambient.nature);
    }

    // Urban: mid-range noise (pedestrian/city hum)
    if (profile.ambient.urban > 0) {
      const urban = this._createAmbientSound(ctx, "urban", profile.ambient.urban);
      if (urban) {
        urban.setFilter(this._createBandpass(ctx, 1000, 400));
      }
    }

    // Transit: low rumble noise
    if (profile.ambient.transit > 0) {
      const transit = this._createAmbientSound(ctx, "transit", profile.ambient.transit);
      if (transit) {
        transit.setFilter(this._createLowpass(ctx, 600));
      }
    }

    // Positional point sources
    for (const src of profile.point_sources) {
      if (src.type === "bus_stop") {
        const sound = this._createPositionalBusIdle(ctx, src.position, src.radius_m);
        if (sound) {
          this.positionalSounds.push(sound);
          this.scene.add(sound.parent!);
        }
      }
    }

    if (this.isPlaying) {
      this.play();
    }
  }

  play() {
    if (this.listener.context.state === "suspended") {
      this.listener.context.resume();
    }
    this.isPlaying = true;
    this.ambientSounds.forEach((sound) => {
      if (!sound.isPlaying) sound.play();
    });
    this.positionalSounds.forEach((sound) => {
      if (!sound.isPlaying) sound.play();
    });
  }

  stop() {
    this.isPlaying = false;
    this.ambientSounds.forEach((sound) => {
      if (sound.isPlaying) sound.stop();
    });
    this.positionalSounds.forEach((sound) => {
      if (sound.isPlaying) sound.stop();
    });
  }

  toggle(): boolean {
    if (this.isPlaying) {
      this.stop();
      return false;
    }
    this.play();
    return true;
  }

  dispose() {
    this.stop();
    this._clearAmbient();
    this._clearPositional();
    this.listener.context.close().catch(() => {});
  }

  private _clearAmbient() {
    this.ambientSounds.forEach((sound) => {
      sound.disconnect();
    });
    this.ambientSounds.clear();
  }

  private _clearPositional() {
    this.positionalSounds.forEach((sound) => {
      const parent = sound.parent;
      if (parent) this.scene.remove(parent);
      sound.disconnect();
    });
    this.positionalSounds = [];
  }

  private _createAmbientSound(
    ctx: AudioContext,
    type: string,
    intensity: number
  ): THREE.Audio | null {
    const buffer = this._generateAmbientBuffer(ctx, type);
    if (!buffer) return null;
    const sound = new THREE.Audio(this.listener);
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(this._computeVolume(intensity));
    sound.userData.baseVolume = intensity;
    this.ambientSounds.set(type, sound);
    return sound;
  }

  private _generateAmbientBuffer(ctx: AudioContext, type: string): AudioBuffer | null {
    const duration = 4.0;
    const sampleRate = ctx.sampleRate;
    const length = duration * sampleRate;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    if (type === "nature") {
      // Mix of gentle sine-like chirps and wind noise
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let v = 0;
        // Wind noise
        v += (Math.random() * 2 - 1) * 0.15;
        // Occasional bird chirp
        if (Math.random() < 0.001) {
          const freq = 2000 + Math.random() * 3000;
          for (let j = 0; j < sampleRate * 0.1 && i + j < length; j++) {
            const chirpT = j / sampleRate;
            data[i + j] += Math.sin(2 * Math.PI * freq * chirpT) * 0.3 * Math.exp(-chirpT * 20);
          }
        }
        data[i] = Math.max(-1, Math.min(1, v));
      }
    } else {
      // Pink-ish noise for traffic/urban/transit
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
        data[i] = Math.max(-1, Math.min(1, pink));
      }
    }

    return buffer;
  }

  private _createPositionalBusIdle(
    ctx: AudioContext,
    position: [number, number, number],
    radiusM: number
  ): THREE.PositionalAudio | null {
    const buffer = this._generateAmbientBuffer(ctx, "transit");
    if (!buffer) return null;
    const mesh = new THREE.Object3D();
    mesh.position.set(position[0], position[1], position[2]);
    const sound = new THREE.PositionalAudio(this.listener);
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setRefDistance(radiusM * 0.5);
    sound.setMaxDistance(radiusM * 2);
    sound.setRolloffFactor(1);
    sound.setVolume(this._computeVolume(0.6));
    sound.userData.baseVolume = 0.6;
    mesh.add(sound);
    return sound;
  }

  private _createLowpass(ctx: AudioContext, frequency: number): BiquadFilterNode {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    return filter;
  }

  private _createBandpass(ctx: AudioContext, frequency: number, Q: number): BiquadFilterNode {
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = Q;
    return filter;
  }
}
