import { useEffect, useState } from 'react'

import { GamepadSettings } from '../components/GamepadSettings'
import {
  ACTION_LABELS,
  COLORBLIND_NOTE_COLORS,
  DEFAULT_NOTE_COLORS,
  LANE_NAMES,
} from '../game/config'
import type { GameAction } from '../game/types'
import { useSettings } from '../hooks/useSettings'
import { settingsStore } from '../settings/SettingsStore'
import type { EffectsLevel, Settings } from '../settings/types'
import { keyLabel } from '../utils/format'

interface Props {
  onBack: () => void
}

const ACTIONS = Object.keys(ACTION_LABELS) as GameAction[]

export function SettingsScreen({ onBack }: Props) {
  const settings = useSettings()
  const [listening, setListening] = useState<GameAction | null>(null)

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

  const conflicts = findConflicts(settings.keyBindings)

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Configurações</h1>
          <div className="screen-subtitle">Salvas automaticamente neste navegador.</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn small ghost"
            onClick={() => {
              if (confirm('Restaurar todas as configurações padrão?')) settingsStore.reset()
            }}
          >
            <span>Restaurar padrão</span>
          </button>
          <button className="btn small" onClick={onBack}>
            <span>Voltar</span>
          </button>
        </div>
      </header>

      <div className="settings-body scroll">
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
            Este é o nome que aparecerá para os outros jogadores quando o multiplayer LAN chegar.
          </p>
        </section>

        <section className="panel settings-group">
          <h3>Gameplay</h3>
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
            label="Exigir palhetada (Espaço)"
            checked={settings.gameplay.requireStrum}
            onChange={(requireStrum) => settingsStore.update({ gameplay: { requireStrum } })}
          />
          <p className="note">
            Desligado (padrão): basta apertar o traste certo no tempo, sem palhetar. Ligado: a nota
            só conta com a palhetada, e palhetar no vazio quebra o combo.
          </p>
          <Toggle
            label="Cortar o instrumento ao errar"
            checked={settings.gameplay.muteOnMiss}
            onChange={(muteOnMiss) => settingsStore.update({ gameplay: { muteOnMiss } })}
          />
          <p className="note">
            A música toca completa, com todas as faixas. Quando você erra, só a faixa do
            instrumento escolhido some até o próximo acerto.
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

        <section className="panel settings-group">
          <h3>Controles (teclado)</h3>
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

        <GamepadSettings settings={settings} />

        <section className="panel settings-group">
          <h3>Visual</h3>
          <div className="field">
            <label>Cores das notas</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {settings.noteColors.map((color, lane) => (
                <input
                  key={lane}
                  type="color"
                  value={color}
                  title={LANE_NAMES[lane]}
                  aria-label={`Cor da lane ${LANE_NAMES[lane]}`}
                  onChange={(event) => settingsStore.setNoteColor(lane, event.target.value)}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

          <div className="field">
            <label htmlFor="effects">Nível de efeitos</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['low', 'medium', 'high'] as EffectsLevel[]).map((level) => (
                <button
                  key={level}
                  className={`btn small ${settings.visual.effects === level ? 'primary' : 'ghost'}`}
                  onClick={() => settingsStore.update({ visual: { effects: level } })}
                >
                  <span>{level === 'low' ? 'Baixo' : level === 'medium' ? 'Médio' : 'Alto'}</span>
                </button>
              ))}
            </div>
          </div>

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

        <section className="panel settings-group">
          <h3>Áudio</h3>
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
        </section>

        <section className="panel settings-group">
          <h3>Calibração</h3>
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
            Valor positivo = o jogo considera que o áudio está adiantado. Se você acerta no ritmo e
            o jogo marca atrasado, aumente. Fones bluetooth costumam precisar de 100 a 200 ms.
          </p>
        </section>
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
