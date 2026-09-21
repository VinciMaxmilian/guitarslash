import { useEffect, useMemo, useRef, useState } from 'react'

import { ACTION_LABELS } from '../game/config'
import {
  GamepadManager,
  gamepadManager,
  type GamepadDeviceInfo,
  type GamepadLiveState,
} from '../game/GamepadManager'
import {
  DEFAULT_GAMEPAD_BINDINGS,
  bindingLabel,
  parseSignals,
  signalLabel,
} from '../game/gamepadProfiles'
import type { GameAction } from '../game/types'
import { settingsStore } from '../settings/SettingsStore'
import type { Settings } from '../settings/types'

interface Props {
  settings: Settings
}

const ACTIONS = Object.keys(ACTION_LABELS) as GameAction[]

/** O retrato ao vivo so precisa acompanhar o olho, nao o hardware. */
const LIVE_HZ = 20

type CalibrationStep = 'idle' | 'sampling'

export function GamepadSettings({ settings }: Props) {
  const config = settings.gamepad
  const [devices, setDevices] = useState<GamepadDeviceInfo[]>([])
  const [live, setLive] = useState<GamepadLiveState[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  /** Acao esperando um sinal, e se o sinal vai substituir ou somar. */
  const [listening, setListening] = useState<{ action: GameAction; mode: 'set' | 'add' } | null>(
    null,
  )
  const [step, setStep] = useState<CalibrationStep>('idle')
  const samplingCenter = useRef<number[]>([])

  // As configuracoes mandam no leitor: zona morta e calibracao tem que valer
  // ja no retrato ao vivo, senao o jogador ajusta no escuro.
  useEffect(() => {
    gamepadManager.configure(config)
  }, [config])

  useEffect(() => gamepadManager.onDevices(setDevices), [])

  useEffect(() => {
    let ultimo = 0
    return gamepadManager.onFrame((states) => {
      const agora = performance.now()
      if (agora - ultimo < 1000 / LIVE_HZ) return
      ultimo = agora
      setLive(states)
    })
  }, [])

  // O controle escolhido some ao desconectar: cai para o primeiro que sobrar.
  useEffect(() => {
    if (devices.length === 0) {
      setSelectedIndex(null)
      return
    }
    setSelectedIndex((atual) =>
      atual !== null && devices.some((d) => d.index === atual) ? atual : devices[0].index,
    )
  }, [devices])

  const selected = devices.find((d) => d.index === selectedIndex) ?? null
  const selectedLive = live.find((s) => s.device.index === selectedIndex) ?? null

  // Captura do proximo sinal para remapear.
  useEffect(() => {
    if (!listening) return
    return gamepadManager.onSignal(({ signal, pressed, deviceId }) => {
      if (!pressed) return
      if (config.deviceId && config.deviceId !== deviceId) return
      const atuais = parseSignals(config.bindings[listening.action])
      const proximos =
        listening.mode === 'add' && !atuais.includes(signal) ? [...atuais, signal] : [signal]
      settingsStore.setGamepadBinding(listening.action, proximos.join('|'))
      setListening(null)
    })
  }, [listening, config.bindings, config.deviceId])

  const conflicts = useMemo(() => findConflicts(config.bindings), [config.bindings])

  if (!GamepadManager.supported) {
    return (
      <section className="panel settings-group">
        <h3>Controle</h3>
        <p className="note">
          Este navegador não expõe a API de controles. Use um navegador baseado em Chromium ou o
          Firefox atualizado.
        </p>
      </section>
    )
  }

  const profile = selected?.identity.profile ?? 'generic'
  const standard = selected?.standard ?? false
  const calibrado = selected ? config.calibration[selected.id] : undefined

  const finishSampling = () => {
    if (selectedIndex === null || !selected) return
    const calibracao = gamepadManager.endAxisSampling(selectedIndex, samplingCenter.current)
    setStep('idle')
    if (calibracao) settingsStore.setGamepadCalibration(selected.id, calibracao)
  }

  return (
    <section className="panel settings-group">
      <h3>Controle (Joystick)</h3>

      <Toggle
        label="Aceitar controle"
        checked={config.enabled}
        onChange={(enabled) => settingsStore.update({ gamepad: { enabled } })}
      />

      {devices.length === 0 ? (
        <div className="pad-empty">
          Nenhum controle detectado. Conecte o controle e <strong>aperte qualquer botão</strong> —
          o navegador só revela o aparelho depois do primeiro toque.
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="pad-device">Controle</label>
            <select
              id="pad-device"
              value={selectedIndex ?? ''}
              onChange={(event) => setSelectedIndex(Number(event.target.value))}
            >
              {devices.map((device) => (
                <option key={device.index} value={device.index}>
                  {device.identity.label} — porta {device.index + 1}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <p className="note">
              <code>{selected.id}</code>
              <br />
              {selected.buttonCount} botões, {selected.axisCount} eixos.{' '}
              {standard
                ? 'Layout padronizado: os nomes dos botões são confiáveis.'
                : 'Layout não padronizado — os botões aparecem por número. Remapeie abaixo.'}
            </p>
          )}

          <Toggle
            label="Usar apenas este controle"
            checked={config.deviceId !== null}
            onChange={(exclusivo) =>
              settingsStore.update({
                gamepad: { deviceId: exclusivo && selected ? selected.id : null },
              })
            }
          />
          <p className="note">
            Desligado, qualquer controle conectado joga. Ligue se algum periférico estiver mandando
            sinais fantasma.
          </p>
        </>
      )}

      <div className="pad-subtitle">Mapeamento</div>
      {ACTIONS.map((action) => {
        const expr = config.bindings[action]
        const conflito = parseSignals(expr).some((s) => conflicts.has(s))
        const ouvindo = listening?.action === action
        return (
          <div className="binding-row" key={action}>
            <span style={{ fontSize: 13 }}>{ACTION_LABELS[action]}</span>
            <div className="pad-binding-actions">
              <button
                className={['key-cap', ouvindo ? 'listening' : '', conflito ? 'conflict' : ''].join(
                  ' ',
                )}
                onClick={() => setListening(ouvindo ? null : { action, mode: 'set' })}
                title="Trocar o vínculo"
              >
                {ouvindo ? 'aperte…' : bindingLabel(expr, profile, standard)}
              </button>
              <button
                className="btn tiny ghost"
                onClick={() => setListening({ action, mode: 'add' })}
                title="Adicionar uma alternativa"
              >
                <span>+</span>
              </button>
              <button
                className="btn tiny ghost"
                onClick={() => settingsStore.setGamepadBinding(action, '')}
                title="Remover o vínculo"
              >
                <span>×</span>
              </button>
            </div>
          </div>
        )
      })}

      {listening && (
        <div className="note">
          Aperte o botão ou mova o eixo que deve virar{' '}
          <strong>{ACTION_LABELS[listening.action]}</strong>.{' '}
          <button className="btn tiny ghost" onClick={() => setListening(null)}>
            <span>Cancelar</span>
          </button>
        </div>
      )}

      {conflicts.size > 0 && (
        <div className="error-box">
          O mesmo botão está em mais de uma ação. Corrija antes de jogar.
        </div>
      )}

      <button
        className="btn small ghost"
        onClick={() =>
          settingsStore.update({ gamepad: { bindings: { ...DEFAULT_GAMEPAD_BINDINGS } } })
        }
      >
        <span>Mapeamento padrão</span>
      </button>
      <p className="note">
        O <strong>+</strong> adiciona uma alternativa: a palhetada já vem em cima E embaixo do
        D-pad, como numa guitarra de verdade.
      </p>

      <div className="pad-subtitle">Sensibilidade</div>
      <Slider
        label="Zona morta dos sticks"
        value={config.deadzone}
        min={0}
        max={0.9}
        step={0.01}
        display={`${Math.round(config.deadzone * 100)}%`}
        onChange={(deadzone) => settingsStore.update({ gamepad: { deadzone } })}
      />
      <Slider
        label="Limiar do eixo"
        value={config.axisThreshold}
        min={0.15}
        max={0.95}
        step={0.01}
        display={`${Math.round(config.axisThreshold * 100)}%`}
        onChange={(axisThreshold) => settingsStore.update({ gamepad: { axisThreshold } })}
      />
      <p className="note">
        Zona morta ignora o tremor do stick parado. O limiar é a partir de quanto um eixo conta como
        botão apertado — abaixe se a palhetada no stick estiver escapando.
      </p>

      <Toggle
        label="Vibrar ao errar"
        checked={config.vibration}
        onChange={(vibration) => settingsStore.update({ gamepad: { vibration } })}
      />
      <button
        className="btn small ghost"
        disabled={selectedIndex === null}
        onClick={() => gamepadManager.rumble(0.7, 300, selectedIndex ?? undefined)}
      >
        <span>Testar vibração</span>
      </button>

      {selected && (
        <>
          <div className="pad-subtitle">Calibração e teste</div>
          <p className="note">
            {calibrado
              ? 'Este controle está calibrado. Refaça se o stick tiver folga nova.'
              : 'Sem calibração: os eixos estão sendo lidos como o navegador entrega.'}
          </p>

          <div className="pad-actions">
            <button
              className="btn small ghost"
              disabled={step === 'sampling'}
              onClick={() => {
                const center = gamepadManager.captureCenter(selected.index)
                if (!center) return
                settingsStore.setGamepadCalibration(selected.id, {
                  center,
                  range: calibrado?.range ?? new Array(center.length).fill(1),
                })
              }}
            >
              <span>Marcar centro</span>
            </button>

            {step === 'idle' ? (
              <button
                className="btn small"
                onClick={() => {
                  samplingCenter.current =
                    calibrado?.center ??
                    gamepadManager.captureCenter(selected.index) ??
                    new Array(selected.axisCount).fill(0)
                  gamepadManager.startAxisSampling(selected.index)
                  setStep('sampling')
                }}
              >
                <span>Calibrar amplitude</span>
              </button>
            ) : (
              <button className="btn small primary" onClick={finishSampling}>
                <span>Concluir</span>
              </button>
            )}

            <button
              className="btn small ghost"
              disabled={!calibrado}
              onClick={() => settingsStore.setGamepadCalibration(selected.id, null)}
            >
              <span>Limpar</span>
            </button>
          </div>

          {step === 'sampling' && (
            <div className="pad-hint">
              Gire os dois sticks até o fim, em círculo completo, e pressione os gatilhos. Depois
              clique em <strong>Concluir</strong>.
            </div>
          )}

          <PadMonitor state={selectedLive} device={selected} />
        </>
      )}
    </section>
  )
}

/** Retrato ao vivo: o jogador confere que o jogo enxerga o que ele aperta. */
function PadMonitor({
  state,
  device,
}: {
  state: GamepadLiveState | null
  device: GamepadDeviceInfo
}) {
  if (!state) {
    return <p className="note">Aperte um botão para ver a leitura ao vivo.</p>
  }

  return (
    <div className="pad-monitor">
      <div className="pad-dots">
        {state.buttons.map((valor, index) => (
          <span
            key={index}
            className={`pad-dot ${valor > 0.5 ? 'on' : ''}`}
            title={signalLabel(`b${index}`, device.identity.profile, device.standard)}
          >
            {index}
          </span>
        ))}
      </div>
      {state.axes.map((valor, index) => (
        <div className="axis-row" key={index}>
          <span className="axis-name">
            {signalLabel(`a${index}+`, device.identity.profile, device.standard).replace(
              /\s[→←↓↑]$/,
              '',
            )}
          </span>
          <div className="axis-meter">
            <span
              className="axis-meter-fill"
              style={{
                left: valor < 0 ? `${50 + valor * 50}%` : '50%',
                width: `${Math.abs(valor) * 50}%`,
              }}
            />
          </div>
          <span className="axis-value">{valor.toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

/** Sinais usados por mais de uma acao. */
export function findConflicts(bindings: Record<GameAction, string>): Set<string> {
  const vistos = new Map<string, number>()
  for (const expr of Object.values(bindings)) {
    // Um sinal repetido DENTRO da mesma acao nao e conflito, so redundancia.
    for (const signal of new Set(parseSignals(expr))) {
      vistos.set(signal, (vistos.get(signal) ?? 0) + 1)
    }
  }
  return new Set([...vistos.entries()].filter(([, n]) => n > 1).map(([signal]) => signal))
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
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}
