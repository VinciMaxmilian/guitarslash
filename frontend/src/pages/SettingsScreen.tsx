import { useEffect, useState } from 'react'

import { GamepadSettings } from '../components/GamepadSettings'
import {
  ACTION_LABELS,
  COLORBLIND_NOTE_COLORS,
  DEFAULT_NOTE_COLORS,
  LANE_NAMES,
} from '../game/config'
import type { GameAction } from '../game/types'
import { useSettings, useSettingsDirty } from '../hooks/useSettings'
import { useUISounds } from '../hooks/useUISounds'
import { settingsStore } from '../settings/SettingsStore'
import type { EffectsLevel, Settings } from '../settings/types'
import { keyLabel } from '../utils/format'

interface Props {
  onBack: () => void
}

const ACTIONS = Object.keys(ACTION_LABELS) as GameAction[]

type TabId = 'jogo' | 'teclado' | 'controle' | 'video' | 'audio' | 'calibracao'

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'jogo', label: 'Jogo', hint: 'Nome, velocidade e regras da partida' },
  { id: 'teclado', label: 'Teclado', hint: 'Trastes, palhetada e star power' },
  { id: 'controle', label: 'Controle', hint: 'Joystick, mapeamento e calibração' },
  { id: 'video', label: 'Vídeo', hint: 'Cores das notas, efeitos e fundo' },
  { id: 'audio', label: 'Áudio', hint: 'Volumes de cada faixa' },
  { id: 'calibracao', label: 'Sincronia', hint: 'Atraso do áudio e do vídeo' },
]

