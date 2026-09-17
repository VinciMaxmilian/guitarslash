import { useEffect, useState } from 'react'
import '../styles/riff-riot.css'
import { useUISounds } from '../hooks/useUISounds'
import { useSettings } from '../hooks/useSettings'
import type { MultiplayerSession } from '../game/useMultiplayer'

interface Props {
  mp: MultiplayerSession
  onBack: () => void
  onPickSong: () => void
  pickedSongId?: string
}

export function Lobby({ mp, onBack, onPickSong, pickedSongId }: Props) {
  const settings = useSettings()
  const [instrument, setInstrument] = useState('guitar')
  const [difficulty, setDifficulty] = useState('expert')
  const uiSounds = useUISounds()

  const isReady = mp.room?.players.find(p => p.name === (settings.profileName || 'Player'))?.ready

  useEffect(() => {
    if (!mp.room) return
    mp.setInstrument(instrument)
    mp.setDifficulty(difficulty)
  }, [mp.room, instrument, difficulty, mp.setInstrument, mp.setDifficulty])

  useEffect(() => {
    if (pickedSongId && mp.room && pickedSongId !== mp.room.songId) {
      mp.selectSong(pickedSongId, 'versus')
    }
  }, [pickedSongId, mp.room, mp.room?.songId, mp.selectSong])

  if (mp.error) {
    return (
      <div className="rr-screen screen-menu">
        <div className="error-box">ERROR: {mp.error}</div>
        <button className="btn" onClick={() => { uiSounds.play('back'); onBack() }}>Back</button>
      </div>
    )
  }

  if (!mp.room) {
    return <div className="rr-screen screen-menu"><div style={{color: '#fff', padding: 40}}>CONNECTING TO HOST...</div></div>
  }

  return (
    <div className="rr-screen screen-diff">
      <div className="diff-bg-1" />
      <div className="diff-bg-2" />
      
      <div className="diff-list-container" style={{top: 100, left: 100, gap: 20}}>
        <div style={{fontFamily: "'Archivo Black', sans-serif", fontSize: 40, color: '#3a2a18'}}>LAN LOBBY</div>
        
        <div style={{display: 'flex', gap: 20, flexWrap: 'wrap'}}>
          {mp.room.players.map(p => (
            <div key={p.id} style={{background: '#c7b899', border: '4px solid #5c4c3a', padding: 20, width: 200}}>
              <div style={{fontFamily: "'Archivo Black', sans-serif", fontSize: 24, color: '#2c2118'}}>{p.name}</div>
              <div style={{fontFamily: "'Archivo Black', sans-serif", fontSize: 16, color: p.ready ? '#2f9e4a' : '#c23a2c'}}>
                {p.ready ? 'READY' : 'NOT READY'}
              </div>
              <div style={{marginTop: 10, fontSize: 14, color: '#4a3a28'}}>
                {p.instrument || '???'} - {p.difficulty || '???'}
              </div>
            </div>
          ))}
        </div>

        <div style={{marginTop: 40, display: 'flex', gap: 20}}>
          <button className="btn primary" onClick={() => { uiSounds.play('select'); onPickSong() }}>PICK SONG: {mp.room.songId || 'NONE'}</button>
          
          <select value={instrument} onChange={e => {
            uiSounds.play('scroll')
            setInstrument(e.target.value)
          }} style={{padding: 10, fontFamily: "'Archivo Black', sans-serif"}}>
            <option value="guitar">GUITAR</option>
            <option value="bass">BASS</option>
            <option value="drums">DRUMS</option>
          </select>

          <select value={difficulty} onChange={e => {
            uiSounds.play('scroll')
            setDifficulty(e.target.value)
          }} style={{padding: 10, fontFamily: "'Archivo Black', sans-serif"}}>
            <option value="easy">EASY</option>
            <option value="medium">MEDIUM</option>
            <option value="hard">HARD</option>
            <option value="expert">EXPERT</option>
          </select>
        </div>
      </div>

      <div className="rr-control-bar">
        <div className="rr-control-hint" onClick={() => { uiSounds.play('select'); mp.setReady(!isReady) }} style={{cursor: 'pointer'}}>
          <div className="rr-key green" />
          <span className="rr-control-label">{isReady ? 'UNREADY' : 'READY UP'}</span>
        </div>
        <div className="rr-control-hint" onClick={() => { uiSounds.play('back'); onBack() }} style={{cursor: 'pointer'}}>
          <div className="rr-key red" />
          <span className="rr-control-label">LEAVE LOBBY</span>
        </div>
      </div>
    </div>
  )
}
