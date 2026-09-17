import { useEffect, useRef, useState } from 'react'
import '../styles/riff-riot.css'
import { useUISounds } from '../hooks/useUISounds'
import type { MultiplayerSession } from '../game/useMultiplayer'
import type { MPPlayer } from '../game/multiplayerProtocol'

interface Props {
  mp: MultiplayerSession
  onBack: () => void
  onPickSong: () => void
  /** Musica escolhida na tela de selecao; sO o host consegue aplicar. */
  pickedSongId?: string
}

const INSTRUMENTS = [
  { value: 'guitar', label: 'GUITAR' },
  { value: 'bass', label: 'BASS' },
  { value: 'drums', label: 'DRUMS' },
]

const DIFFICULTIES = [
  { value: 'easy', label: 'EASY' },
  { value: 'medium', label: 'MEDIUM' },
  { value: 'hard', label: 'HARD' },
  { value: 'expert', label: 'EXPERT' },
]

export function Lobby({ mp, onBack, onPickSong, pickedSongId }: Props) {
  const [instrument, setInstrument] = useState('guitar')
  const [difficulty, setDifficulty] = useState('expert')
  const uiSounds = useUISounds()

  const room = mp.room
  const me = mp.self()
  const sentSong = useRef<string | null>(null)

  // Manda a escolha local quando ELA muda, nao quando o ROOM_STATE chega.
  // Reagir ao ROOM_STATE criava um pingue-pongue: estado chega -> reenvia
  // escolha -> host rebroadcasta -> reenvia de novo, sem parar.
  useEffect(() => {
    if (mp.connection !== 'connected') return
    mp.setInstrument(instrument)
  }, [instrument, mp.connection, mp.setInstrument])

  useEffect(() => {
    if (mp.connection !== 'connected') return
    mp.setDifficulty(difficulty)
  }, [difficulty, mp.connection, mp.setDifficulty])

  // A musica escolhida na outra tela entra uma vez sO. `sentSong` impede o
  // reenvio a cada ROOM_STATE quando o host ainda nao confirmou.
  useEffect(() => {
    if (!pickedSongId || !mp.isHost) return
    if (sentSong.current === pickedSongId || room?.songId === pickedSongId) return
    sentSong.current = pickedSongId
    mp.selectSong(pickedSongId)
  }, [pickedSongId, mp.isHost, room?.songId, mp.selectSong])

  if (mp.error?.fatal) {
    return (
      <div className="rr-screen screen-menu">
        <div className="lobby-error">
          <div className="lobby-error-code">{mp.error.code}</div>
          <div>{mp.error.message}</div>
        </div>
        <button className="btn" onClick={() => { uiSounds.play('back'); onBack() }}>
          <span>Voltar</span>
        </button>
      </div>
    )
  }

  if (!room || !me) {
    const texto =
      mp.connection === 'reconnecting'
        ? 'RECONECTANDO AO HOST...'
        : mp.connection === 'failed'
          ? 'O HOST SAIU DO AR.'
          : 'CONECTANDO AO HOST...'
    return (
      <div className="rr-screen screen-menu">
        <div className="lobby-connecting">{texto}</div>
        <button className="btn" onClick={() => { uiSounds.play('back'); onBack() }}>
          <span>Voltar</span>
        </button>
      </div>
    )
  }

  const loading = room.phase === 'loading'
  const playing = room.phase === 'playing'
  const duplicados = new Set(
    room.players
      .filter((p) => !p.spectator)
      .map((p) => p.instrument)
      .filter((value, index, all) => value && all.indexOf(value) !== index) as string[],
  )

  return (
    <div className="rr-screen screen-diff">
      <div className="diff-bg-1" />
      <div className="diff-bg-2" />

      <div className="lobby">
        <div className="lobby-header">
          <div className="lobby-title">LAN LOBBY</div>
          <div className="lobby-status">
            <span className={`lobby-dot ${mp.connection}`} />
            {room.players.length}/{room.maxPlayers} jogadores
            {mp.clockReady ? ` · ${mp.rttMs} ms` : ' · sincronizando relogio'}
          </div>
        </div>

        {mp.error && !mp.error.fatal && (
          <div className="lobby-warning">{mp.error.message}</div>
        )}

        {/* Duas maquinas tocando a mesma musica alto na mesma sala viram eco:
            qualquer desvio de alguns ms fica audivel. */}
        <div className="lobby-note">
          Na mesma sala? Use fones, ou deixe o volume alto so no host.
        </div>

        <div className="lobby-players">
          {room.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isSelf={player.id === mp.selfId}
              showLoad={loading || playing}
              conflito={!!player.instrument && duplicados.has(player.instrument)}
            />
          ))}
          {Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }).map(
            (_, index) => (
              <div key={`vazio-${index}`} className="lobby-card empty">
                AGUARDANDO
              </div>
            ),
          )}
        </div>

        <div className="lobby-controls">
          <button
            className="btn primary"
            disabled={!mp.isHost || loading || playing}
            title={mp.isHost ? undefined : 'So o host escolhe a musica'}
            onClick={() => { uiSounds.play('select'); onPickSong() }}
          >
            <span>MUSICA: {room.songId ?? 'NENHUMA'}</span>
          </button>

          <label className="lobby-field">
            MODO
            <select
              value={room.mode}
              disabled={!mp.isHost || loading || playing}
              onChange={(event) => {
                uiSounds.play('scroll')
                mp.setMode(event.target.value)
              }}
            >
              <option value="versus">VERSUS</option>
              <option value="coop">CO-OP</option>
            </select>
          </label>

          <label className="lobby-field">
            INSTRUMENTO
            <select
              value={instrument}
              disabled={loading || playing}
              onChange={(event) => {
                uiSounds.play('scroll')
                setInstrument(event.target.value)
              }}
            >
              {INSTRUMENTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="lobby-field">
            DIFICULDADE
            <select
              value={difficulty}
              disabled={loading || playing}
              onChange={(event) => {
                uiSounds.play('scroll')
                setDifficulty(event.target.value)
              }}
            >
              {DIFFICULTIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {room.mode === 'versus' &&
          new Set(
            room.players.filter((p) => !p.spectator && p.difficulty).map((p) => p.difficulty),
          ).size > 1 && (
            <div className="lobby-warning">
              Dificuldades diferentes: os scores nao sao comparaveis.
            </div>
          )}

        {loading && <div className="lobby-note">Baixando a musica do host...</div>}
        {me.spectator && (
          <div className="lobby-warning">
            A partida ja comecou. Voce entra na proxima musica.
          </div>
        )}
      </div>

      <div className="rr-control-bar">
        <div
          className="rr-control-hint"
          onClick={() => {
            if (loading || playing || me.spectator) return
            uiSounds.play('select')
            mp.setReady(!me.ready)
          }}
          style={{ cursor: loading || playing ? 'default' : 'pointer' }}
        >
          <div className="rr-key green" />
          <span className="rr-control-label">{me.ready ? 'CANCELAR' : 'ESTOU PRONTO'}</span>
        </div>
        {mp.isHost && room.phase === 'results' && (
          <div
            className="rr-control-hint"
            onClick={() => { uiSounds.play('select'); mp.returnToLobby() }}
            style={{ cursor: 'pointer' }}
          >
            <div className="rr-key yellow" />
            <span className="rr-control-label">NOVA PARTIDA</span>
          </div>
        )}
        <div
          className="rr-control-hint"
          onClick={() => { uiSounds.play('back'); onBack() }}
          style={{ cursor: 'pointer' }}
        >
          <div className="rr-key red" />
          <span className="rr-control-label">SAIR DO LOBBY</span>
        </div>
      </div>
    </div>
  )
}

function PlayerCard({
  player,
  isSelf,
  showLoad,
  conflito,
}: {
  player: MPPlayer
  isSelf: boolean
  showLoad: boolean
  conflito: boolean
}) {
  const estado = !player.connected
    ? { texto: 'CAIU', cls: 'off' }
    : player.spectator
      ? { texto: 'ASSISTINDO', cls: 'idle' }
      : player.ready
        ? { texto: 'PRONTO', cls: 'on' }
        : { texto: 'NAO PRONTO', cls: 'off' }

  return (
    <div className={`lobby-card ${isSelf ? 'self' : ''}`}>
      <div className="lobby-card-name">
        {player.name}
        {player.isHost && <span className="lobby-badge">HOST</span>}
        {isSelf && <span className="lobby-badge you">VOCE</span>}
      </div>
      <div className={`lobby-card-state ${estado.cls}`}>{estado.texto}</div>
      <div className="lobby-card-meta">
        {player.instrument ?? '???'} · {player.difficulty ?? '???'}
        {conflito && <span className="lobby-badge warn">REPETIDO</span>}
      </div>
      {showLoad && !player.spectator && (
        <div className="lobby-load">
          <div
            className="lobby-load-fill"
            style={{ width: `${Math.round(player.loadProgress * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
