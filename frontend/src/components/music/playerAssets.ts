/** Картинки плеера (набор владельца, `assets/player/`): кнопки, иконки, обложки по умолчанию и стикеры Юны с котиком. */
import play from '@/assets/player/control_play.webp'
import pause from '@/assets/player/control_pause.webp'
import next from '@/assets/player/control_next_track.webp'
import prev from '@/assets/player/control_previous_track.webp'
import shuffle from '@/assets/player/control_shuffle.webp'
import repeat from '@/assets/player/control_repeat.webp'
import volume from '@/assets/player/control_volume.webp'
import mute from '@/assets/player/control_mute.webp'
import more from '@/assets/player/control_more.webp'
import add from '@/assets/player/control_add.webp'
import equalizer from '@/assets/player/control_equalizer.webp'
import note from '@/assets/player/icon_music_note.webp'
import close from '@/assets/player/icon_close.webp'
import playlist from '@/assets/player/icon_playlist.webp'
import vinyl from '@/assets/player/vinyl_music_decor.webp'
import cat from '@/assets/player/character_21.webp'
import sleepCat from '@/assets/player/character_17.webp'
import sakura from '@/assets/player/cover_sakura_city.webp'
import namsan from '@/assets/player/cover_namsan_tower.webp'
import palace from '@/assets/player/cover_seoul_palace.webp'
import moon from '@/assets/player/cover_moon_sakura.webp'
import sunset from '@/assets/player/cover_sunset.webp'

export const PLAYER_IMG = { play, pause, next, prev, shuffle, repeat, volume, mute, more, add, equalizer, note, close, playlist, vinyl, cat, sleepCat }

/** Обложки для песен без своей картинки: выбираются по id песни, чтобы у каждой был свой вид и он не менялся. */
export const COVERS = [sakura, namsan, palace, moon, sunset]
export const coverFor = (id: string) => COVERS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % COVERS.length]!

/** 83 → «1:23», 3725 → «1:02:05». */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}