export function SettingsScreen({ onBack }: Props) {
  const settings = useSettings()
  const dirty = useSettingsDirty()
  const uiSounds = useUISounds()
  const [tab, setTab] = useState<TabId>('jogo')
  const [listening, setListening] = useState<GameAction | null>(null)
  /** Some sozinho: o aviso de "salvo" nao precisa de botao para fechar. */
  const [salvo, setSalvo] = useState(false)

  /**
   * Abre o rascunho enquanto a tela existir.
   *
   * O que o jogador mexe vale na memoria na hora (da para ouvir o volume e ver
   * a cor da nota), mas so vai para o disco no SALVAR. Sair sem salvar
   * descarta - e o que o `endEdit` da limpeza faz.
   */
  useEffect(() => {
    settingsStore.beginEdit()
    return () => {
      settingsStore.endEdit()
    }
  }, [])

  // Captura da proxima tecla para remapear.
  useEffect(() => {
    if (!listening) return

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      if (event.code !== 'Escape' || listening === 'pause') {
        settingsStore.setBinding(listening, event.code)
      }
      setListening(null)
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [listening])

  useEffect(() => {
    if (!salvo) return
    const timer = window.setTimeout(() => setSalvo(false), 2200)
    return () => window.clearTimeout(timer)
  }, [salvo])

  // Mexer em qualquer coisa apaga o aviso: ele diz respeito ao que foi
  // gravado, nao ao que esta na tela agora.
  useEffect(() => {
    if (dirty) setSalvo(false)
  }, [dirty])

  const conflicts = findConflicts(settings.keyBindings)

  const salvar = () => {
    settingsStore.save()
    uiSounds.play('select')
    setSalvo(true)
  }

  const voltar = () => {
    if (dirty && !confirm('Há alterações não salvas. Sair e descartar?')) return
    uiSounds.play('back')
    onBack()
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Configurações</h1>
          <div className="screen-subtitle">{TABS.find((t) => t.id === tab)?.hint}</div>
        </div>
        <div className="settings-actions">
          {salvo && <span className="settings-saved">Salvo ✓</span>}
          {dirty && <span className="settings-badge">alterações não salvas</span>}
          <button className="btn small ghost" disabled={!dirty} onClick={() => settingsStore.discard()}>
            <span>Descartar</span>
          </button>
          <button className="btn small primary" disabled={!dirty} onClick={salvar}>
            <span>Salvar</span>
          </button>
          <button className="btn small" onClick={voltar}>
            <span>Voltar</span>
          </button>
        </div>
      </header>

      <nav className="settings-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={`settings-tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => {
              if (item.id !== tab) uiSounds.play('scroll')
              setTab(item.id)
            }}
          >
            {item.label}
          </button>
        ))}
        <button
          className="btn tiny ghost settings-reset"
          onClick={() => {
            if (confirm('Restaurar todas as configurações padrão?')) settingsStore.reset()
          }}
        >
          <span>Restaurar padrão</span>
        </button>
      </nav>

      <div className="settings-body scroll">
        {tab === 'jogo' && (
          <>
            <section className="panel settings-group">
              <h3>Perfil</h3>
              <div className="field">
                <label htmlFor="profile-name">Nome do jogador</label>
                <input
                  id="profile-name"
                  type="text"
                  value={settings.profileName}
                  maxLength={24}
                  onChange={(event) => settingsStore.update({ profileName: event.target.value })}
                />
              </div>
              <p className="note">
                É o nome que os outros jogadores veem no lobby e no placar do multiplayer.
              </p>
            </section>

            <section className="panel settings-group">
              <h3>Partida</h3>
              <Slider
                label="Velocidade das notas"
                value={settings.gameplay.noteSpeed}
                min={1}
                max={10}
                step={1}
                display={String(settings.gameplay.noteSpeed)}
                onChange={(noteSpeed) => settingsStore.update({ gameplay: { noteSpeed } })}
              />
              <Toggle
                label="Exigir palhetada"
                checked={settings.gameplay.requireStrum}
                onChange={(requireStrum) => settingsStore.update({ gameplay: { requireStrum } })}
              />
              <p className="note">
                Desligado (padrão): basta apertar o traste certo no tempo. Ligado: a nota só conta
                com a palhetada, e palhetar no vazio quebra o combo.
              </p>
              <Toggle
                label="Cortar o instrumento ao errar"
                checked={settings.gameplay.muteOnMiss}
                onChange={(muteOnMiss) => settingsStore.update({ gameplay: { muteOnMiss } })}
              />
              <p className="note">
                A música toca completa. Quando você erra, só a faixa do instrumento escolhido some,
                até o próximo acerto.
              </p>
              <Toggle
                label="Canhoto (inverter lanes)"
                checked={settings.gameplay.leftyFlip}
                onChange={(leftyFlip) => settingsStore.update({ gameplay: { leftyFlip } })}
              />
              <Toggle
                label="Som na palhetada"
                checked={settings.gameplay.hitSounds}
                onChange={(hitSounds) => settingsStore.update({ gameplay: { hitSounds } })}
              />
              <Toggle
                label="Mostrar FPS"
                checked={settings.gameplay.showFps}
                onChange={(showFps) => settingsStore.update({ gameplay: { showFps } })}
              />
            </section>
          </>
        )}

        {tab === 'teclado' && (
          <section className="panel settings-group">
            <h3>Mapeamento do teclado</h3>
            {ACTIONS.map((action) => {
              const code = settings.keyBindings[action]
              return (
                <div className="binding-row" key={action}>
                  <span style={{ fontSize: 13 }}>{ACTION_LABELS[action]}</span>
                  <button
                    className={[
                      'key-cap',
                      listening === action ? 'listening' : '',
                      conflicts.has(code) ? 'conflict' : '',
                    ].join(' ')}
                    onClick={() => setListening(action)}
                  >
                    {listening === action ? 'pressione…' : keyLabel(code)}
                  </button>
                </div>
              )
            })}
            {conflicts.size > 0 && (
              <div className="error-box">
                Há teclas repetidas no mapeamento. Corrija antes de jogar.
              </div>
            )}
            <p className="note">
              O mapeamento usa a POSIÇÃO física da tecla, então funciona igual em ABNT2 e US.
            </p>
          </section>
        )}

        {tab === 'controle' && <GamepadSettings settings={settings} />}

        {tab === 'video' && (
          <>
            <section className="panel settings-group">
              <h3>Cores das notas</h3>
              <div className="color-row">
                {settings.noteColors.map((color, lane) => (
                  <label className="color-chip" key={lane}>
                    <input
                      type="color"
                      value={color}
                      title={LANE_NAMES[lane]}
                      aria-label={`Cor da lane ${LANE_NAMES[lane]}`}
                      onChange={(event) => settingsStore.setNoteColor(lane, event.target.value)}
                    />
                    <span>{LANE_NAMES[lane]}</span>
                  </label>
                ))}
              </div>
              <div className="button-row">
                <button
                  className="btn small ghost"
                  onClick={() => settingsStore.update({ noteColors: [...DEFAULT_NOTE_COLORS] })}
                >
                  <span>Cores padrão</span>
                </button>
                <button
                  className="btn small ghost"
                  onClick={() => settingsStore.update({ noteColors: [...COLORBLIND_NOTE_COLORS] })}
                >
                  <span>Preset daltonismo</span>
                </button>
              </div>
            </section>

            <section className="panel settings-group">
              <h3>Efeitos e fundo</h3>
              <div className="field">
                <label>Nível de efeitos</label>
                <div className="button-row">
                  {(['low', 'medium', 'high'] as EffectsLevel[]).map((level) => (
                    <button
                      key={level}
                      className={`btn small ${
                        settings.visual.effects === level ? 'primary' : 'ghost'
                      }`}
                      onClick={() => settingsStore.update({ visual: { effects: level } })}
                    >
                      <span>
                        {level === 'low' ? 'Baixo' : level === 'medium' ? 'Médio' : 'Alto'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="note">
                Baixo desliga brilho e faíscas. Use se a highway estiver engasgando.
              </p>
              <Slider
                label="Opacidade do vídeo de fundo"
                value={settings.visual.videoOpacity}
                min={0}
                max={1}
                step={0.05}
                display={`${Math.round(settings.visual.videoOpacity * 100)}%`}
                onChange={(videoOpacity) => settingsStore.update({ visual: { videoOpacity } })}
              />
              <Slider
                label="Brilho do vídeo de fundo"
                value={settings.visual.videoBrightness}
                min={0.1}
                max={1.5}
                step={0.05}
                display={settings.visual.videoBrightness.toFixed(2)}
                onChange={(videoBrightness) => settingsStore.update({ visual: { videoBrightness } })}
              />
            </section>
          </>
        )}

        {tab === 'audio' && (
          <section className="panel settings-group">
            <h3>Volumes</h3>
            {(
              [
                ['master', 'Volume geral'],
                ['music', 'Música'],
                ['effects', 'Efeitos'],
                ['video', 'Áudio do vídeo'],
                ['preview', 'Preview na seleção'],
              ] as const
            ).map(([key, label]) => (
              <Slider
                key={key}
                label={label}
                value={settings.volumes[key]}
                min={0}
                max={1}
                step={0.05}
                display={`${Math.round(settings.volumes[key] * 100)}%`}
                onChange={(value) =>
                  settingsStore.update({ volumes: { [key]: value } as Partial<Settings['volumes']> })
                }
              />
            ))}
            <p className="note">
              O volume muda na hora, enquanto você arrasta — mas só fica guardado depois de salvar.
            </p>
          </section>
        )}

        {tab === 'calibracao' && (
          <section className="panel settings-group">
            <h3>Sincronia</h3>
            <Slider
              label="Offset de áudio"
              value={settings.calibration.audioOffsetMs}
              min={-300}
              max={300}
              step={5}
              display={`${settings.calibration.audioOffsetMs} ms`}
              onChange={(audioOffsetMs) => settingsStore.update({ calibration: { audioOffsetMs } })}
            />
            <Slider
              label="Offset de vídeo"
              value={settings.calibration.videoOffsetMs}
              min={-300}
              max={300}
              step={5}
              display={`${settings.calibration.videoOffsetMs} ms`}
              onChange={(videoOffsetMs) => settingsStore.update({ calibration: { videoOffsetMs } })}
            />
            <p className="note">
              Valor positivo = o jogo considera que o áudio está adiantado. Se você acerta no ritmo
              e o jogo marca atrasado, aumente. Fones bluetooth costumam precisar de 100 a 200 ms.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <div className="field">
      <div className="field-row">
        <label>{label}</label>
        <span className="value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

/** Codigos usados por mais de uma acao. */
function findConflicts(bindings: Record<GameAction, string>): Set<string> {
  const seen = new Map<string, number>()
  for (const code of Object.values(bindings)) {
    seen.set(code, (seen.get(code) ?? 0) + 1)
  }
  return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([code]) => code))
}
